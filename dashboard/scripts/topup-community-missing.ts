/**
 * Additive community-board top-up (non-destructive).
 *
 * The full seed (seed-community-prior.ts) WIPES community_ratings and rebuilds
 * from the prior, which resets every rating the crowd/trades have moved. Once
 * the board has accumulated real signal, that's destructive. This script instead
 * ADDS only the players who are missing from community_ratings today — active
 * skill players (and, when included, IDP) who have facts but never entered the
 * board (e.g. players recovered by the improved nflverse name join). Existing
 * ratings are left exactly as they are.
 *
 * For each missing player it writes:
 *   - community_ratings: a cold-start Glicko state (rating from the prior value,
 *     RD=350 so the engine treats it as unsettled and lets the crowd move it),
 *   - player_values: a provisional value/rank so the app shows a number
 *     immediately. The very next compute-community-values run re-derives the
 *     whole board's ranks consistently; this row just avoids a blank until then.
 *
 * Safe to re-run: it only ever touches players NOT already rated.
 *
 * Run:
 *   VITE_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/topup-community-missing.ts
 *   add --idp to also top up missing IDP players (offense-only by default).
 */

import { createClient } from '@supabase/supabase-js';
import { computePrior, type PriorInput } from './lib/prior';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const INCLUDE_IDP = process.argv.includes('--idp');
const SEED_DEVIATION = 350; // Glicko max RD — unsettled, crowd moves it fast
const ACTIVE_LOOKBACK = 2;  // mirrors seed-community-prior: drop retired players

const SKILL = new Set(['QB', 'RB', 'WR', 'TE']);

interface PlayerRow { player_id: string; position: string | null; status: string | null; }
interface FactRow {
  player_id: string; season: number; age: number | null; years_exp: number | null;
  draft_pick: number | null; fantasy_ppg: number | null; games: number | null;
}
interface DraftPickRow { player_id: string | null; pick_no: number | null; drafts: { season: string } | { season: string }[] | null; }

async function fetchAll<T>(table: string, columns: string): Promise<T[]> {
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

async function main() {
  const [players, facts, ratings, draftPicks] = await Promise.all([
    fetchAll<PlayerRow>('players', 'player_id, position, status'),
    fetchAll<FactRow>('player_facts', 'player_id, season, age, years_exp, draft_pick, fantasy_ppg, games'),
    fetchAll<{ player_id: string }>('community_ratings', 'player_id'),
    fetchAll<DraftPickRow>('draft_picks', 'player_id, pick_no, drafts(season)'),
  ]);
  const rated = new Set(ratings.map((r) => r.player_id));
  console.log(`players ${players.length}, facts ${facts.length}, already-rated ${rated.size}`);

  const factsByPlayer = new Map<string, FactRow[]>();
  for (const f of facts) {
    const arr = factsByPlayer.get(f.player_id) ?? []; arr.push(f); factsByPlayer.set(f.player_id, arr);
  }
  const currentSeason = Math.max(...facts.map((f) => f.season), new Date().getUTCFullYear());
  const latestPlayed = Math.max(...facts.filter((f) => (f.games ?? 0) > 0).map((f) => f.season));
  const ref = Math.min(currentSeason, latestPlayed);

  const rookieSeason = new Map<string, number>();
  for (const [pid, fs] of factsByPlayer) rookieSeason.set(pid, Math.min(...fs.map((f) => f.season)));
  const dynastyPick = new Map<string, number>();
  for (const dp of draftPicks) {
    if (!dp.player_id || dp.pick_no == null) continue;
    const d = Array.isArray(dp.drafts) ? dp.drafts[0] : dp.drafts;
    const dSeason = d ? Number(d.season) : null;
    if (dSeason != null && dSeason === rookieSeason.get(dp.player_id)) dynastyPick.set(dp.player_id, dp.pick_no);
  }

  // Build prior inputs for the FULL active pool (so ranks/values are on the same
  // scale as the live board), exactly like seed-community-prior's buildInputs.
  const posOf = new Map(players.map((p) => [p.player_id, (p.position ?? '').toUpperCase()]));
  const inputs: PriorInput[] = [];
  for (const pl of players) {
    const pos = (pl.position ?? '').toUpperCase();
    if (!SKILL.has(pos)) continue; // offense board only; IDP has its own curve/engine
    const fs = (factsByPlayer.get(pl.player_id) ?? []).filter((f) => f.season <= currentSeason).sort((a, b) => b.season - a.season);
    if (!fs.length) continue;
    if (fs[0].season < ref - ACTIVE_LOOKBACK) continue; // inactive/retired
    const latest = fs[0];
    inputs.push({
      player_id: pl.player_id,
      position: pos,
      age: latest.age ?? null,
      years_exp: latest.years_exp ?? null,
      draft_pick: latest.draft_pick ?? null,
      rookiePick: dynastyPick.get(pl.player_id) ?? null,
      ppgBySeason: fs.map((f) => f.fantasy_ppg ?? 0),
    });
  }
  const board = computePrior(inputs, { superflex: true });
  console.log(`prior board (active offense): ${board.length}`);

  // MISSING = on the prior board but not yet in community_ratings.
  const missing = board.filter((b) => !rated.has(b.player_id));
  console.log(`MISSING offense players to top up: ${missing.length}`);
  if (INCLUDE_IDP) console.log('(IDP top-up not implemented here; run seed-idp-prior for IDP)');
  if (!missing.length) { console.log('Nothing to add — board already complete.'); return; }
  missing.slice(0, 40).forEach((m) => console.log(`  + ${m.player_id} (${posOf.get(m.player_id)}) rank~${m.rank} value~${m.value}`));

  const now = new Date().toISOString();

  // community_ratings: cold-start Glicko from the prior value (preserves ordering
  // vs the existing board via the same 1000..2000 mapping the seed uses), RD wide.
  const ratingRows = missing.map((m) => ({
    player_id: m.player_id,
    rating: Math.round((1000 + (m.value / 9999) * 1000) * 100) / 100,
    rd: SEED_DEVIATION,
    volatility: 0.06,
    matches: 0,
    updated_at: now,
  }));

  // player_values: provisional value/rank (community engine re-ranks next run).
  const valueRows = missing.map((m) => ({
    player_id: m.player_id, value: m.value, rank: m.rank,
    superflex: true, source: 'community', rating_deviation: SEED_DEVIATION,
    fetched_at: now, updated_at: now,
  }));
  const historyRows = missing.map((m) => ({
    player_id: m.player_id, value: m.value, rank: m.rank,
    date: now.slice(0, 10), source: 'community', rating_deviation: SEED_DEVIATION,
  }));

  const BATCH = 500;
  const upsert = async (table: string, rows: Record<string, unknown>[], onConflict: string) => {
    for (let i = 0; i < rows.length; i += BATCH) {
      const { error } = await supabase.from(table).upsert(rows.slice(i, i + BATCH), { onConflict });
      if (error) { console.error(`${table} upsert:`, error.message); process.exit(1); }
    }
  };
  await upsert('community_ratings', ratingRows, 'player_id');
  await upsert('player_values', valueRows, 'player_id,source,superflex');
  await upsert('player_value_history', historyRows, 'player_id,date,source');

  console.log(`\nAdded ${missing.length} players to the community board (existing ${rated.size} ratings untouched).`);
  console.log('Next: invoke compute-community-values once to re-rank the full board consistently.');
}

main().catch((e) => { console.error(e); process.exit(1); });
