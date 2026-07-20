/**
 * The objective prior — a transparent, KTC-free cold-start value model.
 *
 * We deliberately do NOT fit a regression against KTC values (that would bake
 * their proprietary output back into ours). Instead we score each player from
 * facts alone, rank them, and map rank onto a familiar 0–9999 value curve.
 * The crowd + real trades (Glicko engine) then correct the ordering over time.
 *
 * score = production   (recency-weighted PPR points per game, position-relative)
 *       + youth        (position-specific age curve — dynasty pays for the future)
 *       + draft capital (matters most before a player has a track record)
 *
 * Everything is position-relative so a WR1 and a QB1 can share the top of the
 * board without one position's raw point totals dominating.
 */

export interface PriorInput {
  player_id: string;
  position: string;              // QB | RB | WR | TE (others get a floor)
  age: number | null;
  years_exp: number | null;
  draft_pick: number | null;     // NFL overall draft pick; null = undrafted/unknown
  // Dynasty rookie-draft slot (overall), used for unproven rookies when the NFL
  // draft pick is unknown (nflverse lags a class) — it's the community's own
  // read on the rookie order, which is exactly what we want.
  rookiePick?: number | null;
  // production, most-recent season first (index 0 = last season)
  ppgBySeason: number[];
}

export interface PriorConfig {
  superflex: boolean;            // superflex boosts QB scarcity
}

// ── Rank → value curve ───────────────────────────────────────────────────────
// MUST stay byte-identical to the engine's copy in
// supabase/functions/compute-community-values/index.ts (see the long comment
// there for the design). Two-segment: steep exponential head so elites tower,
// gentler power tail so deep players stay spread. rankIdx is 0-BASED.
const CURVE_TOP = 9999;
const CURVE_KNEE = 60;
const CURVE_FLOOR = 200;
const CURVE_TOTAL = 1000;
const CURVE_K_HEAD = 22;
const CURVE_TAIL_POW = 2.2;
export function valueForRank(rankIdx: number): number {
  const kneeVal = CURVE_TOP * Math.exp((-CURVE_K_HEAD * (CURVE_KNEE - 1)) / CURVE_TOTAL);
  if (rankIdx < CURVE_KNEE) {
    return Math.max(1, Math.round(CURVE_TOP * Math.exp((-CURVE_K_HEAD * rankIdx) / CURVE_TOTAL)));
  }
  // Clamp to [0,1] so boards larger than CURVE_TOTAL floor out cleanly rather
  // than producing NaN (pow of a negative base to a fractional exponent).
  const t = Math.min(1, (rankIdx - CURVE_KNEE) / (CURVE_TOTAL - CURVE_KNEE));
  return Math.max(1, Math.round(CURVE_FLOOR + (kneeVal - CURVE_FLOOR) * Math.pow(1 - t, CURVE_TAIL_POW)));
}

const POS = ['QB', 'RB', 'WR', 'TE'] as const;
type Pos = (typeof POS)[number];

// Dynasty age peaks differ by position; value decays past the peak.
const AGE_PEAK: Record<Pos, number> = { QB: 27, RB: 23, WR: 25, TE: 26 };
const AGE_FALLOFF: Record<Pos, number> = { QB: 0.05, RB: 0.16, WR: 0.10, TE: 0.09 };

// Startable slots in a 12-team superflex league — sets each position's
// replacement level. Thin positions (TE, QB) have low startable counts, so
// their replacement baseline is high in rank but low in points; VORP below
// keeps them from dominating the way within-position z-scoring did.
const STARTABLE: Record<Pos, number> = { QB: 20, RB: 30, WR: 36, TE: 14 };

// Scarcity premium applied to a position's points-over-replacement. Superflex
// makes QBs genuinely scarce (two QB slots), so their VORP is worth more per
// point; dynasty discounts RB longevity.
function scarcity(pos: Pos, superflex: boolean): number {
  if (pos === 'QB') return superflex ? 1.15 : 0.7;
  if (pos === 'RB') return 0.92;
  if (pos === 'WR') return 1.0;
  return 0.85;                    // TE — real but not top-of-board
}

function isPos(p: string): p is Pos {
  return (POS as readonly string[]).includes(p);
}

/** Recency-weighted production: last season counts most, older seasons decay. */
function weightedPpg(ppgBySeason: number[]): number {
  if (!ppgBySeason.length) return 0;
  const weights = [1.0, 0.6, 0.35, 0.2];
  let sum = 0, wsum = 0;
  ppgBySeason.slice(0, weights.length).forEach((ppg, i) => {
    sum += ppg * weights[i];
    wsum += weights[i];
  });
  return wsum ? sum / wsum : 0;
}

/** Age component: 1.0 at/under peak, decaying for each year past it. */
function youthScore(pos: Pos, age: number | null): number {
  if (age == null) return 0.5; // unknown age → neutral
  const past = Math.max(0, age - AGE_PEAK[pos]);
  return Math.max(0.05, 1 - past * AGE_FALLOFF[pos]);
}

