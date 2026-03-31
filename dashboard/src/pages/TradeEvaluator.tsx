import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import {
  ArrowLeftRight,
  Plus,
  X,
  Search,
  ChevronDown,
  Loader2,
  Scale,
  RotateCcw,
  Info,
  AlertTriangle,
} from 'lucide-react';
import { analyzeTrade, calculateSideValue, type TradeAsset as ValueAdjustmentAsset } from '../lib/trade-value-adjustment';

// Types
interface Player {
  player_id: string;
  full_name: string;
  position: string;
  team: string | null;
}

interface PlayerValue {
  player_id: string;
  value: number;
  player: {
    full_name: string;
    position: string;
    team: string | null;
  };
}

interface PickValue {
  pick_year: string;
  pick_round: number;
  pick_tier: string | null;
  value: number;
}

interface Roster {
  roster_id: number;
  owner_id: string;
  players: string[];
  wins: number;
  losses: number;
  fpts: number;
  ownerName: string;
  teamName: string | null;
}

interface TradedPick {
  season: string;
  round: number;
  roster_id: number;
  owner_id: number;
}

interface TradeAsset {
  id: string;
  type: 'player' | 'pick';
  name: string;
  value: number;
  position?: string;
  team?: string | null;
  pickYear?: string;
  pickRound?: number;
  pickTier?: string;
}

interface TradeSide {
  rosterId: number;
  assets: TradeAsset[];
}

const getPositionBadgeClass = (position: string): string => {
  switch (position) {
    case 'QB': return 'bg-red-500/20 text-red-400';
    case 'RB': return 'bg-emerald-500/20 text-emerald-400';
    case 'WR': return 'bg-blue-500/20 text-blue-400';
    case 'TE': return 'bg-orange-500/20 text-orange-400';
    case 'PICK': return 'bg-cyan-500/20 text-cyan-400';
    default: return 'bg-[#111111] text-[#555555]';
  }
};

function getProjectedPickTier(roster_id: number, rosters: Roster[]): string {
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

function getPickDisplayName(year: string, round: number, tier: string): string {
  const roundSuffix = round === 1 ? '1st' : round === 2 ? '2nd' : round === 3 ? '3rd' : `${round}th`;
  return `${year} ${tier} ${roundSuffix}`;
}

function useClickOutside(ref: React.RefObject<HTMLElement | null>, callback: () => void) {
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        callback();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [ref, callback]);
}

