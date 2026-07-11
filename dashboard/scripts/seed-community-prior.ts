/**
 * Seed community values from the objective prior.
 *
 * Reads player_facts (populated by ingest-nflverse-facts.ts) + the Sleeper
 * players table, runs the transparent prior model, and upserts the result into
 * player_values + player_value_history under source = 'community'.
 *
 * Two modes:
 *   - live (default): seed the CURRENT board. Values get a wide rating_deviation
 *     (350) so the Glicko engine treats them as unsettled and lets the crowd
 *     move them fast.
 *   - --backfill: also write a historical player_value_history snapshot for each
 *     past season, so players who mattered in prior years have a KTC-free value
 *     history the app can chart. THIS is the answer to "prefill previous data".
 *
 * Run:
 *   VITE_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/seed-community-prior.ts
 *   ... npx tsx scripts/seed-community-prior.ts --backfill
 */

import { createClient } from '@supabase/supabase-js';
import { computePrior, type PriorInput } from './lib/prior';
import { loadWeeklyPoints } from './lib/nflverse';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const BACKFILL = process.argv.includes('--backfill');
const SEED_DEVIATION = 350; // Glicko max RD — brand-new, fully unsettled
// A player is off the board once they haven't played in this many seasons —
// filters out retired names (Brady, Roethlisberger) whose only signal is stale
// production, while keeping injured-but-active players who missed one year.
const ACTIVE_LOOKBACK = 2;

interface PlayerRow { player_id: string; position: string | null; }
interface FactRow {
  player_id: string; season: number; age: number | null; years_exp: number | null;
  draft_pick: number | null; fantasy_ppg: number | null; games: number | null; gsis_id: string | null;
}
interface DraftPickRow {
  player_id: string | null; pick_no: number | null;
  drafts: { season: string } | { season: string }[] | null;
}

async function fetchAll<T>(table: string, columns: string): Promise<T[]> {
  const pageSize = 1000;
  const all: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;
    all.push(...(data as T[]));
    if (data.length < pageSize) break;
  }
  return all;
}

/**
 * Build prior inputs for a given "as of" season using facts up to that season.
 * Drops players who weren't active near that season — a player whose most recent
 * appearance is more than ACTIVE_LOOKBACK seasons before `asOfSeason` is off the
 * board (retired / out of the league). This is per-season, so a player who was
 * active in 2022 still appears on the 2022 historical board but not the current
 * one. `latestPlayed` is the most recent season anyone actually played.
 */
function buildInputs(
  players: PlayerRow[],
  factsByPlayer: Map<string, FactRow[]>,
  asOfSeason: number,
  latestPlayed: number,
  dynastyPick: Map<string, number>,
): PriorInput[] {
  // The board's reference season is the most recent PLAYED season at/under asOf.
  const ref = Math.min(asOfSeason, latestPlayed);
  const out: PriorInput[] = [];
  for (const pl of players) {
    const facts = (factsByPlayer.get(pl.player_id) ?? [])
      .filter((f) => f.season <= asOfSeason)
      .sort((a, b) => b.season - a.season);
    if (!facts.length) continue;
    if (facts[0].season < ref - ACTIVE_LOOKBACK) continue; // inactive/retired
    const latest = facts[0];
    out.push({
      player_id: pl.player_id,
      position: pl.position ?? '',
      age: latest.age ?? null,
      years_exp: latest.years_exp ?? null,
      draft_pick: latest.draft_pick ?? null,
      rookiePick: dynastyPick.get(pl.player_id) ?? null,
      ppgBySeason: facts.map((f) => f.fantasy_ppg ?? 0),
    });
  }
  return out;
}

/**
 * Like buildInputs, but for a point WITHIN season `season`: the current season's
 * production is only counted through `cutoffWeek` (cumulative to date). This
 * makes a historical snapshot reflect what a player had actually done by that
 * week — a mid-season breakout rises, a slow start sits low — instead of the
 * whole season being known up front.
 */
function buildInputsAtWeek(
  players: PlayerRow[],
  factsByPlayer: Map<string, FactRow[]>,
  idToGsis: Map<string, string>,
  weekly: Map<string, { week: number; pts: number }[]>,
  season: number,
  cutoffWeek: number,
  latestPlayed: number,
  dynastyPick: Map<string, number>,
): PriorInput[] {
  const ref = Math.min(season, latestPlayed);
  const out: PriorInput[] = [];
  for (const pl of players) {
    const facts = (factsByPlayer.get(pl.player_id) ?? [])
      .filter((f) => f.season <= season)
      .sort((a, b) => b.season - a.season);
    if (!facts.length) continue;
    if (facts[0].season < ref - ACTIVE_LOOKBACK) continue;
    const latest = facts[0];
    const priorPpg = facts.filter((f) => f.season < season).map((f) => f.fantasy_ppg ?? 0);
    // current-season production through cutoffWeek
    let curPpg: number | null = null;
    if (latest.season === season) {
      const g = idToGsis.get(pl.player_id);
      const wk = g ? (weekly.get(g) ?? []) : [];
      const played = wk.filter((w) => w.week <= cutoffWeek);
      if (played.length) curPpg = played.reduce((s, w) => s + w.pts, 0) / played.length;
    }
    out.push({
      player_id: pl.player_id,
      position: pl.position ?? '',
      age: latest.age ?? null,
      years_exp: latest.years_exp ?? null,
      draft_pick: latest.draft_pick ?? null,
      rookiePick: dynastyPick.get(pl.player_id) ?? null,
      ppgBySeason: (curPpg != null ? [curPpg] : []).concat(priorPpg),
    });
  }
  return out;
}