// Career runway: roughly how much productive time a player has left, 0..1.
// Dynasty pays for the future, so this scales how much production is worth —
// but as a MULTIPLIER on production, never a substitute for it.
const DECLINE_AGE: Record<Pos, number> = { QB: 35, RB: 29, WR: 31, TE: 31 };
const RUNWAY_SPAN: Record<Pos, number> = { QB: 13, RB: 8, WR: 9, TE: 8 };
function runway(pos: Pos, age: number | null): number {
  if (age == null) return 0.6;
  return Math.max(0, Math.min(1, (DECLINE_AGE[pos] - age) / RUNWAY_SPAN[pos]));
}

/** Draft-implied expected ppg for an unproven rookie — the only production
 *  signal we have before they play. Elite pick ≈ startable, late pick ≈ fringe. */
function draftExpectedPpg(pick: number | null): number {
  if (pick == null) return 3.0;                         // undrafted
  return Math.max(3.0, Math.min(19, 19 - 2.5 * Math.log2(pick + 1)));
}

/** Expected ppg from a DYNASTY rookie-draft slot (overall pick, 12-team scale).
 *  The 1.01 is a startable-tier bet; the 4th round is a deep flier. Used when a
 *  rookie has no NFL draft pick yet. */
function rookieExpectedPpg(overallPick: number | null): number {
  if (overallPick == null) return 3.0;
  return Math.max(3.0, Math.min(17, 16 - 2.2 * Math.log2(overallPick + 1)));
}

/**
 * Draft-capital component, decaying as a real track record accumulates.
 * A rookie leans heavily on draft slot; a 5-year vet's slot barely matters.
 */
function draftScore(pick: number | null, yearsExp: number | null): number {
  if (pick == null) return 0.15;                 // undrafted floor
  const slotValue = Math.max(0, 1 - Math.log2(pick + 1) / Math.log2(260)); // pick 1 ≈ 1, pick 259 ≈ 0
  const exp = yearsExp ?? 0;
  const decay = Math.max(0, 1 - exp * 0.25);     // gone after ~4 seasons
  return slotValue * decay;
}

/** Replacement-level ppg per position: the production of the first
 *  non-startable player. Points above this are what actually win leagues. */
function replacementLevels(inputs: PriorInput[]): Record<Pos, number> {
  const byPos: Record<Pos, number[]> = { QB: [], RB: [], WR: [], TE: [] };
  for (const p of inputs) {
    if (!isPos(p.position)) continue;
    byPos[p.position].push(weightedPpg(p.ppgBySeason));
  }
  const out = {} as Record<Pos, number>;
  for (const pos of POS) {
    const sorted = byPos[pos].sort((a, b) => b - a);
    const idx = Math.min(STARTABLE[pos], sorted.length - 1);
    out[pos] = sorted.length ? (sorted[idx] ?? 0) : 0;
  }
  return out;
}

export interface PriorResult {
  player_id: string;
  value: number;   // 0..9999
  rank: number;    // 1 = most valuable
}

/**
 * Score a whole player pool and return values on the 0–9999 scale.
 *
 * Cross-position value comes from VORP — points over positional replacement —
 * so a WR and a QB are compared on points that actually matter, not on how
 * extreme they are within their own position. Youth and draft capital shape the
 * rest; a productionless blue-chip rookie leans on draft slot. Non-skill
 * positions (K/DEF/OL) collapse to a low floor.
 */
export function computePrior(inputs: PriorInput[], cfg: PriorConfig): PriorResult[] {
  const repl = replacementLevels(inputs);
  const scored = inputs.map((p) => {
    if (!isPos(p.position)) return { id: p.player_id, score: -5 };
    const pos = p.position;
    const prod = weightedPpg(p.ppgBySeason);
    const proven = prod > 1.0;
    // Production is the spine. A proven player uses real ppg; an unproven rookie
    // uses draft-implied ppg — NFL draft pick if known, else the dynasty rookie
    // draft slot (so a 1.01 clearly beats a 2.01). Points-over-replacement is
    // NOT floored, so a 5-ppg player sits clearly below an 11-ppg player.
    let effProd = proven
      ? prod
      : (p.draft_pick != null ? draftExpectedPpg(p.draft_pick) : rookieExpectedPpg(p.rookiePick ?? null));
    // Rookie ppg curves are on a skill-player scale; QBs score much higher, so
    // an unproven QB's expected ppg is lifted or SF rookie QBs sink unfairly.
    if (!proven && pos === 'QB') effProd *= 1.6;
    const pov = (effProd - repl[pos]) * scarcity(pos, cfg.superflex);
    // Runway scales production 55–100% by age — but only AMPLIFIES value above
    // replacement; below replacement it's left alone so a younger scrub isn't
    // penalized harder than an older one at the same (poor) production.
    const rw = 0.55 + 0.45 * runway(pos, p.age);
    const povScaled = pov >= 0 ? pov * rw : pov;
    // A little draft optionality on top, decaying as a track record accrues.
    const score = povScaled + draftScore(p.draft_pick, p.years_exp) * 2.5;
    return { id: p.player_id, score };
  });
  scored.sort((a, b) => b.score - a.score);

  // Map rank → value with the shared two-segment dynasty curve (steep head so
  // elites tower, gentle tail so depth stays spread). A player's value depends
  // only on their rank (0-based i), not the pool size, so pre/post-draft and
  // cross-season boards sit on one scale.
  return scored.map((s, i) => {
    return { player_id: s.id, value: valueForRank(i), rank: i + 1 };
  });
}
