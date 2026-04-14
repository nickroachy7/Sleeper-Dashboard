import { useEffect, useCallback } from 'react';
import type { Player, PlayerValue, PickValue, Roster, TradedPick, TradeAsset, Fairness } from '../types/domain';
export type { Player, PlayerValue, PickValue, Roster, TradedPick, TradeAsset, Fairness } from '../types/domain';

// ── Positional Weighting (Superflex Calibration) ──────────────────
// Starter counts per position in a Superflex league (QB+SF, 2RB+flex, 3WR+flex, 1TE).
// Full value for starters, 50% for quality depth, 10% for deep bench.
// Shared between KTCValues Team tab, Trade Evaluator's roster impact,
// and Trade Finder's roster-fit scoring so "team strength at position X"
// means the same thing everywhere.

export type RosterPosition = 'QB' | 'RB' | 'WR' | 'TE';

export const POSITION_WEIGHT_TIERS: Record<RosterPosition, { full: number; reduced: number }> = {
  QB: { full: 2, reduced: 1 }, // 2 starters (QB + SF), 3rd at 50%, 4th+ at 10%
  RB: { full: 3, reduced: 2 }, // 3 starters (2RB + flex), 4th-5th at 50%, 6th+ at 10%
  WR: { full: 3, reduced: 2 }, // 3 starters (3WR + flex), 4th-5th at 50%, 6th+ at 10%
  TE: { full: 1, reduced: 1 }, // 1 starter, 2nd at 50%, 3rd+ at 10%
};

/**
 * Weighted positional value for a list of assets at one position.
 * Diminishing returns: starters get full value, depth 50%, deep bench 10%.
 */
export function calcWeightedPositionValue(
  assets: { value: number }[],
  position: string
): number {
  const sorted = [...assets].sort((a, b) => b.value - a.value);
  const tiers =
    POSITION_WEIGHT_TIERS[position as RosterPosition] ?? { full: 3, reduced: 2 };

  let total = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (i < tiers.full) {
      total += sorted[i].value; // 100%
    } else if (i < tiers.full + tiers.reduced) {
      total += Math.round(sorted[i].value * 0.5); // 50%
    } else {
      total += Math.round(sorted[i].value * 0.1); // 10%
    }
  }
  return total;
}

// ── Roster Strength ───────────────────────────────────────────────
// A single metric for "how strong is this roster, by position and overall".
// Used to compute trade fit (does the trade improve/hurt my positional balance?)
// and to gate Trade Finder scenarios where the partner's roster would get worse.

export interface RosterStrength {
  total: number;              // Sum of all weighted positional values + picks
  byPosition: Record<RosterPosition, number>;
  picksValue: number;         // Raw sum of all pick values on the roster
  picksCount: number;
  playerCount: number;
}

export function computeRosterStrength(assets: TradeAsset[]): RosterStrength {
  const byPosition: Record<RosterPosition, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
  const positionGroups: Record<RosterPosition, TradeAsset[]> = { QB: [], RB: [], WR: [], TE: [] };
  let picksValue = 0;
  let picksCount = 0;
  let playerCount = 0;

  for (const asset of assets) {
    if (asset.type === 'pick') {
      picksValue += asset.value;
      picksCount += 1;
      continue;
    }
    playerCount += 1;
    const pos = asset.position as RosterPosition | undefined;
    if (pos && pos in positionGroups) {
      positionGroups[pos].push(asset);
    }
  }

  (Object.keys(positionGroups) as RosterPosition[]).forEach((pos) => {
    byPosition[pos] = calcWeightedPositionValue(positionGroups[pos], pos);
  });

  const total =
    byPosition.QB + byPosition.RB + byPosition.WR + byPosition.TE + picksValue;

  return { total, byPosition, picksValue, picksCount, playerCount };
}

/**
 * Simulate a trade on a roster: take current assets, remove the ones being
 * given up, add the ones being received, return before/after strength +
 * per-position deltas.
 */