// Shared modal dropdown for selecting assets
function AssetDropdown({
  isOpen,
  onClose,
  title,
  items,
  onSelect,
  emptyMessage = 'No items available',
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  items: TradeAsset[];
  onSelect: (item: TradeAsset) => void;
  emptyMessage?: string;
}) {
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useClickOutside(dropdownRef, onClose);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
    if (!isOpen) setSearch('');
  }, [isOpen]);

  const filteredItems = useMemo(() => {
    if (!search) return items;
    const query = search.toLowerCase();
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(query) ||
        item.position?.toLowerCase().includes(query) ||
        item.team?.toLowerCase().includes(query)
    );
  }, [items, search]);

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      <div
        ref={dropdownRef}
        className="fixed z-50 left-4 right-4 top-1/2 -translate-y-1/2 max-w-md mx-auto bg-[#0a0a0a] border border-[#222222] rounded-xl shadow-2xl overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-[#151515] flex items-center justify-between">
          <span className="text-sm font-semibold text-white">{title}</span>
          <button onClick={onClose} className="p-1.5 hover:bg-[#151515] rounded-lg transition-colors">
            <X className="h-4 w-4 text-[#666666]" />
          </button>
        </div>

        <div className="p-3 border-b border-[#151515]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#555555]" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 text-sm bg-[#111111] border border-[#222222] rounded-lg text-white placeholder-[#555555] focus:outline-none focus:border-accent-500/50 transition-colors"
            />
          </div>
        </div>

        <div className="max-h-80 overflow-y-auto overscroll-contain">
          {filteredItems.length === 0 ? (
            <div className="p-8 text-sm text-[#555555] text-center">{emptyMessage}</div>
          ) : (
            <div className="divide-y divide-[#111111]">
              {filteredItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => { onSelect(item); onClose(); }}
                  className="w-full px-4 py-3 hover:bg-[#111111] transition-colors flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${getPositionBadgeClass(item.type === 'player' ? (item.position || '') : 'PICK')}`}>
                      {item.type === 'player' ? item.position : 'PICK'}
                    </span>
                    <span className="text-sm text-white truncate">{item.name}</span>
                  </div>
                  <span className="text-xs font-semibold text-accent-400 tabular-nums shrink-0">{item.value.toLocaleString()}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// Team selector dropdown
function TeamDropdown({
  isOpen,
  onClose,
  rosters,
  excludeRosterIds,
  onSelect,
}: {
  isOpen: boolean;
  onClose: () => void;
  rosters: Roster[];
  excludeRosterIds: number[];
  onSelect: (roster: Roster) => void;
}) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  useClickOutside(dropdownRef, onClose);
  if (!isOpen) return null;

  const filteredRosters = rosters.filter(r => !excludeRosterIds.includes(r.roster_id));

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      <div
        ref={dropdownRef}
        className="fixed z-50 left-4 right-4 top-1/2 -translate-y-1/2 max-w-sm mx-auto bg-[#0a0a0a] border border-[#222222] rounded-xl shadow-2xl overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-[#151515] flex items-center justify-between">
          <span className="text-sm font-semibold text-white">Select Team</span>
          <button onClick={onClose} className="p-1.5 hover:bg-[#151515] rounded-lg transition-colors">
            <X className="h-4 w-4 text-[#666666]" />
          </button>
        </div>
        <div className="max-h-80 overflow-y-auto overscroll-contain divide-y divide-[#111111]">
          {filteredRosters.map((roster) => (
            <button
              key={roster.roster_id}
              onClick={() => { onSelect(roster); onClose(); }}
              className="w-full px-4 py-3 text-left hover:bg-[#111111] transition-colors flex items-center justify-between"
            >
              <span className="text-sm text-white font-medium">{roster.teamName || roster.ownerName}</span>
              <span className="text-xs text-[#555555] tabular-nums">{roster.wins}-{roster.losses}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

export function TradeEvaluator() {
  const [tradeSides, setTradeSides] = useState<TradeSide[]>([
    { rosterId: 0, assets: [] },
    { rosterId: 0, assets: [] },
  ]);
  const [activeDropdown, setActiveDropdown] = useState<{ side: number; type: 'player' | 'pick' | 'team' } | null>(null);

  // Fetch the two most recent leagues (current for rosters, previous for standings fallback)
  const { data: leagueIds } = useQuery({
    queryKey: ['tradeLeagues'],
    queryFn: async () => {
      const { data } = await supabase.from('leagues').select('league_id').order('season', { ascending: false }).limit(2);
      return { current: data?.[0]?.league_id as string, previous: data?.[1]?.league_id as string | undefined };
    },
  });
  const currentLeagueId = leagueIds?.current;

  const { data: rosters, isLoading: rostersLoading } = useQuery({
    queryKey: ['rosters-trade', currentLeagueId, leagueIds?.previous],
    enabled: !!currentLeagueId,
    queryFn: async () => {
      // Always use current league for roster/players (most up-to-date)
      const { data: rostersData } = await supabase.from('rosters').select('*').eq('league_id', currentLeagueId!);
      const { data: users } = await supabase.from('users').select('*');
      if (!rostersData?.length) return [];

      // If all teams are 0-0 (new season), pull win/loss from previous season for pick tier projections
      const allZero = (rostersData as any[]).every((r: any) => (r.wins || 0) === 0 && (r.losses || 0) === 0);
      let prevStandings: Map<string, { wins: number; losses: number; fpts: number }> | null = null;
      if (allZero && leagueIds?.previous) {
        const { data: prevRosters } = await supabase.from('rosters').select('owner_id, wins, losses, fpts').eq('league_id', leagueIds.previous);
        if (prevRosters?.length) {
          prevStandings = new Map();
          for (const pr of prevRosters as any[]) {
            prevStandings.set(pr.owner_id, { wins: pr.wins || 0, losses: pr.losses || 0, fpts: Number(pr.fpts) || 0 });
          }
        }
      }

      return (rostersData as any[]).map((roster: any) => {
        const owner = (users as any[])?.find((u: any) => u.user_id === roster.owner_id);
        const prev = prevStandings?.get(roster.owner_id);
        return {
          ...roster,
          // Use previous season standings for pick tier projections when current season hasn't started
          wins: prev ? prev.wins : roster.wins || 0,
          losses: prev ? prev.losses : roster.losses || 0,
          fpts: prev ? prev.fpts : Number(roster.fpts) || 0,
          ownerName: owner?.display_name || owner?.username || 'Unknown',
          teamName: owner?.team_name || null,
        };
      }) as Roster[];
    },
  });

  const { data: players } = useQuery({
    queryKey: ['players-trade'],
    queryFn: async () => {
      const { data } = await supabase.from('players').select('player_id, full_name, position, team');
      return (data as Player[]) || [];
    },
  });

  const { data: playerValues, isLoading: valuesLoading } = useQuery({
    queryKey: ['playerValues-trade'],
    queryFn: async () => {
      const { data } = await supabase
        .from('player_values')
        .select('player_id, value, player:players(full_name, position, team)');
      const valueMap = new Map<string, PlayerValue>();
      (data || []).forEach((pv: any) => {
        const player = Array.isArray(pv.player) ? pv.player[0] : pv.player;
        if (player) valueMap.set(pv.player_id, { ...pv, player });
      });
      return valueMap;
    },
  });

  const { data: pickValues, isLoading: picksLoading } = useQuery({
    queryKey: ['pickValues-trade'],
    queryFn: async () => {
      const { data } = await supabase.from('pick_values').select('pick_year, pick_round, pick_tier, value');
      return (data as PickValue[]) || [];
    },
  });

  const { data: tradedPicks } = useQuery({
    queryKey: ['tradedPicks-trade', currentLeagueId],
    enabled: !!currentLeagueId,
    queryFn: async () => {
      const { data } = await supabase.from('traded_picks').select('season, round, roster_id, owner_id').eq('league_id', currentLeagueId!);
      return (data as TradedPick[]) || [];
    },
  });

  const getPicksOwnedByRoster = useCallback((rosterId: number): TradeAsset[] => {
    if (!rosters || !pickValues || !tradedPicks) return [];
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
  }, [rosters, pickValues, tradedPicks]);

  const getPlayersOwnedByRoster = useCallback((rosterId: number): TradeAsset[] => {
    if (!rosters) return [];
    const roster = rosters.find((r) => r.roster_id === rosterId);
    if (!roster || !roster.players) return [];

    const playerAssets: TradeAsset[] = [];
    for (const playerId of roster.players) {
      const pv = playerValues?.get(playerId);
      if (pv && pv.player) {
        playerAssets.push({
          id: `player-${playerId}`,
          type: 'player',
          name: pv.player.full_name,
          value: pv.value,
          position: pv.player.position,
          team: pv.player.team,
        });
      } else {
        const player = players?.find((p) => p.player_id === playerId);
        if (player) {
          playerAssets.push({
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
    return playerAssets.sort((a, b) => b.value !== a.value ? b.value - a.value : a.name.localeCompare(b.name));
  }, [rosters, playerValues, players]);

  const getAvailableAssets = useCallback((sideIndex: number, type: 'player' | 'pick') => {
    const rosterId = tradeSides[sideIndex].rosterId;
    const assets = type === 'player' ? getPlayersOwnedByRoster(rosterId) : getPicksOwnedByRoster(rosterId);
    const addedIds = new Set(tradeSides[sideIndex].assets.filter((a) => a.type === type).map((a) => a.id));
    return assets.filter((a) => !addedIds.has(a.id));
  }, [tradeSides, getPlayersOwnedByRoster, getPicksOwnedByRoster]);

  const addAsset = useCallback((sideIndex: number, asset: TradeAsset) => {
    setTradeSides((prev) => {
      const updated = [...prev];
      updated[sideIndex] = { ...updated[sideIndex], assets: [...updated[sideIndex].assets, asset] };
      return updated;
    });
  }, []);

  const removeAsset = useCallback((sideIndex: number, assetId: string) => {
    setTradeSides((prev) => {
      const updated = [...prev];
      updated[sideIndex] = { ...updated[sideIndex], assets: updated[sideIndex].assets.filter((a) => a.id !== assetId) };
      return updated;
    });
  }, []);

  const setRoster = useCallback((sideIndex: number, roster: Roster) => {
    setTradeSides((prev) => {
      const updated = [...prev];
      updated[sideIndex] = { rosterId: roster.roster_id, assets: [] };
      return updated;
    });
  }, []);

  const swapSides = useCallback(() => {
    setTradeSides((prev) => [prev[1], prev[0]]);
  }, []);

  const resetTrade = useCallback(() => {
    setTradeSides([{ rosterId: 0, assets: [] }, { rosterId: 0, assets: [] }]);
    setActiveDropdown(null);
  }, []);

  const totals = useMemo(() => {
    return tradeSides.map((side) => calculateSideValue(side.assets as ValueAdjustmentAsset[]));
  }, [tradeSides]);

  const tradeAnalysis = useMemo(() => {
    if (tradeSides.some((s) => s.rosterId === 0) || tradeSides.some((s) => s.assets.length === 0)) return null;
    return analyzeTrade(
      tradeSides[0].assets as ValueAdjustmentAsset[],
      tradeSides[1].assets as ValueAdjustmentAsset[]
    );
  }, [tradeSides]);

  const getExcludedRosterIds = useCallback((currentSideIndex: number) => {
    return tradeSides.filter((_, i) => i !== currentSideIndex).map((s) => s.rosterId).filter((id) => id > 0);
  }, [tradeSides]);

  const isLoading = rostersLoading || valuesLoading || picksLoading;
  const hasAssets = tradeSides.some((s) => s.assets.length > 0);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-accent-500" />
      </div>
    );
  }

  const fairnessConfig = {
    fair: { label: 'Fair Trade', color: 'emerald', bg: 'bg-emerald-500', border: 'border-emerald-500/40', text: 'text-emerald-400', badge: 'bg-emerald-500/15 text-emerald-400' },
    slight: { label: 'Slightly Uneven', color: 'blue', bg: 'bg-blue-500', border: 'border-blue-500/40', text: 'text-blue-400', badge: 'bg-blue-500/15 text-blue-400' },
    unfair: { label: 'Unfair', color: 'amber', bg: 'bg-amber-500', border: 'border-amber-500/40', text: 'text-amber-400', badge: 'bg-amber-500/15 text-amber-400' },
    lopsided: { label: 'Lopsided', color: 'red', bg: 'bg-red-500', border: 'border-red-500/40', text: 'text-red-400', badge: 'bg-red-500/15 text-red-400' },
  };

  // Determine winner/loser sides
  const winnerIdx = tradeAnalysis ? tradeAnalysis.winnerIndex : null;
  const loserIdx = winnerIdx !== null ? (winnerIdx === 0 ? 1 : 0) : null;

  return (
    <div>
      {/* Reset button */}
      {hasAssets && (
        <div className="flex justify-end mb-3">
          <button
            onClick={resetTrade}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[#555555] hover:text-white hover:bg-[#111111] rounded-lg text-xs font-medium transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
        </div>
      )}

      {/* Trade Builder - Side by Side on desktop */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr,auto,1fr] gap-3 md:gap-0">
        {tradeSides.map((side, sideIndex) => {
          const sideTotal = totals[sideIndex];
          const isWinner = winnerIdx === sideIndex;
          const isLoser = loserIdx === sideIndex;
          const roster = rosters?.find(r => r.roster_id === side.rosterId);
          const sideColor = isWinner ? 'emerald' : isLoser ? 'red' : null;

          return (
            <div
              key={sideIndex}
              className={`bg-[#0a0a0a] border rounded-xl overflow-hidden ${
                isWinner ? 'border-emerald-500/30' : isLoser ? 'border-red-500/30' : 'border-[#1a1a1a]'
              }`}
            >
              {/* Team Header */}
              <button
                onClick={() => setActiveDropdown({ side: sideIndex, type: 'team' })}
                className="w-full px-4 py-3 border-b border-[#151515] flex items-center justify-between hover:bg-[#0d0d0d] transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {isWinner && <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />}
                  {isLoser && <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />}
                  <span className={`text-sm font-semibold truncate ${roster ? 'text-white' : 'text-[#555555]'}`}>
                    {roster ? (roster.teamName || roster.ownerName) : 'Select team...'}
                  </span>
                </div>
                <ChevronDown className="h-4 w-4 text-[#555555] shrink-0" />
              </button>

              {/* Assets */}
              <div className="p-3 min-h-[140px]">
                {side.rosterId === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full py-8 text-[#333333]">
                    <p className="text-xs">Select a team to start</p>
                  </div>
                ) : (
                  <>
                    {/* Asset List */}
                    {side.assets.length > 0 && (
                      <div className="space-y-1 mb-3">
                        {side.assets.map((asset) => (
                          <div
                            key={asset.id}
                            className="flex items-center justify-between gap-2 group px-2.5 py-2 rounded-lg hover:bg-[#111111] transition-colors"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded shrink-0 ${getPositionBadgeClass(asset.type === 'player' ? (asset.position || '') : 'PICK')}`}>
                                {asset.type === 'player' ? asset.position : 'PICK'}
                              </span>
                              <span className="text-sm text-white truncate">{asset.name}</span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-xs text-[#555555] tabular-nums">{asset.value.toLocaleString()}</span>
                              <button
                                onClick={() => removeAsset(sideIndex, asset.id)}
                                className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-red-500/10 transition-all"
                              >
                                <X className="h-3 w-3 text-[#555555] hover:text-red-400" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add Buttons */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => setActiveDropdown({ side: sideIndex, type: 'player' })}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-[#222222] text-xs text-[#555555] hover:border-accent-500/40 hover:text-accent-400 hover:bg-accent-500/5 transition-all"
                      >
                        <Plus className="h-3 w-3" />
                        Player
                      </button>
                      <button
                        onClick={() => setActiveDropdown({ side: sideIndex, type: 'pick' })}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-[#222222] text-xs text-[#555555] hover:border-cyan-500/40 hover:text-cyan-400 hover:bg-cyan-500/5 transition-all"
                      >
                        <Plus className="h-3 w-3" />
                        Pick
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Value Footer */}
              {side.assets.length > 0 && (
                <div className={`px-4 py-2.5 border-t ${
                  isWinner ? 'border-emerald-500/20 bg-emerald-500/5' : isLoser ? 'border-red-500/20 bg-red-500/5' : 'border-[#151515] bg-[#080808]'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-[#555555] uppercase tracking-wider">Total</span>
                    <span className={`text-base font-bold tabular-nums ${
                      isWinner ? 'text-emerald-400' : isLoser ? 'text-red-400' : 'text-white'
                    }`}>
                      {sideTotal.adjustedTotal.toLocaleString()}
                    </span>
                  </div>
                  {sideTotal.rawTotal !== sideTotal.adjustedTotal && (
                    <p className="text-[10px] text-[#444444] mt-0.5 text-right">
                      raw {sideTotal.rawTotal.toLocaleString()} &middot; {sideTotal.adjustmentBreakdown}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Center Swap Button (between the two sides on desktop) */}
        <div className="hidden md:flex flex-col items-center justify-center px-3">
          <button
            onClick={swapSides}
            className="w-10 h-10 rounded-full bg-[#111111] border border-[#222222] flex items-center justify-center hover:bg-[#1a1a1a] hover:border-[#333333] transition-all group"
            title="Swap sides"
          >
            <ArrowLeftRight className="w-4 h-4 text-[#555555] group-hover:text-white transition-colors" />
          </button>
        </div>
      </div>

      {/* Mobile Swap Button */}
      <div className="flex md:hidden justify-center -mt-1.5 -mb-1.5 relative z-10">
        <button
          onClick={swapSides}
          className="w-8 h-8 rounded-full bg-[#111111] border border-[#222222] flex items-center justify-center hover:bg-[#1a1a1a] transition-all"
          title="Swap sides"
        >
          <ArrowLeftRight className="w-3.5 h-3.5 text-[#555555]" />
        </button>
      </div>

      {/* Trade Analysis Verdict */}
      {tradeAnalysis && (
        <div className={`mt-4 rounded-xl border overflow-hidden ${fairnessConfig[tradeAnalysis.fairness].border}`}>
          {/* Fairness Bar */}
          <div className="px-4 py-3 bg-[#0a0a0a]">
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2">
                <Scale className={`h-4 w-4 ${fairnessConfig[tradeAnalysis.fairness].text}`} />
                <span className="text-sm font-semibold text-white">
                  {fairnessConfig[tradeAnalysis.fairness].label}
                </span>
              </div>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${fairnessConfig[tradeAnalysis.fairness].badge}`}>
                {tradeAnalysis.adjustedDifference.toLocaleString()} gap
              </span>
            </div>

            {/* Visual Balance Bar */}
            <div className="relative h-2 bg-[#151515] rounded-full overflow-hidden">
              {(() => {
                const total = totals[0].adjustedTotal + totals[1].adjustedTotal;
                const side1Pct = total > 0 ? (totals[0].adjustedTotal / total) * 100 : 50;
                return (
                  <>
                    <div
                      className="absolute left-0 top-0 h-full bg-gradient-to-r from-emerald-500/60 to-emerald-500/30 rounded-l-full transition-all duration-500"
                      style={{ width: `${Math.min(side1Pct, 100)}%` }}
                    />
                    <div
                      className="absolute right-0 top-0 h-full bg-gradient-to-l from-red-500/60 to-red-500/30 rounded-r-full transition-all duration-500"
                      style={{ width: `${Math.min(100 - side1Pct, 100)}%` }}
                    />
                    <div
                      className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3 bg-white/40 rounded-full transition-all duration-500"
                      style={{ left: `${side1Pct}%` }}
                    />
                  </>
                );
              })()}
            </div>

            {/* Winner label */}
            <div className="flex items-center justify-between mt-2">
              <span className="text-[10px] text-[#444444]">
                {rosters?.find(r => r.roster_id === tradeSides[0].rosterId)?.teamName || rosters?.find(r => r.roster_id === tradeSides[0].rosterId)?.ownerName}
              </span>
              <span className="text-[10px] text-[#444444]">
                {rosters?.find(r => r.roster_id === tradeSides[1].rosterId)?.teamName || rosters?.find(r => r.roster_id === tradeSides[1].rosterId)?.ownerName}
              </span>
            </div>
          </div>

          {/* Details (collapsible feel - always shown but subtle) */}
          {(tradeAnalysis.rawDifference !== tradeAnalysis.adjustedDifference || tradeAnalysis.tierMismatchExplanation) && (
            <div className="px-4 py-2.5 bg-[#080808] border-t border-[#151515] space-y-1.5">
              {tradeAnalysis.rawDifference !== tradeAnalysis.adjustedDifference && (
                <div className="flex items-center gap-1.5">
                  <Info className="h-3 w-3 text-[#444444] shrink-0" />
                  <span className="text-[10px] text-[#555555]">
                    Raw difference: {tradeAnalysis.rawDifference.toLocaleString()} &rarr; Adjusted: {tradeAnalysis.adjustedDifference.toLocaleString()}
                  </span>
                </div>
              )}
              {tradeAnalysis.tierMismatchExplanation && (
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="h-3 w-3 text-amber-500/60 shrink-0" />
                  <span className="text-[10px] text-amber-400/70">{tradeAnalysis.tierMismatchExplanation}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Dropdowns */}
      {tradeSides.map((_, sideIndex) => (
        <div key={sideIndex}>
          <TeamDropdown
            isOpen={activeDropdown?.side === sideIndex && activeDropdown?.type === 'team'}
            onClose={() => setActiveDropdown(null)}
            rosters={rosters || []}
            excludeRosterIds={getExcludedRosterIds(sideIndex)}
            onSelect={(roster) => setRoster(sideIndex, roster)}
          />
          <AssetDropdown
            isOpen={activeDropdown?.side === sideIndex && activeDropdown?.type === 'player'}
            onClose={() => setActiveDropdown(null)}
            title="Add Player"
            items={getAvailableAssets(sideIndex, 'player')}
            onSelect={(asset) => addAsset(sideIndex, asset)}
            emptyMessage="No players available"
          />
          <AssetDropdown
            isOpen={activeDropdown?.side === sideIndex && activeDropdown?.type === 'pick'}
            onClose={() => setActiveDropdown(null)}
            title="Add Pick"
            items={getAvailableAssets(sideIndex, 'pick')}
            onSelect={(asset) => addAsset(sideIndex, asset)}
            emptyMessage="No picks available"
          />
        </div>
      ))}
    </div>
  );
}

export default TradeEvaluator;
