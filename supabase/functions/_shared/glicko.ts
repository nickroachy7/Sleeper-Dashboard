/**
 * Glicko-2 rating system (Glickman, 2013) — dependency-free.
 * http://www.glicko.net/glicko/glicko2.pdf
 *
 * We use it to turn pairwise "asset A preferred over asset B" comparisons into
 * a rating + a rating deviation (confidence). Unsettled players (rookies, thin
 * sample) have a high RD and move fast; heavily-traded stars have a low RD and
 * stay sticky. That confidence band is surfaced in the app.
 *
 * Ratings live on the classic ~1500-centered scale; the caller maps the final
 * ordering onto the app's 0–9999 display value.
 */

const SCALE = 173.7178;   // Glicko-2 conversion constant
const TAU = 0.5;          // system constant: constrains volatility change
const EPSILON = 0.000001;

export interface Rating {
  rating: number;      // r
  rd: number;          // RD
  volatility: number;  // sigma
}

export interface Match {
  opponent: Rating;
  score: number;       // 1 win, 0.5 draw, 0 loss (for the rated player)
  weight?: number;     // optional evidence weight (real trade > anon tap)
}

const g = (phi: number) => 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
const expected = (mu: number, muJ: number, phiJ: number) =>
  1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));

/**
 * Update one player's rating from a batch of comparisons played "this period".
 * Returns the new rating; if there were no matches, RD widens toward the
 * default (uncertainty grows when a player isn't being evaluated).
 */
export function updateRating(player: Rating, matches: Match[]): Rating {
  const mu = (player.rating - 1500) / SCALE;
  const phi = player.rd / SCALE;
  let sigma = player.volatility;

  if (matches.length === 0) {
    const phiStar = Math.sqrt(phi * phi + sigma * sigma);
    return { rating: player.rating, rd: Math.min(phiStar * SCALE, 350), volatility: sigma };
  }

  // Estimated variance (v) and improvement direction (delta) across matches.
  let vInv = 0;
  let deltaSum = 0;
  for (const m of matches) {
    const muJ = (m.opponent.rating - 1500) / SCALE;
    const phiJ = m.opponent.rd / SCALE;
    const gj = g(phiJ);
    const e = expected(mu, muJ, phiJ);
    const w = m.weight ?? 1;
    vInv += w * gj * gj * e * (1 - e);
    deltaSum += w * gj * (m.score - e);
  }
  const v = 1 / vInv;
  const delta = v * deltaSum;

  // Volatility update via Illinois algorithm (from the Glickman paper).
  const a = Math.log(sigma * sigma);
  const f = (x: number) => {
    const ex = Math.exp(x);
    const num = ex * (delta * delta - phi * phi - v - ex);
    const den = 2 * (phi * phi + v + ex) ** 2;
    return num / den - (x - a) / (TAU * TAU);
  };
  let A = a;
  let B: number;
  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v);
  } else {
    let k = 1;
    while (f(a - k * TAU) < 0) k++;
    B = a - k * TAU;
  }
  let fA = f(A);
  let fB = f(B);
  while (Math.abs(B - A) > EPSILON) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) { A = B; fA = fB; } else { fA = fA / 2; }
    B = C; fB = fC;
  }
  sigma = Math.exp(A / 2);

  // Apply to phi/mu.
  const phiStar = Math.sqrt(phi * phi + sigma * sigma);
  const phiPrime = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muPrime = mu + phiPrime * phiPrime * deltaSum;

  return {
    rating: muPrime * SCALE + 1500,
    rd: Math.min(phiPrime * SCALE, 350),
    volatility: sigma,
  };
}