export interface RosterImpact {
  before: RosterStrength;
  after: RosterStrength;
  delta: {
    total: number;
    byPosition: Record<RosterPosition, number>;
    picksValue: number;
  };
}

export function simulateTradeOnRoster(
  currentAssets: TradeAsset[],
  giving: TradeAsset[],
  receiving: TradeAsset[]
): RosterImpact {
  const givingIds = new Set(giving.map((a) => a.id));
  const afterAssets = [
    ...currentAssets.filter((a) => !givingIds.has(a.id)),
    ...receiving,
  ];

  const before = computeRosterStrength(currentAssets);
  const after = computeRosterStrength(afterAssets);

  return {
    before,
    after,
    delta: {
      total: after.total - before.total,
      byPosition: {
        QB: after.byPosition.QB - before.byPosition.QB,
        RB: after.byPosition.RB - before.byPosition.RB,
        WR: after.byPosition.WR - before.byPosition.WR,
        TE: after.byPosition.TE - before.byPosition.TE,
      },
      picksValue: after.picksValue - before.picksValue,
    },
  };
}

/**
 * A "roster fit" score in [-100, 100] for a trade from one team's perspective.
 * Rewards improving weak positions, penalizes piling onto already-strong
 * positions, rewards total value gain. Uses league-relative context so
 * "weak" and "strong" are defined relative to the other rosters in the league.
 */
export function computeRosterFitScore(
  impact: RosterImpact,
  leagueContext: { medianByPosition: Record<RosterPosition, number>; medianTotal: number }
): number {
  // Normalize delta against league median. A +1000 gain at a position where
  // the median is 20000 is ~5 points. Relative change matters more than raw.
  const positionFit = (pos: RosterPosition): number => {
    const delta = impact.delta.byPosition[pos];
    const before = impact.before.byPosition[pos];
    const median = leagueContext.medianByPosition[pos] || 1;

    // Relative current strength: <1 means weak, >1 means strong
    const currentStrength = before / median;

    // If weak (<0.8), rewards improvement ~2x. If strong (>1.2), penalizes glut.
    let multiplier = 1;
    if (currentStrength < 0.8) multiplier = 2;
    else if (currentStrength > 1.2) multiplier = 0.3;

    // Normalize delta to a ~[-1, 1] range against median
    const normalized = Math.max(-1, Math.min(1, delta / median));
    return normalized * multiplier * 25; // each position can contribute ±25-50
  };

  const positional =
    positionFit('QB') + positionFit('RB') + positionFit('WR') + positionFit('TE');

  // Bonus for absolute total improvement (picks + players combined)
  const totalNormalized = Math.max(
    -1,
    Math.min(1, impact.delta.total / Math.max(leagueContext.medianTotal * 0.05, 1))
  );
  const totalBonus = totalNormalized * 20;

  return Math.max(-100, Math.min(100, positional + totalBonus));
}

/**
 * Compute league context (positional medians) from all rosters' assets.
 * Used as the reference frame for roster-fit scoring.
 */
export function computeLeagueContext(
  allRosterAssets: TradeAsset[][]
): { medianByPosition: Record<RosterPosition, number>; medianTotal: number } {
  const strengths = allRosterAssets.map(computeRosterStrength);

  const median = (nums: number[]): number => {
    if (nums.length === 0) return 0;
    const sorted = [...nums].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  };

  return {
    medianByPosition: {
      QB: median(strengths.map((s) => s.byPosition.QB)),
      RB: median(strengths.map((s) => s.byPosition.RB)),
      WR: median(strengths.map((s) => s.byPosition.WR)),
      TE: median(strengths.map((s) => s.byPosition.TE)),
    },
    medianTotal: median(strengths.map((s) => s.total)),
  };
}

// ── Position Colors ────────────────────────────────────────────────

