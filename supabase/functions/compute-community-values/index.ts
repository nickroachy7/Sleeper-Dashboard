/**
 * compute-community-values
 *
 * The community value engine. Runs on a 15-min cron. Steps:
 *   1. Ingest recent Sleeper trades (players + draft picks) into value_events,
 *      stamped with the trade's REAL date and deduped on transaction_id.
 *   2. Read unprocessed value_events, turn them into Glicko-2 matches. Players
 *      and picks share one rating scale, so a "player for 2029 1st" trade rates
 *      the pick directly against the player.
 *   3. Update Glicko ratings for every asset (players AND picks).
 *   4. Re-derive the display board: players → player_values (unchanged scale),
 *      picks → pick_values by mapping each pick's rating onto the player value
 *      curve, then expanded into Early/Mid/Late tiers.
 *   5. Mark events processed.
 *
 * Recency: real trades are weighted by age (exp decay, ~120-day half-life,
 * ignored past ~2 years) so a stale trade barely moves anything. Votes are
 * always "now" and are not decayed. Real trades are also scored at their
 * expected value (confidence-only); only votes move the ranking.
 */

import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase-client.ts";
import { updateRating, type Rating, type Match } from "../_shared/glicko.ts";

const KIND_WEIGHT: Record<string, number> = { trade: 3, calculator: 1.5, pairwise: 1, ranking: 1 };
const HALFLIFE_DAYS = 120;     // a 4-month-old trade counts half
const TRADE_CUTOFF_DAYS = 730; // ignore trades older than ~2 years
const TIER_MULT: Record<string, number> = { Early: 1.28, Mid: 1.0, Late: 0.78 };

// IDP players are ranked on their OWN display curve so they never push offensive
// players down the shared board. Top IDP ≈ 5000 (a startable RB2/WR2 in a
// balanced IDP league). Must match scripts/seed-idp-prior.ts.
const IDP_MAX = 5000;
const IDP_CURVE_REF = 525;
const idpValueForRank = (i: number) => Math.max(1, Math.round(IDP_MAX * Math.exp(-3.1 * (i / IDP_CURVE_REF))));
const IDP_POSITIONS = new Set([
  "DL", "DE", "DT", "NT", "EDGE", "LB", "ILB", "OLB", "MLB", "DB", "CB", "S", "SS", "FS",
]);

// deno-lint-ignore no-explicit-any
type Json = any;

interface EventRow {
  id: string; kind: string; side_a: Json; side_b: Json;
  outcome: number; weight: number; created_at: string;
}
interface PlayerRating { player_id: string; rating: number; rd: number; volatility: number; matches: number; }
interface PickRating { pick_key: string; pick_year: number; pick_round: number; rating: number; rd: number; volatility: number; matches: number; }

/** Unified asset rating, keyed 'p:{player_id}' or 'k:{year}-{round}'. */
interface Asset { ref: string; rating: number; rd: number; volatility: number; matches: number; }

const playerRef = (id: string) => `p:${id}`;
const pickRef = (key: string) => `k:${key}`;

/** Pull asset refs out of a side: [{player_id}], [{pick:'2029-1'}]. */
function assetsOf(side: Json): string[] {
  if (!Array.isArray(side)) return [];
  const out: string[] = [];
  for (const a of side) {
    if (typeof a?.player_id === "string") out.push(playerRef(a.player_id));
    else if (typeof a?.pick === "string") out.push(pickRef(a.pick));
  }
  return out;
}

// ── Rank → value curve (players; picks interpolate onto it) ──────────────────
// Two-segment "dynasty board" shape, tuned so VALUE GAPS encode trade fairness:
//   • Steep exponential HEAD (top ~KNEE ranks): elites genuinely tower, so
//     consolidating two starters into one star reads as a fair trade rather
//     than a fleece of the star side.
//   • Gentler power-decay TAIL (knee → floor): deep/rosterable players stay
//     spread out and distinguishable instead of all bunching at the floor.
// A single exponential can't do both (steep enough for the top crushes the
// tail), which is why the curve is piecewise.
//
// rankIdx is 0-BASED (0 = #1 overall). MUST stay byte-identical to the seed's
// copy in dashboard/scripts/lib/prior.ts so seeded history and live values sit
// on one scale.
const CURVE_TOP = 9999;   // value of the #1 asset
const CURVE_KNEE = 60;    // head/tail boundary (0-based: ranks 1..60 are "head")
const CURVE_FLOOR = 200;  // asymptotic value the tail approaches at the bottom
const CURVE_TOTAL = 1000; // reference board size (fixed, not pool-dependent)
const CURVE_K_HEAD = 22;  // head steepness
const CURVE_TAIL_POW = 2.2; // tail curvature (higher = flatter near the knee)
function valueForRank(rankIdx: number): number {
  const kneeVal = CURVE_TOP * Math.exp((-CURVE_K_HEAD * (CURVE_KNEE - 1)) / CURVE_TOTAL);
  if (rankIdx < CURVE_KNEE) {
    return Math.max(1, Math.round(CURVE_TOP * Math.exp((-CURVE_K_HEAD * rankIdx) / CURVE_TOTAL)));
  }
  // Clamp to [0,1] so boards larger than CURVE_TOTAL floor out cleanly rather
  // than producing NaN (pow of a negative base to a fractional exponent).
  const t = Math.min(1, (rankIdx - CURVE_KNEE) / (CURVE_TOTAL - CURVE_KNEE));
  return Math.max(1, Math.round(CURVE_FLOOR + (kneeVal - CURVE_FLOOR) * Math.pow(1 - t, CURVE_TAIL_POW)));
}