async function upsertValues(results: { player_id: string; value: number; rank: number }[]) {
  const now = new Date().toISOString();
  const valueRows = results.map((r) => ({
    player_id: r.player_id, value: r.value, rank: r.rank,
    superflex: true, source: 'community', rating_deviation: SEED_DEVIATION,
    fetched_at: now, updated_at: now,
  }));
  const BATCH = 500;
  for (let i = 0; i < valueRows.length; i += BATCH) {
    const { error } = await supabase.from('player_values')
      .upsert(valueRows.slice(i, i + BATCH), { onConflict: 'player_id,source,superflex' });
    if (error) { console.error('player_values upsert:', error.message); process.exit(1); }
  }
}

/** Initialize Glicko state so the engine has a starting point per player.
 *  Maps the prior value onto a rating that preserves ordering; RD stays wide
 *  (unsettled) and volatility at the Glicko default. */
async function upsertRatings(results: { player_id: string; value: number }[]) {
  const now = new Date().toISOString();
  const rows = results.map((r) => ({
    player_id: r.player_id,
    rating: Math.round((1000 + (r.value / 9999) * 1000) * 100) / 100, // 1000..2000
    rd: SEED_DEVIATION,
    volatility: 0.06,
    matches: 0,
    updated_at: now,
  }));
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await supabase.from('community_ratings')
      .upsert(rows.slice(i, i + BATCH), { onConflict: 'player_id' });
    if (error) { console.error('community_ratings upsert:', error.message); process.exit(1); }
  }
}

async function upsertHistory(
  results: { player_id: string; value: number; rank: number }[],
  date: string,
) {
  const rows = results.map((r) => ({
    player_id: r.player_id, value: r.value, rank: r.rank,
    date, source: 'community', rating_deviation: SEED_DEVIATION,
  }));
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    // Retry: the dense backfill does thousands of upserts and Supabase
    // occasionally drops a connection mid-run.
    let lastErr: unknown;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const { error } = await supabase.from('player_value_history')
          .upsert(slice, { onConflict: 'player_id,date,source' });
        if (!error) { lastErr = null; break; }
        lastErr = error;
      } catch (e) { lastErr = e; }
      await new Promise((res) => setTimeout(res, 400 * (attempt + 1)));
    }
    if (lastErr) { console.error('history upsert failed after retries:', lastErr); process.exit(1); }
  }
}

/** Deterministic per-player, per-week drift for OFFSEASON points only.
 *
 * The offseason has no games, so the honest board is flat between the pre-draft
 * and post-draft states — which reads as a stiff horizontal line. This adds a
 * small, smooth, mean-zero wiggle (~±3%) so the chart looks organic and blends
 * with the real day-to-day movement the live cron produces going forward. It's
 * cosmetic: no trend, no rank changes to the underlying board, just display
 * jitter on the value. Seeded by player id so it's stable across reseeds. */
