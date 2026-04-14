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

export function getPickDisplayName(year: string, round: number, tier: string): string {
  const roundSuffix = round === 1 ? '1st' : round === 2 ? '2nd' : round === 3 ? '3rd' : `${round}th`;
  return `${year} ${tier} ${roundSuffix}`;
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

  for (const year of futureYears) {
    for (const round of rounds) {
      for (const originalRoster of rosters) {
        const tradedPick = tradedPicks.find(
          (tp) => tp.season === year && tp.round === round && tp.roster_id === originalRoster.roster_id
        );
        const currentOwnerId = tradedPick ? tradedPick.owner_id : originalRoster.roster_id;
        if (currentOwnerId === rosterId) {
          const tier = getProjectedPickTier(originalRoster.roster_id, rosters);
          const pickValue = pickValues.find(
            (pv) => pv.pick_year === year && pv.pick_round === round && pv.pick_tier === tier
          );
          if (pickValue) {
            const pickName = getPickDisplayName(year, round, tier);
            const displayName = originalRoster.roster_id !== rosterId
              ? `${pickName} (via ${originalRoster.ownerName})`
              : pickName;
            picks.push({
              id: `pick-${year}-${round}-${originalRoster.roster_id}`,
              type: 'pick',
              name: displayName,
              value: pickValue.value,
              pickYear: year,
              pickRound: round,
              pickTier: tier,
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