const ordinal = (r: number) => (r === 1 ? "1st" : r === 2 ? "2nd" : r === 3 ? "3rd" : `${r}th`);

function expectedScore(playerRating: number, opp: { rating: number; rd: number }): number {
  const SC = 173.7178;
  const mu = (playerRating - 1500) / SC;
  const muO = (opp.rating - 1500) / SC;
  const phiO = opp.rd / SC;
  const g = 1 / Math.sqrt(1 + (3 * phiO * phiO) / (Math.PI * Math.PI));
  return 1 / (1 + Math.exp(-g * (mu - muO)));
}

async function fetchAll<T>(supabase: ReturnType<typeof createServiceClient>, table: string, columns: string): Promise<T[]> {
  const pageSize = 1000; const all: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;
    all.push(...(data as T[]));
    if (data.length < pageSize) break;
  }
  return all;
}

/** Step 1 — new Sleeper trades → value_events, stamped with the trade date. */
async function ingestTrades(supabase: ReturnType<typeof createServiceClient>): Promise<number> {
  const { data: trades, error } = await supabase
    .from("transactions")
    .select("transaction_id, type, status, adds, draft_picks, created, league_id")
    .eq("type", "trade").eq("status", "complete")
    .order("created", { ascending: false }).limit(500);
  if (error) throw error;
  if (!trades?.length) return 0;

  const rows: Json[] = [];
  for (const t of trades) {
    // Group everything each roster RECEIVED. adds: {player_id: roster_id};
    // draft_picks[].owner_id is the receiving roster.
    const byRoster = new Map<number, Json[]>();
    const push = (rid: number, asset: Json) => {
      const arr = byRoster.get(rid) ?? []; arr.push(asset); byRoster.set(rid, arr);
    };
    for (const [pid, rid] of Object.entries((t.adds ?? {}) as Record<string, number>)) {
      push(rid, { player_id: pid });
    }
    for (const dp of (t.draft_picks ?? []) as Json[]) {
      if (dp?.owner_id != null && dp?.season && dp?.round != null) {
        push(dp.owner_id, { pick: `${dp.season}-${dp.round}` });
      }
    }
    const sides = [...byRoster.values()];
    if (sides.length !== 2) continue; // pairwise engine handles 2-side trades
    const created = typeof t.created === "number" ? new Date(t.created).toISOString() : new Date().toISOString();
    rows.push({
      kind: "trade", side_a: sides[0], side_b: sides[1],
      outcome: 0.5, weight: KIND_WEIGHT.trade,
      league_id: t.league_id, source_ref: t.transaction_id, format_sf: true,
      created_at: created,
    });
  }
  if (!rows.length) return 0;
  const { error: insErr } = await supabase.from("value_events")
    .upsert(rows, { onConflict: "source_ref", ignoreDuplicates: true });
  if (insErr) throw insErr;
  return rows.length;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  try {
    const startTime = Date.now();
    const supabase = createServiceClient();
    const tradesIngested = await ingestTrades(supabase);

    // Step 2 — load events + both rating tables into one asset map.
    const { data: events, error: evErr } = await supabase
      .from("value_events").select("id, kind, side_a, side_b, outcome, weight, created_at")
      .is("processed_at", null).limit(5000);
    if (evErr) throw evErr;

    const playerRows = await fetchAll<PlayerRating>(supabase, "community_ratings", "player_id, rating, rd, volatility, matches");
    const pickRows = await fetchAll<PickRating>(supabase, "community_pick_ratings", "pick_key, pick_year, pick_round, rating, rd, volatility, matches");

    // Position map to split the display board (offense vs IDP). Ratings stay
    // unified; only the rank→value mapping differs by class.
    const posRows = await fetchAll<{ player_id: string; position: string | null }>(supabase, "players", "player_id, position");
    const positionById = new Map(posRows.map((p) => [p.player_id, (p.position ?? "").toUpperCase()]));
    const isIdpPlayer = (ref: string) => IDP_POSITIONS.has(positionById.get(ref.slice(2)) ?? "");

    const assets = new Map<string, Asset>();
    for (const r of playerRows) assets.set(playerRef(r.player_id), { ref: playerRef(r.player_id), rating: r.rating, rd: r.rd, volatility: r.volatility, matches: r.matches });
    for (const r of pickRows) assets.set(pickRef(r.pick_key), { ref: pickRef(r.pick_key), rating: r.rating, rd: r.rd, volatility: r.volatility, matches: r.matches });
    // Only assets that already exist in the rating tables are on the board:
    // active players (the seed drops retired names) + seeded future picks. A
    // trade referencing anyone/anything outside this set (a retired player, an
    // already-used pick) is dropped rather than resurrected at a default rating.
    const validRefs = new Set(assets.keys());

    const DEFAULT: Asset = { ref: "", rating: 1500, rd: 350, volatility: 0.06, matches: 0 };
    const get = (ref: string): Asset => assets.get(ref) ?? { ...DEFAULT, ref };
    const bump = (ref: string) => { if (!assets.has(ref)) assets.set(ref, { ...DEFAULT, ref }); };
    const avg = (refs: string[]): Rating => {
      const rs = refs.map(get);
      if (!rs.length) return { rating: 1500, rd: 350, volatility: 0.06 };
      return { rating: rs.reduce((a, b) => a + b.rating, 0) / rs.length, rd: rs.reduce((a, b) => a + b.rd, 0) / rs.length, volatility: 0.06 };
    };

    const now = Date.now();
    const matchesByAsset = new Map<string, Match[]>();
    const addMatch = (ref: string, m: Match) => {
      const arr = matchesByAsset.get(ref) ?? []; arr.push(m); matchesByAsset.set(ref, arr);
    };

    const processedIds: string[] = [];
    for (const ev of (events ?? []) as EventRow[]) {
      processedIds.push(ev.id);
      const aRefs = assetsOf(ev.side_a).filter((r) => validRefs.has(r));
      const bRefs = assetsOf(ev.side_b).filter((r) => validRefs.has(r));
      if (!aRefs.length || !bRefs.length) continue;

      // Recency decay for trades; votes are always current.
      let w = ev.weight ?? KIND_WEIGHT[ev.kind] ?? 1;
      if (ev.kind === "trade") {
        const ageDays = (now - new Date(ev.created_at).getTime()) / 86_400_000;
        if (ageDays > TRADE_CUTOFF_DAYS) continue;
        w *= Math.exp(-ageDays / HALFLIFE_DAYS);
      }

      [...aRefs, ...bRefs].forEach(bump);
      const isTrade = ev.kind === "trade";
      const oppOfA = avg(bRefs);
      const oppOfB = avg(aRefs);
      for (const ref of aRefs) {
        const score = isTrade ? expectedScore(get(ref).rating, oppOfA) : ev.outcome;
        addMatch(ref, { opponent: oppOfA, score, weight: w });
      }
      for (const ref of bRefs) {
        const score = isTrade ? expectedScore(get(ref).rating, oppOfB) : 1 - ev.outcome;
        addMatch(ref, { opponent: oppOfB, score, weight: w });
      }
    }

    // Step 3 — Glicko update every asset.
    const nowIso = new Date().toISOString();
    for (const asset of assets.values()) {
      const ms = matchesByAsset.get(asset.ref) ?? [];
      const next = updateRating({ rating: asset.rating, rd: asset.rd, volatility: asset.volatility }, ms);
      asset.rating = Math.round(next.rating * 100) / 100;
      asset.rd = Math.round(next.rd * 100) / 100;
      asset.volatility = Math.round(next.volatility * 1e6) / 1e6;
      asset.matches += ms.length;
    }

    // Step 4 — derive the board, SPLIT BY CLASS so IDP never displace offense.
    const allPlayers = [...assets.values()].filter((a) => a.ref.startsWith("p:"));
    const offense = allPlayers.filter((a) => !isIdpPlayer(a.ref)).sort((a, b) => b.rating - a.rating);
    const idp = allPlayers.filter((a) => isIdpPlayer(a.ref)).sort((a, b) => b.rating - a.rating);
    const picks = [...assets.values()].filter((a) => a.ref.startsWith("k:"));

    const playerValueRows: Json[] = [];
    const playerHistoryRows: Json[] = [];
    // Offense on the canonical 0–9999 curve; its (rating → value) points drive
    // pick interpolation (picks are offensive-scale assets).
    const curve: { rating: number; value: number }[] = [];
    offense.forEach((a, i) => {
      const value = valueForRank(i);
      curve.push({ rating: a.rating, value });
      const player_id = a.ref.slice(2);
      playerValueRows.push({ player_id, value, rank: i + 1, superflex: true, source: "community", rating_deviation: a.rd, fetched_at: nowIso, updated_at: nowIso });
      playerHistoryRows.push({ player_id, value, rank: i + 1, date: nowIso.slice(0, 10), source: "community", rating_deviation: a.rd });
    });
    // IDP on their own compressed curve, ranked within IDP.
    idp.forEach((a, i) => {
      const value = idpValueForRank(i);
      const player_id = a.ref.slice(2);
      playerValueRows.push({ player_id, value, rank: i + 1, superflex: true, source: "community", rating_deviation: a.rd, fetched_at: nowIso, updated_at: nowIso });
      playerHistoryRows.push({ player_id, value, rank: i + 1, date: nowIso.slice(0, 10), source: "community", rating_deviation: a.rd });
    });

    // pick value = player value at the equivalent rating (curve is desc by rating)
    const valueAtRating = (r: number): number => {
      if (!curve.length) return 1;
      if (r >= curve[0].rating) return curve[0].value;
      if (r <= curve[curve.length - 1].rating) return curve[curve.length - 1].value;
      for (let i = 0; i < curve.length - 1; i++) {
        const hi = curve[i], lo = curve[i + 1];
        if (r <= hi.rating && r >= lo.rating) {
          const t = (r - lo.rating) / (hi.rating - lo.rating || 1);
          return Math.round(lo.value + t * (hi.value - lo.value));
        }
      }
      return curve[curve.length - 1].value;
    };

    const pickRatingRows: Json[] = [];
    const pickValueRows: Json[] = [];
    for (const a of picks) {
      const key = a.ref.slice(2);          // '{year}-{round}'
      const [yearStr, roundStr] = key.split("-");
      const year = Number(yearStr), round = Number(roundStr);
      const base = valueAtRating(a.rating);
      pickRatingRows.push({ pick_key: key, pick_year: year, pick_round: round, rating: a.rating, rd: a.rd, volatility: a.volatility, matches: a.matches, updated_at: nowIso });
      for (const tier of ["Early", "Mid", "Late"]) {
        pickValueRows.push({
          pick_type: `${year} ${tier} ${ordinal(round)}`,
          pick_year: String(year), pick_round: round, pick_tier: tier,
          value: Math.max(1, Math.min(9999, Math.round(base * TIER_MULT[tier]))),
          superflex: true, source: "community", rating_deviation: a.rd, fetched_at: nowIso,
        });
      }
    }

    const playerRatingRows: Json[] = allPlayers.map((a) => ({
      player_id: a.ref.slice(2), rating: a.rating, rd: a.rd, volatility: a.volatility, matches: a.matches, updated_at: nowIso,
    }));

    // Step 5 — persist.
    const BATCH = 500;
    const upsert = async (table: string, rows: Json[], onConflict: string, ignore = false) => {
      for (let i = 0; i < rows.length; i += BATCH) {
        const { error } = await supabase.from(table).upsert(rows.slice(i, i + BATCH), { onConflict, ignoreDuplicates: ignore });
        if (error) throw error;
      }
    };
    await upsert("community_ratings", playerRatingRows, "player_id");
    await upsert("community_pick_ratings", pickRatingRows, "pick_key");
    await upsert("player_values", playerValueRows, "player_id,source,superflex");
    await upsert("player_value_history", playerHistoryRows, "player_id,date,source", true);
    await upsert("pick_values", pickValueRows, "pick_year,pick_round,pick_tier,source");

    if (processedIds.length) {
      for (let i = 0; i < processedIds.length; i += BATCH) {
        const { error } = await supabase.from("value_events").update({ processed_at: nowIso }).in("id", processedIds.slice(i, i + BATCH));
        if (error) throw error;
      }
    }

    return jsonResponse({
      success: true, tradesIngested, eventsProcessed: processedIds.length,
      playersRated: offense.length, idpRated: idp.length, picksRated: picks.length, durationMs: Date.now() - startTime,
    });
  } catch (error) {
    console.error("compute-community-values error:", error);
    return errorResponse(error);
  }
});