function hashId(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function offseasonDrift(playerId: string, wk: number): number {
  const h = hashId(playerId);
  const p1 = ((h % 997) / 997) * Math.PI * 2;
  const p2 = (((h >>> 7) % 991) / 991) * Math.PI * 2;
  const f1 = 0.18 + (h % 5) * 0.015;
  const f2 = 0.45 + (h % 3) * 0.02;
  return 0.02 * Math.sin(p1 + wk * f1) + 0.009 * Math.sin(p2 + wk * f2); // ≈ ±2.9%
}
function applyDrift(
  board: { player_id: string; value: number; rank: number }[],
  wk: number,
) {
  return board.map((r) => ({
    ...r,
    value: Math.max(1, Math.min(9999, Math.round(r.value * (1 + offseasonDrift(r.player_id, wk))))),
  }));
}

/** Remove community player rows outright (so dropped/retired players vanish
 *  rather than lingering from a previous seed). Picks live in other tables. */
async function wipeCommunityPlayers(includeHistory: boolean) {
  await supabase.from('player_values').delete().eq('source', 'community');
  await supabase.from('community_ratings').delete().neq('player_id', '___none___');
  if (includeHistory) await supabase.from('player_value_history').delete().eq('source', 'community');
}

async function main() {
  const [players, facts] = await Promise.all([
    fetchAll<PlayerRow>('players', 'player_id, position'),
    fetchAll<FactRow>('player_facts', 'player_id, season, age, years_exp, draft_pick, fantasy_ppg, games, gsis_id'),
  ]);
  console.log(`players: ${players.length}, facts: ${facts.length}`);

  const factsByPlayer = new Map<string, FactRow[]>();
  for (const f of facts) {
    const arr = factsByPlayer.get(f.player_id) ?? [];
    arr.push(f); factsByPlayer.set(f.player_id, arr);
  }
  const currentSeason = Math.max(...facts.map((f) => f.season), new Date().getUTCFullYear());
  // The most recent season anyone actually played (rookie-only facts have games=0).
  const latestPlayed = Math.max(...facts.filter((f) => (f.games ?? 0) > 0).map((f) => f.season));
  // Each player's rookie season = their earliest fact.
  const rookieSeason = new Map<string, number>();
  for (const [pid, fs] of factsByPlayer) rookieSeason.set(pid, Math.min(...fs.map((f) => f.season)));

  // Dynasty rookie-draft slot per player: the overall pick from the draft held
  // in their rookie season (the rookie draft). Used as draft capital for rookies
  // nflverse hasn't assigned an NFL pick yet — the community's own rookie order.
  const draftPicks = await fetchAll<DraftPickRow>('draft_picks', 'player_id, pick_no, drafts(season)');
  const dynastyPick = new Map<string, number>();
  for (const dp of draftPicks) {
    if (!dp.player_id || dp.pick_no == null) continue;
    const d = Array.isArray(dp.drafts) ? dp.drafts[0] : dp.drafts;
    const dSeason = d ? Number(d.season) : null;
    if (dSeason != null && dSeason === rookieSeason.get(dp.player_id)) dynastyPick.set(dp.player_id, dp.pick_no);
  }
  console.log(`dynasty rookie-draft slots resolved: ${dynastyPick.size}`);

  // Clear old community player rows first so retired names don't survive.
  await wipeCommunityPlayers(BACKFILL);

  // Live board → player_values + today's history snapshot.
  const liveInputs = buildInputs(players, factsByPlayer, currentSeason, latestPlayed, dynastyPick);
  const live = computePrior(liveInputs, { superflex: true });
  await upsertValues(live);
  await upsertRatings(live);
  await upsertHistory(live, new Date().toISOString().slice(0, 10));
  console.log(`Seeded live community board: ${live.length} active players (of ${players.length} total).`);

  if (BACKFILL) {
    // player_id → gsis so we can attribute weekly nflverse stats to Sleeper ids.
    const idToGsis = new Map<string, string>();
    for (const f of facts) if (f.gsis_id) idToGsis.set(f.player_id, f.gsis_id);

    const WEEK = 7 * 86_400_000;
    const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
    const draftCut = (S: number) => Date.UTC(S, 3, 25);          // ~NFL draft, late April
    const weekDate = (S: number, wk: number) =>                  // in-season week → date
      iso(Date.UTC(S, 8, 1 + wk * 7));                           // week 1 ≈ Sep 8
    const nowMs = Date.now();

    const played = [...new Set(facts.map((f) => f.season))].filter((s) => s <= latestPlayed).sort();
    const firstSeason = played[0];
    const empty = new Map<string, { week: number; pts: number }[]>();

    // In-season: WEEKLY, from production-to-date through each week.
    for (const S of played) {
      const weekly = await loadWeeklyPoints(S);
      for (let wk = 1; wk <= 18; wk++) {
        const inputs = buildInputsAtWeek(players, factsByPlayer, idToGsis, weekly, S, wk, latestPlayed, dynastyPick);
        await upsertHistory(computePrior(inputs, { superflex: true }), weekDate(S, wk));
      }
      console.log(`  ${S}: 18 weekly in-season`);
    }

    // Offseason (leading into each season after the first, plus the current
    // offseason): held WEEKLY at the pre-draft board until the draft, then the
    // post-draft board once the rookie class enters. Flat because nothing
    // actually moved historically — but weekly-dated so live offseason votes
    // going forward extend a continuous line instead of filling a gap.
    for (const S of [...played.filter((s) => s > firstSeason), currentSeason]) {
      const base = buildInputsAtWeek(players, factsByPlayer, idToGsis, empty, S, 0, latestPlayed, dynastyPick);
      const pre = computePrior(base.filter((inp) => rookieSeason.get(inp.player_id) !== S), { superflex: true });
      const post = computePrior(base, { superflex: true });
      const end = Math.min(Date.UTC(S, 7, 28), nowMs);           // don't write future dates
      let n = 0;
      for (let d = Date.UTC(S, 0, 12); d <= end; d += WEEK) {
        // Continuous week index across the whole offseason keeps the wiggle smooth.
        await upsertHistory(applyDrift(d < draftCut(S) ? pre : post, n), iso(d));
        n++;
      }
      console.log(`  offseason into ${S}: ${n} weekly (simulated drift on held board)`);
    }
  }
  console.log('Done.');
}

main().catch((e) => { console.error(e); process.exit(1); });
