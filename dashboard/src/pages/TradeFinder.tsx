import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import {
  Search,
  X,
  ChevronDown,
  Loader2,
  ArrowDown,
  ArrowUp,
  Info,
  User,
  FileText,
  SlidersHorizontal,
} from 'lucide-react';
import {
  analyzeTrade,
  calculateSideValue,
  type TradeAsset as ValueAdjustmentAsset
} from '../lib/trade-value-adjustment';

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

interface TradeScenario {
  give: TradeAsset[];
  get: TradeAsset[];
  giveTotal: number;
  getTotal: number;
  giveAdjusted: number;
  getAdjusted: number;
  difference: number;
  adjustedDifference: number;
  differencePercent: number;
  fairness: 'fair' | 'slight' | 'unfair' | 'lopsided';
  partnerRoster: Roster;
}

type TradeMode = 'dump' | 'acquire';
type AssetPreference = 'all' | 'players' | 'picks';

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

// Asset selection dropdown with multi-select
function AssetDropdown({
  isOpen,
  onClose,
  title,
  items,
  selectedIds,
  onToggle,
  emptyMessage = 'No items available',
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  items: TradeAsset[];
  selectedIds: string[];
  onToggle: (item: TradeAsset) => void;
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
          <div className="flex items-center gap-2">
            {selectedIds.length > 0 && (
              <span className="text-xs text-accent-400 font-medium">{selectedIds.length} selected</span>
            )}
            <button onClick={onClose} className="p-1.5 hover:bg-[#151515] rounded-lg transition-colors">
              <X className="h-4 w-4 text-[#666666]" />
            </button>
          </div>
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
              {filteredItems.map((item) => {
                const isSelected = selectedIds.includes(item.id);
                return (
                  <button
                    key={item.id}
                    onClick={() => onToggle(item)}
                    className={`w-full px-4 py-3 flex items-center justify-between gap-3 transition-colors ${isSelected ? 'bg-accent-500/10' : 'hover:bg-[#111111]'}`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${isSelected ? 'bg-accent-500 border-accent-500' : 'border-[#333333]'}`}>
                        {isSelected && <span className="text-white text-[10px] font-bold">&#10003;</span>}
                      </div>
                      <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded shrink-0 ${getPositionBadgeClass(item.type === 'player' ? (item.position || '') : 'PICK')}`}>
                        {item.type === 'player' ? item.position : 'PICK'}
                      </span>
                      <span className="text-sm text-white truncate">{item.name}</span>
                    </div>
                    <span className="text-xs font-semibold text-accent-400 tabular-nums shrink-0">{item.value.toLocaleString()}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-4 py-3 bg-[#080808] border-t border-[#151515]">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-accent-500 hover:bg-accent-600 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </>
  );
}

// Team selector dropdown
function TeamDropdown({
  isOpen,
  onClose,
  title,
  rosters,
  excludeRosterId,
  onSelect,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  rosters: Roster[];
  excludeRosterId?: number;
  onSelect: (roster: Roster) => void;
}) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  useClickOutside(dropdownRef, onClose);
  if (!isOpen) return null;

  const filteredRosters = rosters.filter(r => r.roster_id !== excludeRosterId);

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      <div
        ref={dropdownRef}
        className="fixed z-50 left-4 right-4 top-1/2 -translate-y-1/2 max-w-sm mx-auto bg-[#0a0a0a] border border-[#222222] rounded-xl shadow-2xl overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-[#151515] flex items-center justify-between">
          <span className="text-sm font-semibold text-white">{title}</span>
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

export function TradeFinder() {
  const [tradeMode, setTradeMode] = useState<TradeMode>('dump');
  const [myRoster, setMyRoster] = useState<Roster | null>(null);
  const [targetRoster, setTargetRoster] = useState<Roster | null>(null);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [tolerance, setTolerance] = useState(10);
  const [assetPreference, setAssetPreference] = useState<AssetPreference>('all');
  const [scenarios, setScenarios] = useState<TradeScenario[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState<'myTeam' | 'targetTeam' | 'assets' | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    setSelectedAssetIds([]);
    setScenarios([]);
  }, [tradeMode, myRoster, targetRoster]);

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
    queryKey: ['rosters-finder', currentLeagueId, leagueIds?.previous],
    enabled: !!currentLeagueId,
    queryFn: async () => {
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
          wins: prev ? prev.wins : roster.wins || 0,
          losses: prev ? prev.losses : roster.losses || 0,
          fpts: prev ? prev.fpts : Number(roster.fpts) || 0,
          ownerName: owner?.display_name || owner?.username || 'Unknown',
          teamName: owner?.team_name || null,
        };
      }) as Roster[];
    },
  });

  useQuery({
    queryKey: ['players-finder'],
    queryFn: async () => {
      const { data } = await supabase.from('players').select('player_id, full_name, position, team');
      return (data as Player[]) || [];
    },
  });

  const { data: playerValues, isLoading: valuesLoading } = useQuery({
    queryKey: ['playerValues-finder'],
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
    queryKey: ['pickValues-finder'],
    queryFn: async () => {
      const { data } = await supabase.from('pick_values').select('pick_year, pick_round, pick_tier, value');
      return (data as PickValue[]) || [];
    },
  });

  const { data: tradedPicks } = useQuery({
    queryKey: ['tradedPicks-finder', currentLeagueId],
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

  const getPlayersOwnedByRoster = useCallback((roster: Roster): TradeAsset[] => {
    if (!playerValues) return [];
    const assets: TradeAsset[] = [];
    (roster.players || []).forEach((pid: string) => {
      const pv = playerValues.get(pid);
      if (pv && pv.value > 0) {
        assets.push({
          id: `player-${pid}`,
          type: 'player',
          name: pv.player.full_name,
          value: pv.value,
          position: pv.player.position,
          team: pv.player.team,
        });
      }
    });
    return assets.sort((a, b) => b.value - a.value);
  }, [playerValues]);

  const availableAssets = useMemo(() => {
    const roster = tradeMode === 'dump' ? myRoster : targetRoster;
    if (!roster) return [];
    return [...getPlayersOwnedByRoster(roster), ...getPicksOwnedByRoster(roster.roster_id)];
  }, [tradeMode, myRoster, targetRoster, getPlayersOwnedByRoster, getPicksOwnedByRoster]);

  const selectedAssets = useMemo(() => {
    return availableAssets.filter(a => selectedAssetIds.includes(a.id));
  }, [availableAssets, selectedAssetIds]);

  const selectedValueInfo = useMemo(() => {
    const sideValue = calculateSideValue(selectedAssets as ValueAdjustmentAsset[]);
    return {
      raw: sideValue.rawTotal,
      adjusted: sideValue.adjustedTotal,
      breakdown: sideValue.adjustmentBreakdown,
    };
  }, [selectedAssets]);

  const handleAssetToggle = (asset: TradeAsset) => {
    setSelectedAssetIds(prev =>
      prev.includes(asset.id)
        ? prev.filter(id => id !== asset.id)
        : [...prev, asset.id]
    );
  };

  const removeAsset = (assetId: string) => {
    setSelectedAssetIds(prev => prev.filter(id => id !== assetId));
  };

  const getPreferenceScore = (combo: TradeAsset[], preference: AssetPreference): number => {
    if (preference === 'all') return 50;
    const totalValue = combo.reduce((sum, a) => sum + a.value, 0);
    if (totalValue === 0) return 0;
    const playerValue = combo.filter(a => a.type === 'player').reduce((sum, a) => sum + a.value, 0);
    const pickValue = combo.filter(a => a.type === 'pick').reduce((sum, a) => sum + a.value, 0);
    if (preference === 'players') return Math.round((playerValue / totalValue) * 100);
    if (preference === 'picks') return Math.round((pickValue / totalValue) * 100);
    return 50;
  };

  const findTrades = useCallback(() => {
    if (!rosters || selectedAssets.length === 0) return;

    setIsSearching(true);
    setScenarios([]);

    setTimeout(() => {
      try {
        const adjustedValue = selectedValueInfo.adjusted;
        const minValue = adjustedValue * (1 - tolerance / 100);
        const maxValue = adjustedValue * (1 + tolerance / 100);
        const newScenarios: TradeScenario[] = [];

        const teamsToSearch = tradeMode === 'dump'
          ? rosters.filter(r => r.roster_id !== myRoster?.roster_id)
          : myRoster ? [myRoster] : [];

        teamsToSearch.forEach(searchRoster => {
          const searchAssets = [
            ...getPlayersOwnedByRoster(searchRoster),
            ...getPicksOwnedByRoster(searchRoster.roster_id),
          ];

          const combinations: TradeAsset[][] = [];
          searchAssets.forEach(a => combinations.push([a]));
          for (let i = 0; i < searchAssets.length; i++) {
            for (let j = i + 1; j < searchAssets.length; j++) {
              combinations.push([searchAssets[i], searchAssets[j]]);
            }
          }
          const topAssets = searchAssets.slice(0, 25);
          for (let i = 0; i < topAssets.length; i++) {
            for (let j = i + 1; j < topAssets.length; j++) {
              for (let k = j + 1; k < topAssets.length; k++) {
                combinations.push([topAssets[i], topAssets[j], topAssets[k]]);
              }
            }
          }

          combinations.forEach(combo => {
            const comboValue = calculateSideValue(combo as ValueAdjustmentAsset[]);
            const comboAdjusted = comboValue.adjustedTotal;

            if (comboAdjusted >= minValue && comboAdjusted <= maxValue) {
              const analysis = tradeMode === 'dump'
                ? analyzeTrade(selectedAssets as ValueAdjustmentAsset[], combo as ValueAdjustmentAsset[])
                : analyzeTrade(combo as ValueAdjustmentAsset[], selectedAssets as ValueAdjustmentAsset[]);

              const giveAdjusted = analysis.side1.adjustedTotal;
              const getAdjusted = analysis.side2.adjustedTotal;
              const rawDiff = comboValue.rawTotal - selectedValueInfo.raw;
              const adjustedDiff = getAdjusted - giveAdjusted;
              const diffPercent = giveAdjusted > 0 ? (adjustedDiff / giveAdjusted) * 100 : 0;

              if (tradeMode === 'dump') {
                newScenarios.push({
                  give: selectedAssets,
                  get: combo,
                  giveTotal: selectedValueInfo.raw,
                  getTotal: comboValue.rawTotal,
                  giveAdjusted,
                  getAdjusted,
                  difference: rawDiff,
                  adjustedDifference: adjustedDiff,
                  differencePercent: diffPercent,
                  fairness: analysis.fairness,
                  partnerRoster: searchRoster,
                });
              } else {
                newScenarios.push({
                  give: combo,
                  get: selectedAssets,
                  giveTotal: comboValue.rawTotal,
                  getTotal: selectedValueInfo.raw,
                  giveAdjusted,
                  getAdjusted,
                  difference: -rawDiff,
                  adjustedDifference: -adjustedDiff,
                  differencePercent: -diffPercent,
                  fairness: analysis.fairness,
                  partnerRoster: targetRoster!,
                });
              }
            }
          });
        });

        newScenarios.sort((a, b) => {
          const aCombo = tradeMode === 'dump' ? a.get : a.give;
          const bCombo = tradeMode === 'dump' ? b.get : b.give;
          const aPreferenceScore = getPreferenceScore(aCombo, assetPreference);
          const bPreferenceScore = getPreferenceScore(bCombo, assetPreference);
          const maxDiff = Math.max(...newScenarios.map(s => Math.abs(s.adjustedDifference)), 1);
          const aValueScore = 100 - (Math.abs(a.adjustedDifference) / maxDiff) * 100;
          const bValueScore = 100 - (Math.abs(b.adjustedDifference) / maxDiff) * 100;

          if (assetPreference !== 'all') {
            const aBlended = (aPreferenceScore * 0.6) + (aValueScore * 0.4);
            const bBlended = (bPreferenceScore * 0.6) + (bValueScore * 0.4);
            return bBlended - aBlended;
          }
          return Math.abs(a.adjustedDifference) - Math.abs(b.adjustedDifference);
        });
        setScenarios(newScenarios.slice(0, 50));
      } finally {
        setIsSearching(false);
      }
    }, 100);
  }, [rosters, myRoster, targetRoster, selectedAssets, selectedValueInfo, tolerance, tradeMode, assetPreference, getPlayersOwnedByRoster, getPicksOwnedByRoster]);

  const isLoading = rostersLoading || valuesLoading || picksLoading;
  const canSearch = tradeMode === 'dump'
    ? myRoster && selectedAssetIds.length > 0
    : myRoster && targetRoster && selectedAssetIds.length > 0;

  // Which team the user picks assets from
  const assetSourceRoster = tradeMode === 'dump' ? myRoster : targetRoster;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-accent-500" />
      </div>
    );
  }

  const fairnessBadge = (f: string) => {
    switch (f) {
      case 'fair': return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20';
      case 'slight': return 'bg-blue-500/15 text-blue-400 border-blue-500/20';
      case 'unfair': return 'bg-amber-500/15 text-amber-400 border-amber-500/20';
      case 'lopsided': return 'bg-red-500/15 text-red-400 border-red-500/20';
      default: return 'bg-[#111111] text-[#555555]';
    }
  };

  const fairnessBorder = (f: string) => {
    switch (f) {
      case 'fair': return 'border-emerald-500/25';
      case 'slight': return 'border-blue-500/25';
      default: return 'border-[#1a1a1a]';
    }
  };

  return (
    <div>
      {/* Unified Setup Card */}
      <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl overflow-hidden mb-4">
        {/* Mode Toggle - integrated as card header */}
        <div className="flex border-b border-[#151515]">
          <button
            onClick={() => setTradeMode('dump')}
            className={`flex-1 py-3 flex items-center justify-center gap-2 text-sm font-medium transition-all ${
              tradeMode === 'dump'
                ? 'text-accent-400 bg-accent-500/8 border-b-2 border-accent-500 -mb-px'
                : 'text-[#555555] hover:text-[#888888]'
            }`}
          >
            <ArrowUp className="h-4 w-4" />
            Trade Away
          </button>
          <button
            onClick={() => setTradeMode('acquire')}
            className={`flex-1 py-3 flex items-center justify-center gap-2 text-sm font-medium transition-all ${
              tradeMode === 'acquire'
                ? 'text-accent-400 bg-accent-500/8 border-b-2 border-accent-500 -mb-px'
                : 'text-[#555555] hover:text-[#888888]'
            }`}
          >
            <ArrowDown className="h-4 w-4" />
            Acquire
          </button>
        </div>

        {/* Setup Steps */}
        <div className="p-4 space-y-3">
          {/* Step 1: Team selection(s) */}
          {tradeMode === 'dump' ? (
            <button
              onClick={() => setDropdownOpen('myTeam')}
              className="w-full p-3 rounded-lg border border-[#1a1a1a] hover:border-[#333333] transition-colors flex items-center justify-between"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#111111] flex items-center justify-center shrink-0">
                  <User className="h-4 w-4 text-[#555555]" />
                </div>
                <div className="text-left">
                  <span className="text-[10px] text-[#555555] block leading-tight">Your Team</span>
                  <span className={`text-sm font-medium ${myRoster ? 'text-white' : 'text-[#444444]'}`}>
                    {myRoster ? (myRoster.teamName || myRoster.ownerName) : 'Select...'}
                  </span>
                </div>
              </div>
              <ChevronDown className="h-4 w-4 text-[#444444]" />
            </button>
          ) : (
            <>
              <button
                onClick={() => setDropdownOpen('targetTeam')}
                className="w-full p-3 rounded-lg border border-[#1a1a1a] hover:border-[#333333] transition-colors flex items-center justify-between"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[#111111] flex items-center justify-center shrink-0">
                    <User className="h-4 w-4 text-[#555555]" />
                  </div>
                  <div className="text-left">
                    <span className="text-[10px] text-[#555555] block leading-tight">Trade With</span>
                    <span className={`text-sm font-medium ${targetRoster ? 'text-white' : 'text-[#444444]'}`}>
                      {targetRoster ? (targetRoster.teamName || targetRoster.ownerName) : 'Select...'}
                    </span>
                  </div>
                </div>
                <ChevronDown className="h-4 w-4 text-[#444444]" />
              </button>
            </>
          )}

          {/* Step 2: Asset Selection */}
          {assetSourceRoster && (
            <>
              <button
                onClick={() => setDropdownOpen('assets')}
                className="w-full p-3 rounded-lg border border-[#1a1a1a] hover:border-[#333333] transition-colors flex items-center justify-between"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-[#111111] flex items-center justify-center shrink-0">
                    <Search className="h-4 w-4 text-[#555555]" />
                  </div>
                  <div className="text-left">
                    <span className="text-[10px] text-[#555555] block leading-tight">
                      {tradeMode === 'dump' ? 'Assets to Trade' : 'Assets You Want'}
                    </span>
                    <span className={`text-sm ${selectedAssets.length > 0 ? 'text-white font-medium' : 'text-[#444444]'}`}>
                      {selectedAssets.length > 0 ? `${selectedAssets.length} selected` : 'Select players or picks...'}
                    </span>
                  </div>
                </div>
                <ChevronDown className="h-4 w-4 text-[#444444] shrink-0" />
              </button>

              {/* Selected Asset Chips */}
              {selectedAssets.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-1">
                  {selectedAssets.map(asset => (
                    <span
                      key={asset.id}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium ${getPositionBadgeClass(asset.type === 'player' ? (asset.position || '') : 'PICK')}`}
                    >
                      {asset.name.length > 15 ? asset.name.slice(0, 15) + '...' : asset.name}
                      <button
                        onClick={(e) => { e.stopPropagation(); removeAsset(asset.id); }}
                        className="ml-0.5 hover:opacity-70"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Value Summary */}
              {selectedAssets.length > 0 && (
                <div className="flex items-center justify-between px-3 py-2 bg-accent-500/8 rounded-lg">
                  <span className="text-xs text-[#888888]">Adjusted Value</span>
                  <span className="text-sm font-bold text-accent-400 tabular-nums">
                    {selectedValueInfo.adjusted.toLocaleString()}
                    {selectedValueInfo.raw !== selectedValueInfo.adjusted && (
                      <span className="text-[10px] text-[#555555] font-normal ml-1.5">
                        (raw {selectedValueInfo.raw.toLocaleString()})
                      </span>
                    )}
                  </span>
                </div>
              )}
            </>
          )}

          {/* Step 3 (acquire only): Your team */}
          {tradeMode === 'acquire' && targetRoster && (
            <button
              onClick={() => setDropdownOpen('myTeam')}
              className="w-full p-3 rounded-lg border border-[#1a1a1a] hover:border-[#333333] transition-colors flex items-center justify-between"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#111111] flex items-center justify-center shrink-0">
                  <User className="h-4 w-4 text-[#555555]" />
                </div>
                <div className="text-left">
                  <span className="text-[10px] text-[#555555] block leading-tight">Your Team</span>
                  <span className={`text-sm font-medium ${myRoster ? 'text-white' : 'text-[#444444]'}`}>
                    {myRoster ? (myRoster.teamName || myRoster.ownerName) : 'Select...'}
                  </span>
                </div>
              </div>
              <ChevronDown className="h-4 w-4 text-[#444444]" />
            </button>
          )}
        </div>

        {/* Filters Row - collapsible */}
        <div className="border-t border-[#151515]">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="w-full px-4 py-2.5 flex items-center justify-between text-xs text-[#555555] hover:text-[#888888] transition-colors"
          >
            <div className="flex items-center gap-1.5">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>Filters</span>
              {(assetPreference !== 'all' || tolerance !== 10) && (
                <span className="px-1.5 py-0.5 bg-accent-500/15 text-accent-400 rounded text-[10px] font-medium">
                  {assetPreference !== 'all' ? assetPreference : ''}{assetPreference !== 'all' && tolerance !== 10 ? ' · ' : ''}{tolerance !== 10 ? `${tolerance}%` : ''}
                </span>
              )}
            </div>
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </button>

          {showFilters && (
            <div className="px-4 pb-4 pt-1 flex flex-col sm:flex-row gap-4">
              {/* Preference */}
              <div className="flex-1">
                <span className="text-[10px] font-semibold text-[#555555] uppercase tracking-wider block mb-1.5">
                  {tradeMode === 'dump' ? 'Prefer to receive' : 'Prefer to give up'}
                </span>
                <div className="flex gap-1">
                  {(['all', 'players', 'picks'] as AssetPreference[]).map(pref => (
                    <button
                      key={pref}
                      onClick={() => setAssetPreference(pref)}
                      className={`flex-1 py-1.5 px-2 rounded-md text-xs font-medium transition-all flex items-center justify-center gap-1 ${
                        assetPreference === pref
                          ? 'bg-accent-500/15 text-accent-400'
                          : 'text-[#555555] hover:text-[#888888] hover:bg-[#111111]'
                      }`}
                    >
                      {pref === 'players' && <User className="h-3 w-3" />}
                      {pref === 'picks' && <FileText className="h-3 w-3" />}
                      {pref === 'all' ? 'Any' : pref === 'players' ? 'Players' : 'Picks'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tolerance */}
              <div className="sm:w-40">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-semibold text-[#555555] uppercase tracking-wider">Tolerance</span>
                  <span className="text-xs font-bold text-accent-400 tabular-nums">&plusmn;{tolerance}%</span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={25}
                  step={5}
                  value={tolerance}
                  onChange={(e) => setTolerance(Number(e.target.value))}
                  className="w-full h-1.5 bg-[#222222] rounded-full appearance-none cursor-pointer accent-accent-500"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Search Button */}
      <button
        onClick={findTrades}
        disabled={!canSearch || isSearching}
        className={`w-full py-3.5 rounded-xl font-semibold text-white text-sm transition-all flex items-center justify-center gap-2 ${
          canSearch && !isSearching
            ? 'bg-accent-500 hover:bg-accent-600 shadow-lg shadow-accent-500/20'
            : 'bg-[#1a1a1a] text-[#444444] cursor-not-allowed'
        }`}
      >
        {isSearching ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Searching...
          </>
        ) : (
          <>
            <Search className="h-4 w-4" />
            Find Trades
          </>
        )}
      </button>

      {/* Results */}
      {scenarios.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-white">
              Trade Scenarios
            </h2>
            <span className="text-xs text-[#555555] tabular-nums">
              {scenarios.length} found
            </span>
          </div>

          <div className="space-y-2.5">
            {scenarios.map((scenario, idx) => (
              <div
                key={idx}
                className={`bg-[#0a0a0a] border rounded-xl overflow-hidden ${fairnessBorder(scenario.fairness)}`}
              >
                {/* Card Header */}
                <div className="px-4 py-2.5 flex items-center justify-between border-b border-[#111111]">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">
                      {scenario.partnerRoster.teamName || scenario.partnerRoster.ownerName}
                    </span>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${fairnessBadge(scenario.fairness)}`}>
                      {scenario.fairness}
                    </span>
                  </div>
                  <span className={`text-xs font-semibold tabular-nums ${
                    Math.abs(scenario.differencePercent) < 5 ? 'text-emerald-400' : 'text-[#555555]'
                  }`}>
                    {scenario.adjustedDifference >= 0 ? '+' : ''}{scenario.adjustedDifference.toLocaleString()}
                  </span>
                </div>

                {/* Give / Get */}
                <div className="grid grid-cols-[1fr,1fr] divide-x divide-[#111111]">
                  {/* Give Side */}
                  <div className="p-3">
                    <div className="text-[10px] font-semibold text-red-400/70 uppercase tracking-wider mb-2 flex items-center justify-between">
                      <span>Give</span>
                      <span className="text-[#444444] font-normal tabular-nums">{scenario.giveAdjusted.toLocaleString()}</span>
                    </div>
                    <div className="space-y-1.5">
                      {scenario.give.map((asset, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                          <span className={`px-1 py-0.5 text-[9px] font-bold rounded shrink-0 ${getPositionBadgeClass(asset.type === 'player' ? (asset.position || '') : 'PICK')}`}>
                            {asset.type === 'player' ? asset.position : 'PICK'}
                          </span>
                          <span className="text-xs text-white truncate">{asset.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Get Side */}
                  <div className="p-3">
                    <div className="text-[10px] font-semibold text-emerald-400/70 uppercase tracking-wider mb-2 flex items-center justify-between">
                      <span>Get</span>
                      <span className="text-[#444444] font-normal tabular-nums">{scenario.getAdjusted.toLocaleString()}</span>
                    </div>
                    <div className="space-y-1.5">
                      {scenario.get.map((asset, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                          <span className={`px-1 py-0.5 text-[9px] font-bold rounded shrink-0 ${getPositionBadgeClass(asset.type === 'player' ? (asset.position || '') : 'PICK')}`}>
                            {asset.type === 'player' ? asset.position : 'PICK'}
                          </span>
                          <span className="text-xs text-white truncate">{asset.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Adjustment Info */}
                {scenario.difference !== scenario.adjustedDifference && (
                  <div className="px-4 py-2 border-t border-[#111111] flex items-center gap-1.5">
                    <Info className="h-3 w-3 text-[#333333] shrink-0" />
                    <span className="text-[10px] text-[#444444]">
                      Raw: {scenario.difference >= 0 ? '+' : ''}{scenario.difference.toLocaleString()} &rarr;
                      Adj: {scenario.adjustedDifference >= 0 ? '+' : ''}{scenario.adjustedDifference.toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {scenarios.length === 0 && selectedAssets.length > 0 && !isSearching && (
        <div className="mt-6 py-8 text-center">
          <p className="text-sm text-[#444444]">
            Hit "Find Trades" to discover matching scenarios
          </p>
        </div>
      )}

      {/* Dropdowns */}
      <TeamDropdown
        isOpen={dropdownOpen === 'myTeam'}
        onClose={() => setDropdownOpen(null)}
        title="Select Your Team"
        rosters={rosters || []}
        excludeRosterId={targetRoster?.roster_id}
        onSelect={(roster) => setMyRoster(roster)}
      />
      <TeamDropdown
        isOpen={dropdownOpen === 'targetTeam'}
        onClose={() => setDropdownOpen(null)}
        title="Select Team to Trade With"
        rosters={rosters || []}
        excludeRosterId={myRoster?.roster_id}
        onSelect={(roster) => setTargetRoster(roster)}
      />
      <AssetDropdown
        isOpen={dropdownOpen === 'assets'}
        onClose={() => setDropdownOpen(null)}
        title={tradeMode === 'dump' ? 'Select Assets to Trade Away' : 'Select Assets You Want'}
        items={availableAssets}
        selectedIds={selectedAssetIds}
        onToggle={handleAssetToggle}
        emptyMessage="No players or picks available"
      />
    </div>
  );
}