export const POSITION_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  QB: { bg: 'bg-red-500/15', text: 'text-red-400', dot: 'bg-red-400' },
  RB: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', dot: 'bg-emerald-400' },
  WR: { bg: 'bg-blue-500/15', text: 'text-blue-400', dot: 'bg-blue-400' },
  TE: { bg: 'bg-orange-500/15', text: 'text-orange-400', dot: 'bg-orange-400' },
  PICK: { bg: 'bg-cyan-500/15', text: 'text-cyan-400', dot: 'bg-cyan-400' },
  K: { bg: 'bg-yellow-500/15', text: 'text-yellow-400', dot: 'bg-yellow-400' },
  DEF: { bg: 'bg-purple-500/15', text: 'text-purple-400', dot: 'bg-purple-400' },
};

export function getPositionBadgeClass(position: string): string {
  const colors = POSITION_COLORS[position];
  if (!colors) return 'bg-[#111111] text-[#555555]';
  return `${colors.bg} ${colors.text}`;
}

export function getPositionColor(position: string): string {
  return POSITION_COLORS[position]?.dot || 'bg-[#555555]';
}

// ── Pick Utilities ─────────────────────────────────────────────────

export function getProjectedPickTier(roster_id: number, rosters: Roster[]): string {
  const sortedRosters = [...rosters].sort((a, b) => {
    const winsA = a.wins || 0;
    const winsB = b.wins || 0;
    if (winsA !== winsB) return winsB - winsA;
    const fptsA = Number(a.fpts) || 0;
    const fptsB = Number(b.fpts) || 0;
    return fptsB - fptsA;
  });
  const standing = sortedRosters.findIndex((r) => r.roster_id === roster_id) + 1;
  const totalRosters = rosters.length;
  if (standing > (totalRosters * 2) / 3) return 'Early';
  if (standing > totalRosters / 3) return 'Mid';
  return 'Late';
}

/**
 * Get the projected draft slot (1-based) for a roster based on standings.
 * Worst team gets slot 1 (first pick), best team gets the last slot.
 */
export function getProjectedPickSlot(roster_id: number, rosters: Roster[]): number {
  const sortedRosters = [...rosters].sort((a, b) => {
    const winsA = a.wins || 0;
    const winsB = b.wins || 0;
    if (winsA !== winsB) return winsB - winsA;
    const fptsA = Number(a.fpts) || 0;
    const fptsB = Number(b.fpts) || 0;
    return fptsB - fptsA;
  });
  // Reverse: worst team = slot 1
  const standing = sortedRosters.findIndex((r) => r.roster_id === roster_id) + 1;
  return rosters.length - standing + 1;
}

/**
 * Interpolate per-slot pick values for an entire draft year.
 * Mirrors KTC's calcPicksSimpleSingleMode algorithm:
 * - Takes ALL tier values for a year (sorted descending by value)
 * - Generates leagueSize individual slot values per round
 * - Extrapolates above the highest and below the lowest
 * - Linear interpolation between consecutive tier values
 *
 * Returns a Map: round -> number[] (one value per slot, index 0 = pick 1)
 */
