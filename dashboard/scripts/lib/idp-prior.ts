/**
 * IDP objective prior — the defensive counterpart to lib/prior.ts.
 *
 * Same philosophy: score each defender from open facts (production, youth,
 * draft capital), rank them, and let the crowd correct from there. IDP fantasy
 * points (a balanced scoring — see nflverse.idpPointsFromRow) are already
 * roughly comparable across DL/LB/DB (tackle-heavy LBs top the board, which
 * matches how balanced IDP leagues value them), so we rank all IDP together
 * rather than per-position VORP.
 *
 * The ABSOLUTE value band for IDP (how a top LB compares to a top WR) is set by
 * the engine's IDP display curve, NOT here — this only produces the internal
 * ordering. So the output is a rank + a 0..1 strength used to seed the rating.
 */

export interface IdpPriorInput {
  player_id: string;
  position: string;              // DL/DE/DT/NT/EDGE | LB/ILB/OLB/MLB | DB/CB/S/SS/FS
  age: number | null;
  years_exp: number | null;
  draft_pick: number | null;
  ppgBySeason: number[];         // IDP ppg, most-recent season first
}

// Defenders hold value later than skill players, so age is a GENTLE, single
// adjustment (no compounding youth×runway that buried proven vets).
const AGE_PEAK = 26;
const AGE_FALLOFF = 0.03;   // per year past peak
const AGE_FLOOR = 0.62;     // an aging elite is still clearly rosterable

/** Recency-weighted IDP ppg: last season counts most; multi-season proven
 *  producers are rewarded over one-year samples via the reliability factor. */
function weightedPpg(ppgBySeason: number[]): number {
  if (!ppgBySeason.length) return 0;
  const weights = [1.0, 0.6, 0.35, 0.2];
  let sum = 0, wsum = 0;
  ppgBySeason.slice(0, weights.length).forEach((ppg, i) => { sum += ppg * weights[i]; wsum += weights[i]; });
  return wsum ? sum / wsum : 0;
}

function ageMult(age: number | null): number {
  if (age == null) return 0.9;
  const past = Math.max(0, age - AGE_PEAK);
  return Math.max(AGE_FLOOR, 1 - past * AGE_FALLOFF);
}

/** Draft-implied IDP ppg for an UNPROVEN rookie — modest, so a proven starter
 *  always outranks a rookie who hasn't produced yet. */
function draftExpectedPpg(pick: number | null): number {
  if (pick == null) return 2.0;
  return Math.max(2.0, Math.min(5.5, 5.5 - 1.0 * Math.log2(pick + 1)));
}

function draftScore(pick: number | null, yearsExp: number | null): number {
  if (pick == null) return 0.1;
  const slot = Math.max(0, 1 - Math.log2(pick + 1) / Math.log2(260));
  const decay = Math.max(0, 1 - (yearsExp ?? 0) * 0.25);
  return slot * decay;
}

export interface IdpPriorResult {
  player_id: string;
  rank: number;      // 1 = most valuable IDP
  strength: number;  // 0..1, top IDP = 1 — used to seed the rating ordering
}

/** Rank the whole IDP pool. Returns rank + a normalized strength (0..1). */
export function computeIdpPrior(inputs: IdpPriorInput[]): IdpPriorResult[] {
  const scored = inputs.map((p) => {
    const prod = weightedPpg(p.ppgBySeason);
    const proven = prod > 1.0;
    // Proven producers use real ppg; unproven rookies get a modest draft-implied
    // baseline (capped below proven-starter level). Production is the spine and
    // dominates; age is a gentle multiplier; a little draft optionality on top.
    const effProd = proven ? prod : draftExpectedPpg(p.draft_pick);
    const seasons = p.ppgBySeason.length;
    const reliability = proven ? Math.min(1, 0.75 + 0.125 * seasons) : 0.7; // reward a track record
    const score = effProd * reliability * ageMult(p.age) + draftScore(p.draft_pick, p.years_exp) * 1.2;
    return { id: p.player_id, score };
  });
  scored.sort((a, b) => b.score - a.score);

  const maxScore = scored[0]?.score || 1;
  return scored.map((s, i) => ({
    player_id: s.id,
    rank: i + 1,
    strength: Math.max(0, s.score) / maxScore,
  }));
}
