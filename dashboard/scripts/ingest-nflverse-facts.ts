/**
 * Ingest objective NFL facts from nflverse into `player_facts`.
 *
 * Joins nflverse production (keyed by gsis_id) to Sleeper player_ids via the
 * `sleeper_id` column in nflverse's players master table. Writes one row per
 * (player_id, season) with age, draft capital, and PPR production.
 *
 * This is 100% factual public data — no KTC, nothing proprietary.
 *
 * Run:
 *   VITE_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx tsx scripts/ingest-nflverse-facts.ts 2021 2022 2023 2024
 *   (defaults to the last 4 seasons if no years are given)
 */

import { createClient } from '@supabase/supabase-js';
import { loadPlayers, loadSeasonProduction, ageAtSeason, normalizeName } from './lib/nflverse';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const CURRENT = new Date().getUTCFullYear();
const seasons = process.argv.slice(2).map(Number).filter((n) => n > 2000)
  || [];
const SEASONS = seasons.length ? seasons : [CURRENT - 3, CURRENT - 2, CURRENT - 1, CURRENT];

interface SleeperPlayer { player_id: string; full_name: string; position: string | null; }

/** Load Sleeper players so we can name+position match nflverse to them. */
async function loadSleeperPlayers(): Promise<SleeperPlayer[]> {
  const rows: SleeperPlayer[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('players').select('player_id, full_name, position').range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...(data as SleeperPlayer[]));
    if (data.length < pageSize) break;
  }
  return rows;
}

const key = (name: string, pos: string) => `${normalizeName(name)}|${(pos || '').toUpperCase()}`;

async function main() {
  console.log(`Ingesting nflverse facts for seasons: ${SEASONS.join(', ')}`);

  const [players, sleeper] = await Promise.all([loadPlayers(), loadSleeperPlayers()]);
  console.log(`  nflverse players: ${players.size}, Sleeper players: ${sleeper.length}`);

  // name+position → Sleeper player_id. On the rare collision, first wins.
  const sleeperByKey = new Map<string, string>();
  for (const s of sleeper) {
    if (!s.full_name || !s.position) continue;
    const k = key(s.full_name, s.position);
    if (!sleeperByKey.has(k)) sleeperByKey.set(k, s.player_id);
  }

  // gsis_id → sleeper player_id, via name+position. When several nflverse
  // players collide onto one Sleeper player, keep the most recent (highest
  // rookie_season) — that's almost always the currently-active player.
  const gsisToSleeper = new Map<string, string>();
  const claimedBy = new Map<string, { gsis: string; rookie: number }>();
  for (const p of players.values()) {
    const sid = sleeperByKey.get(key(p.full_name, p.position));
    if (!sid) continue;
    const rookie = p.rookie_season ?? 0;
    const prior = claimedBy.get(sid);
    if (prior && prior.rookie >= rookie) continue;
    if (prior) gsisToSleeper.delete(prior.gsis);
    gsisToSleeper.set(p.gsis_id, sid);
    claimedBy.set(sid, { gsis: p.gsis_id, rookie });
  }
  console.log(`  matched nflverse→Sleeper by name+position: ${gsisToSleeper.size}`);

  const rows: Record<string, unknown>[] = [];
  for (const season of SEASONS) {
    const production = await loadSeasonProduction(season);
    let seasonRows = 0;
    for (const [gsis, sleeperId] of gsisToSleeper) {
      const p = players.get(gsis)!;
      const prod = production.get(gsis);
      // include a player-season if they either produced OR are a real prospect
      const isRookieThisYear = p.rookie_season === season;
      if (!prod && !isRookieThisYear) continue;
      rows.push({
        player_id: sleeperId,
        season,
        age: ageAtSeason(p.birth_date ?? undefined, season),
        years_exp: p.rookie_season != null ? Math.max(0, season - p.rookie_season) : null,
        draft_round: p.draft_round,
        draft_pick: p.draft_pick,
        games: prod?.games ?? 0,
        fantasy_ppg: prod?.fantasy_ppg ?? 0,
        fantasy_total: prod?.fantasy_total ?? 0,
        snap_share: null,
        gsis_id: gsis,
        source: 'nflverse',
      });
      seasonRows++;
    }
    console.log(`  ${season}: ${seasonRows} player-seasons`);
  }

  // upsert in batches on (player_id, season, source)
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await supabase.from('player_facts')
      .upsert(batch, { onConflict: 'player_id,season,source' });
    if (error) { console.error('upsert error:', error.message); process.exit(1); }
  }
  console.log(`Done — ${rows.length} player_facts rows upserted.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
