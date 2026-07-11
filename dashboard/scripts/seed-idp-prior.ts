/**
 * Seed IDP (defensive) players into the shared community value dataset.
 *
 * ADDITIVE and IDP-ONLY: this never touches offensive players' ratings or the
 * accumulated crowd learning. It computes an objective IDP prior from nflverse
 * defensive production and upserts ONLY IDP players into community_ratings +
 * player_values (source = 'community'). The live engine then ranks IDP on its
 * own display curve (see compute-community-values), so offense values are
 * unaffected while IDP get real, shared values.
 *
 * Run:
 *   VITE_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx tsx scripts/seed-idp-prior.ts
 */

import { createClient } from '@supabase/supabase-js';
import { loadPlayers, loadDefensiveProduction, ageAtSeason, normalizeName } from './lib/nflverse';
import { computeIdpPrior, type IdpPriorInput } from './lib/idp-prior';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Sleeper IDP position codes.
const IDP_POSITIONS = new Set([
  'DL', 'DE', 'DT', 'NT', 'EDGE', 'LB', 'ILB', 'OLB', 'MLB', 'DB', 'CB', 'S', 'SS', 'FS',
]);

const CURRENT = new Date().getUTCFullYear();
const SEASONS = [CURRENT - 3, CURRENT - 2, CURRENT - 1, CURRENT]; // recent-first is applied below

// IDP display curve — MUST match compute-community-values. Top IDP ≈ 5000
// (roughly a startable RB2/WR2 in a balanced IDP league); long shallow tail.
const IDP_MAX = 5000;
const IDP_CURVE_REF = 525;
const idpValueForRank = (i: number) => Math.max(1, Math.round(IDP_MAX * Math.exp(-3.1 * (i / IDP_CURVE_REF))));

const SEED_DEVIATION = 350; // wide RD — unsettled, so the crowd can move IDP fast

interface SleeperPlayer { player_id: string; full_name: string; position: string | null; age: number | null; years_exp: number | null; }

// Sleeper generalizes IDP to DL/LB/DB, but nflverse specifies DE/DT/ILB/OLB/
// CB/S — and edge rushers flip between DL and LB across sources — so any
// position-aware join drops many defenders. Both sides are already defensive
// (Sleeper filtered to IDP; nflverse guarded to `isDefensive` below), so match
// on NAME alone. Name collisions among two defenders are vanishingly rare.
const DEF_POSITIONS = new Set(['DL', 'DE', 'DT', 'NT', 'EDGE', 'LB', 'ILB', 'OLB', 'MLB', 'DB', 'CB', 'S', 'SS', 'FS']);
const isDefensive = (pos: string | null | undefined) => DEF_POSITIONS.has((pos || '').toUpperCase());
const key = (name: string) => normalizeName(name);

async function loadSleeperIdp(): Promise<SleeperPlayer[]> {
  const rows: SleeperPlayer[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('players').select('player_id, full_name, position, age, years_exp').range(from, from + 999);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...(data as SleeperPlayer[]));
    if (data.length < 1000) break;
  }
  return rows.filter((p) => p.position && IDP_POSITIONS.has(p.position.toUpperCase()));
}

async function main() {
  console.log('Seeding IDP prior into community values (additive, IDP-only)…');

  const [nflPlayers, idp] = await Promise.all([loadPlayers(), loadSleeperIdp()]);
  console.log(`  Sleeper IDP players: ${idp.length}`);

  // name → sleeper id (IDP only), then gsis → sleeper id (defensive nflverse only).
  const sleeperByKey = new Map<string, string>();
  for (const s of idp) {
    if (!s.full_name) continue;
    const k = key(s.full_name);
    if (!sleeperByKey.has(k)) sleeperByKey.set(k, s.player_id);
  }
  const gsisToSleeper = new Map<string, string>();
  const draftBySleeper = new Map<string, number | null>();
  for (const p of nflPlayers.values()) {
    if (!isDefensive(p.position)) continue;
    const sid = sleeperByKey.get(key(p.full_name));
    if (!sid || gsisToSleeper.has(p.gsis_id)) continue;
    gsisToSleeper.set(p.gsis_id, sid);
    if (!draftBySleeper.has(sid)) draftBySleeper.set(sid, p.draft_pick ?? null);
  }
  console.log(`  matched nflverse→Sleeper (IDP): ${gsisToSleeper.size}`);

  // Recency-ordered IDP ppg per sleeper player, newest season first. Require a
  // minimum games sample so a backup's one big game doesn't inflate their ppg
  // and rocket them up the board (small-sample bias).
  const MIN_GAMES = 6;
  const ppgBySleeper = new Map<string, number[]>();
  for (const season of [...SEASONS].sort((a, b) => b - a)) {
    const prod = await loadDefensiveProduction(season);
    let counted = 0;
    for (const [gsis, prodRow] of prod) {
      const sid = gsisToSleeper.get(gsis);
      if (!sid || prodRow.games < MIN_GAMES) continue;
      const arr = ppgBySleeper.get(sid) ?? [];
      arr.push(prodRow.fantasy_ppg);
      ppgBySleeper.set(sid, arr);
      counted++;
    }
    console.log(`  ${season}: ${counted} IDP producers (>=${MIN_GAMES} games)`);
  }

  const inputs: IdpPriorInput[] = idp.map((s) => ({
    player_id: s.player_id,
    position: (s.position || '').toUpperCase(),
    age: s.age,
    years_exp: s.years_exp,
    draft_pick: draftBySleeper.get(s.player_id) ?? null,
    ppgBySeason: ppgBySleeper.get(s.player_id) ?? [],
  }));

  const ranked = computeIdpPrior(inputs);
  console.log(`  ranked ${ranked.length} IDP players`);

  const nowIso = new Date().toISOString();
  const today = nowIso.slice(0, 10);

  const ratingRows = ranked.map((r) => ({
    player_id: r.player_id,
    rating: Math.round((1000 + r.strength * 600) * 100) / 100, // 1000..1600 band, orders IDP
    rd: SEED_DEVIATION,
    volatility: 0.06,
    matches: 0,
    updated_at: nowIso,
  }));
  const valueRows = ranked.map((r) => ({
    player_id: r.player_id,
    value: idpValueForRank(r.rank - 1),
    rank: r.rank,
    superflex: true,
    source: 'community',
    rating_deviation: SEED_DEVIATION,
    fetched_at: nowIso,
    updated_at: nowIso,
  }));
  const historyRows = ranked.map((r) => ({
    player_id: r.player_id,
    value: idpValueForRank(r.rank - 1),
    rank: r.rank,
    date: today,
    source: 'community',
    rating_deviation: SEED_DEVIATION,
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

  // Show the top of the IDP board as a sanity check.
  const nameById = new Map(idp.map((s) => [s.player_id, s.full_name]));
  console.log('\n  Top 15 IDP by seeded value:');
  ranked.slice(0, 15).forEach((r) => {
    console.log(`   #${r.rank.toString().padStart(3)}  ${(nameById.get(r.player_id) || r.player_id).padEnd(24)} value=${idpValueForRank(r.rank - 1)}`);
  });
  console.log(`\nDone — seeded ${ranked.length} IDP players into community values.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
