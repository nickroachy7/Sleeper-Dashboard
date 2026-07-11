/**
 * Seed the objective prior for draft picks.
 *
 * Picks are rated on the SAME scale as players (Glicko rating ~1000–2000), so
 * once real "player for pick" trades flow through the engine, a pick's value is
 * calibrated directly against actual players. This script lays down the cold
 * start: a sensible superflex dynasty curve by round, discounted for how far
 * out the pick is, before any trades have spoken.
 *
 * Writes community_pick_ratings (Glicko state, keyed by '{year}-{round}') and an
 * initial community pick board in pick_values (all three tiers). The engine
 * refines pick_values from ratings on its next run.
 *
 * Run:
 *   VITE_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/seed-pick-prior.ts
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const YEARS = [2026, 2027, 2028, 2029, 2030];
const ROUNDS = [1, 2, 3, 4];
const SEED_DEVIATION = 350;

// Mid-tier value per round (0–9999 scale), superflex dynasty shape.
const ROUND_BASE: Record<number, number> = { 1: 4600, 2: 2000, 3: 850, 4: 380 };
// Discount by how far out the pick is. 2027 is the prime upcoming class here;
// the current year's picks are winding down, far-future picks are hazier.
const YEAR_FACTOR: Record<number, number> = { 2026: 0.85, 2027: 1.0, 2028: 0.92, 2029: 0.82, 2030: 0.72 };
// Within a round, tier spread (matches the ~1.28 / 1.0 / 0.78 shape picks trade at).
const TIER_MULT: Record<string, number> = { Early: 1.28, Mid: 1.0, Late: 0.78 };

const ordinal = (r: number) => (r === 1 ? '1st' : r === 2 ? '2nd' : r === 3 ? '3rd' : `${r}th`);
const valueToRating = (v: number) => Math.round((1000 + (v / 9999) * 1000) * 100) / 100;

async function main() {
  const ratingRows: Record<string, unknown>[] = [];
  const valueRows: Record<string, unknown>[] = [];
  const now = new Date().toISOString();

  for (const year of YEARS) {
    for (const round of ROUNDS) {
      const midValue = Math.round(ROUND_BASE[round] * (YEAR_FACTOR[year] ?? 0.75));
      ratingRows.push({
        pick_key: `${year}-${round}`,
        pick_year: year,
        pick_round: round,
        rating: valueToRating(midValue),
        rd: SEED_DEVIATION,
        volatility: 0.06,
        matches: 0,
        updated_at: now,
      });
      for (const tier of ['Early', 'Mid', 'Late']) {
        valueRows.push({
          pick_type: `${year} ${tier} ${ordinal(round)}`,
          pick_year: String(year),
          pick_round: round,
          pick_tier: tier,
          value: Math.max(1, Math.round(midValue * TIER_MULT[tier])),
          rank: null,
          superflex: true,
          source: 'community',
          rating_deviation: SEED_DEVIATION,
          fetched_at: now,
        });
      }
    }
  }

  const { error: rErr } = await supabase.from('community_pick_ratings')
    .upsert(ratingRows, { onConflict: 'pick_key' });
  if (rErr) { console.error('pick ratings upsert:', rErr.message); process.exit(1); }

  const { error: vErr } = await supabase.from('pick_values')
    .upsert(valueRows, { onConflict: 'pick_year,pick_round,pick_tier,source' });
  if (vErr) { console.error('pick_values upsert:', vErr.message); process.exit(1); }

  console.log(`Seeded ${ratingRows.length} pick ratings + ${valueRows.length} community pick values.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
