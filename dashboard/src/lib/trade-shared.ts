import { useEffect, useCallback } from 'react';
import type { Player, PlayerValue, PickValue, Roster, TradedPick, TradeAsset, Fairness } from '../types/domain';
export type { Player, PlayerValue, PickValue, Roster, TradedPick, TradeAsset, Fairness } from '../types/domain';

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