export function interpolateAllPickSlots(
  pickValues: PickValue[],
  season: string,
  leagueSize: number
): Map<number, number[]> {
  // Get all tier values for this year, sorted descending (highest first)
  const yearPicks = pickValues
    .filter((pv) => pv.pick_year === season)
    .sort((a, b) => b.value - a.value);

  const result = new Map<number, number[]>();
  if (yearPicks.length === 0) {
    for (const round of [1, 2, 3, 4]) {
      const fallback = round === 1 ? 5000 : round === 2 ? 2000 : round === 3 ? 800 : 400;
      result.set(round, Array(leagueSize).fill(fallback));
    }
    return result;
  }

  // KTC algorithm: interpolate between consecutive tier values
  // 2 slots above top, 4 slots between each pair, 2 slots below bottom
  const allValues: number[] = [];
  const tierValues = yearPicks.map((p) => p.value);

  for (let i = 0; i < tierValues.length - 1; i++) {
    const high = tierValues[i];
    const low = tierValues[i + 1];
    const step = (high - low) / 8;

    if (i === 0) {
      // Extrapolate 2 picks above the highest tier
      allValues.push(Math.min(9999, Math.round(high + 7 * step)));
      allValues.push(Math.min(9999, Math.round(high + 3 * step)));
    }

    // 4 interpolated values between tiers (steps 1,3,5,7)
    for (let s = 1; s < 8; s++) {
      allValues.push(Math.round(high - s * step));
      s++; // skip every other
    }

    if (i === tierValues.length - 2) {
      // Extrapolate 2 picks below the lowest tier
      allValues.push(Math.max(0, Math.round(low - step)));
      allValues.push(Math.max(0, Math.round(low - 3 * step)));
    }
  }

  // Split into rounds: each round gets leagueSize picks
  for (let round = 1; round <= 4; round++) {
    const startIdx = (round - 1) * leagueSize;
    const roundValues: number[] = [];
    for (let slot = 0; slot < leagueSize; slot++) {
      const idx = startIdx + slot;
      roundValues.push(idx < allValues.length ? allValues[idx] : allValues[allValues.length - 1] || 0);
    }
    result.set(round, roundValues);
  }

  return result;
}

/**
 * Look up a pick's KTC value from the pick_values table.
 * If slot and leagueSize are provided, uses interpolated per-slot values.
 * Otherwise defaults to "Mid" tier lookup.
 * Falls back to a conservative hardcoded value if no DB match is found.
 */
export function lookupPickValue(
  pickValues: PickValue[],
  season: string,
  round: number,
  opts?: { tier?: string | null; slot?: number; leagueSize?: number }
): number {
  // If we have slot info, use interpolated values
  if (opts?.slot && opts?.leagueSize) {
    const allSlots = interpolateAllPickSlots(pickValues, season, opts.leagueSize);
    const roundSlots = allSlots.get(round);
    if (roundSlots) {
      const idx = Math.max(0, Math.min(opts.slot - 1, roundSlots.length - 1));
      return roundSlots[idx];
    }
  }

  // Tier-based lookup
  const resolvedTier = opts?.tier || 'Mid';
  const match = pickValues.find(
    (pv) => pv.pick_year === season && pv.pick_round === round && pv.pick_tier === resolvedTier
  );
  if (match) return match.value;
  // Fallback: try any tier for that year/round
  const anyTier = pickValues.find(
    (pv) => pv.pick_year === season && pv.pick_round === round
  );
  if (anyTier) return anyTier.value;
  // Last resort hardcoded fallback
  return round === 1 ? 5000 : round === 2 ? 2000 : round === 3 ? 800 : 400;
}

export function getPickDisplayName(year: string, round: number, tier: string): string {
  const roundSuffix = round === 1 ? '1st' : round === 2 ? '2nd' : round === 3 ? '3rd' : `${round}th`;
  return `${year} ${tier} ${roundSuffix}`;
}

/**
 * Format a pick with slot number: "2026 Pick 1.03"
 */
export function getPickSlotDisplayName(year: string, round: number, slot: number): string {
  const slotStr = slot < 10 ? `0${slot}` : `${slot}`;
  return `${year} Pick ${round}.${slotStr}`;
}

// ── Hooks ──────────────────────────────────────────────────────────

export function useClickOutside(ref: React.RefObject<HTMLElement | null>, callback: () => void) {
  const stableCallback = useCallback(callback, [callback]);
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        stableCallback();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [ref, stableCallback]);
}

// ── Roster Data Fetching Helpers ───────────────────────────────────

export function buildPicksForRoster(
  rosterId: number,
  rosters: Roster[],
  pickValues: PickValue[],
  tradedPicks: TradedPick[]
): TradeAsset[] {
  const picks: TradeAsset[] = [];
  const futureYears = ['2025', '2026', '2027', '2028'];
  const rounds = [1, 2, 3, 4];
  const leagueSize = rosters.length;

  // Pre-compute interpolated slot values per year for efficiency
  const yearSlotCache = new Map<string, Map<number, number[]>>();
  for (const year of futureYears) {
    yearSlotCache.set(year, interpolateAllPickSlots(pickValues, year, leagueSize));
  }

  for (const year of futureYears) {
    const yearSlots = yearSlotCache.get(year)!;
    for (const round of rounds) {
      const roundSlots = yearSlots.get(round);
      for (const originalRoster of rosters) {
        const tradedPick = tradedPicks.find(
          (tp) => tp.season === year && tp.round === round && tp.roster_id === originalRoster.roster_id
        );
        const currentOwnerId = tradedPick ? tradedPick.owner_id : originalRoster.roster_id;
        if (currentOwnerId === rosterId) {
          const slot = getProjectedPickSlot(originalRoster.roster_id, rosters);
          const value = roundSlots
            ? roundSlots[Math.max(0, Math.min(slot - 1, roundSlots.length - 1))]
            : 0;
          if (value > 0) {
            const pickName = getPickSlotDisplayName(year, round, slot);
            const displayName = originalRoster.roster_id !== rosterId
              ? `${pickName} (via ${originalRoster.ownerName})`
              : pickName;
            picks.push({
              id: `pick-${year}-${round}-${originalRoster.roster_id}`,
              type: 'pick',
              name: displayName,
              value,
              pickYear: year,
              pickRound: round,
              pickTier: getProjectedPickTier(originalRoster.roster_id, rosters),
            });
          }
        }
      }
    }
  }
  return picks.sort((a, b) => b.value - a.value);
}

export function buildPlayersForRoster(
  roster: Roster,
  playerValues: Map<string, PlayerValue>,
  players?: Player[]
): TradeAsset[] {
  const assets: TradeAsset[] = [];
  for (const playerId of roster.players || []) {
    const pv = playerValues.get(playerId);
    if (pv && pv.player) {
      assets.push({
        id: `player-${playerId}`,
        type: 'player',
        name: pv.player.full_name,
        value: pv.value,
        position: pv.player.position,
        team: pv.player.team,
      });
    } else if (players) {
      const player = players.find((p) => p.player_id === playerId);
      if (player) {
        assets.push({
          id: `player-${playerId}`,
          type: 'player',
          name: player.full_name,
          value: 0,
          position: player.position,
          team: player.team,
        });
      }
    }
  }
  return assets.sort((a, b) => b.value !== a.value ? b.value - a.value : a.name.localeCompare(b.name));
}

// ── Fairness Config ────────────────────────────────────────────────

export const FAIRNESS_CONFIG: Record<Fairness, {
  label: string;
  border: string;
  text: string;
  badge: string;
  barColor: string;
}> = {
  fair: {
    label: 'Fair Trade',
    border: 'border-emerald-500/30',
    text: 'text-emerald-400',
    badge: 'bg-emerald-500/15 text-emerald-400',
    barColor: 'bg-emerald-500',
  },
  slight: {
    label: 'Slightly Uneven',
    border: 'border-blue-500/30',
    text: 'text-blue-400',
    badge: 'bg-blue-500/15 text-blue-400',
    barColor: 'bg-blue-500',
  },
  unfair: {
    label: 'Unfair',
    border: 'border-amber-500/30',
    text: 'text-amber-400',
    badge: 'bg-amber-500/15 text-amber-400',
    barColor: 'bg-amber-500',
  },
  lopsided: {
    label: 'Lopsided',
    border: 'border-red-500/30',
    text: 'text-red-400',
    badge: 'bg-red-500/15 text-red-400',
    barColor: 'bg-red-500',
  },
};

// ── Sleeper CDN ────────────────────────────────────────────────────

export function getPlayerImageUrl(playerId: string): string {
  return `https://sleepercdn.com/content/nfl/players/${playerId}.jpg`;
}

export function getTeamDisplayName(roster: Roster): string {
  return roster.teamName || roster.ownerName;
}
