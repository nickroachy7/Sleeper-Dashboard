import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import {
  Search,
  X,
  ChevronDown,
  Loader2,
  ArrowLeftRight,
  TrendingUp,
  TrendingDown,
  Users,
  Info,
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

// Position badge classes
const getPositionBadgeClass = (position: string): string => {
  switch (position) {
    case 'QB':
      return 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-500/30';
    case 'RB':
      return 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30';
    case 'WR':
      return 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30';
    case 'TE':
      return 'bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-500/30';
    case 'PICK':
      return 'bg-cyan-100 dark:bg-cyan-500/20 text-cyan-700 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-500/30';
    default:
      return 'bg-slate-100 dark:bg-zinc-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-zinc-600';
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

// Asset selection dropdown
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
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div
        ref={dropdownRef}
        className="fixed z-50 left-4 right-4 top-1/2 -translate-y-1/2 max-w-lg mx-auto bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl shadow-2xl overflow-hidden"
      >
        <div className="px-4 py-3 bg-slate-50 dark:bg-zinc-800/50 border-b border-slate-200 dark:border-zinc-700 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{title}</span>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-200 dark:hover:bg-zinc-700 rounded-lg transition-colors">
            <X className="h-4 w-4 text-slate-400" />
          </button>
        </div>

        <div className="p-3 border-b border-slate-200 dark:border-zinc-700">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search players or picks..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 text-sm bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent transition-colors"
            />
          </div>
        </div>

        <div className="px-4 py-2 bg-slate-50 dark:bg-zinc-800/30 border-b border-slate-100 dark:border-zinc-800">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {selectedIds.length > 0 ? `${selectedIds.length} selected • ` : ''}
            Showing {filteredItems.length} {filteredItems.length === 1 ? 'asset' : 'assets'}
          </span>
        </div>

        <div className="max-h-96 overflow-y-auto overscroll-contain">
          {filteredItems.length === 0 ? (
            <div className="p-8 text-sm text-slate-500 text-center">{emptyMessage}</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 dark:bg-zinc-800/50 border-b border-slate-200 dark:border-zinc-700">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-8"></th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Asset</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Type</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                {filteredItems.map((item) => {
                  const isSelected = selectedIds.includes(item.id);
                  return (
                    <tr
                      key={item.id}
                      onClick={() => onToggle(item)}
                      className={`cursor-pointer transition-colors ${isSelected ? 'bg-accent-50 dark:bg-accent-900/20' : 'hover:bg-slate-50 dark:hover:bg-zinc-800/50'}`}
                    >
                      <td className="px-4 py-3">
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-accent-500 border-accent-500' : 'border-slate-300 dark:border-zinc-600'}`}>
                          {isSelected && <span className="text-white text-xs">✓</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-slate-900 dark:text-white font-medium">{item.name}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-lg ${getPositionBadgeClass(item.type === 'player' ? (item.position || '') : 'PICK')}`}>
                          {item.type === 'player' ? item.position : 'PICK'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-bold text-accent-600 dark:text-accent-400">{item.value.toLocaleString()}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        
        <div className="px-4 py-3 bg-slate-50 dark:bg-zinc-800/50 border-t border-slate-200 dark:border-zinc-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-accent-500 hover:bg-accent-600 text-white text-sm font-medium rounded-lg transition-colors"
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
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div
        ref={dropdownRef}
        className="fixed z-50 left-4 right-4 top-1/2 -translate-y-1/2 max-w-md mx-auto bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl shadow-2xl overflow-hidden"
      >
        <div className="px-4 py-3 bg-slate-50 dark:bg-zinc-800/50 border-b border-slate-200 dark:border-zinc-700 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{title}</span>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-200 dark:hover:bg-zinc-700 rounded-lg transition-colors">
            <X className="h-4 w-4 text-slate-400" />
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto overscroll-contain divide-y divide-slate-100 dark:divide-zinc-800">
          {filteredRosters.map((roster) => (
            <button
              key={roster.roster_id}
              onClick={() => { onSelect(roster); onClose(); }}
              className="w-full px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors flex items-center justify-between"
            >
              <span className="text-sm text-slate-900 dark:text-white font-medium">
                {roster.teamName || roster.ownerName}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {roster.wins}-{roster.losses}
              </span>
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
  const [scenarios, setScenarios] = useState<TradeScenario[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState<'myTeam' | 'targetTeam' | 'assets' | null>(null);

  // Reset when mode changes
  useEffect(() => {
    setSelectedAssetIds([]);
    setScenarios([]);
  }, [tradeMode, myRoster, targetRoster]);

  // Fetch rosters
  const { data: rosters, isLoading: rostersLoading } = useQuery({
    queryKey: ['rosters-finder'],
    queryFn: async () => {
      const { data: rostersData } = await supabase.from('rosters').select('*');
      const { data: users } = await supabase.from('users').select('*');
      if (!rostersData?.length) return [];
      return (rostersData as any[]).map((roster: any) => {
        const owner = (users as any[])?.find((u: any) => u.user_id === roster.owner_id);
        return { 
          ...roster, 
          ownerName: owner?.display_name || owner?.username || 'Unknown',
          teamName: owner?.team_name || null,
        };
      }) as Roster[];
    },
  });

  // Fetch players (used for type reference in playerValues query)
  useQuery({
    queryKey: ['players-finder'],
    queryFn: async () => {
      const { data } = await supabase.from('players').select('player_id, full_name, position, team');
      return (data as Player[]) || [];
    },
  });

  // Fetch player values
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

  // Fetch pick values
  const { data: pickValues, isLoading: picksLoading } = useQuery({
    queryKey: ['pickValues-finder'],
    queryFn: async () => {
      const { data } = await supabase.from('pick_values').select('pick_year, pick_round, pick_tier, value');
      return (data as PickValue[]) || [];
    },
  });

  // Fetch traded picks
  const { data: tradedPicks } = useQuery({
    queryKey: ['tradedPicks-finder'],
    queryFn: async () => {
      const { data } = await supabase.from('traded_picks').select('season, round, roster_id, owner_id');
      return (data as TradedPick[]) || [];
    },
  });

  // Get picks owned by a roster
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

  // Get players owned by a roster
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

  // Get all assets for the active selection team
  const availableAssets = useMemo(() => {
    const roster = tradeMode === 'dump' ? myRoster : targetRoster;
    if (!roster) return [];
    
    const playerAssets = getPlayersOwnedByRoster(roster);
    const pickAssets = getPicksOwnedByRoster(roster.roster_id);
    
    return [...playerAssets, ...pickAssets];
  }, [tradeMode, myRoster, targetRoster, getPlayersOwnedByRoster, getPicksOwnedByRoster]);

  // Selected assets with full details
  const selectedAssets = useMemo(() => {
    return availableAssets.filter(a => selectedAssetIds.includes(a.id));
  }, [availableAssets, selectedAssetIds]);

  // Total value of selected assets (both raw and adjusted)
  const selectedValueInfo = useMemo(() => {
    const sideValue = calculateSideValue(selectedAssets as ValueAdjustmentAsset[]);
    return {
      raw: sideValue.rawTotal,
      adjusted: sideValue.adjustedTotal,
      studBonus: sideValue.studBonus,
      consolidationBonus: sideValue.consolidationBonus,
      piecesPenalty: sideValue.piecesPenalty,
      breakdown: sideValue.adjustmentBreakdown,
    };
  }, [selectedAssets]);

  // Toggle asset selection
  const handleAssetToggle = (asset: TradeAsset) => {
    setSelectedAssetIds(prev => 
      prev.includes(asset.id) 
        ? prev.filter(id => id !== asset.id)
        : [...prev, asset.id]
    );
  };

  // Find trade scenarios
  const findTrades = useCallback(() => {
    if (!rosters || selectedAssets.length === 0) return;
    
    setIsSearching(true);
    setScenarios([]);

    setTimeout(() => {
      try {
        // Use adjusted value for tolerance calculation
        const adjustedValue = selectedValueInfo.adjusted;
        const minValue = adjustedValue * (1 - tolerance / 100);
        const maxValue = adjustedValue * (1 + tolerance / 100);
        const newScenarios: TradeScenario[] = [];

        // Teams to search for matching packages
        const teamsToSearch = tradeMode === 'dump'
          ? rosters.filter(r => r.roster_id !== myRoster?.roster_id)
          : myRoster ? [myRoster] : [];

        teamsToSearch.forEach(searchRoster => {
          const searchAssets = [
            ...getPlayersOwnedByRoster(searchRoster),
            ...getPicksOwnedByRoster(searchRoster.roster_id),
          ];

          // Generate combinations of 1-3 assets
          const combinations: TradeAsset[][] = [];
          
          // 1 asset
          searchAssets.forEach(a => combinations.push([a]));
          
          // 2 assets
          for (let i = 0; i < searchAssets.length; i++) {
            for (let j = i + 1; j < searchAssets.length; j++) {
              combinations.push([searchAssets[i], searchAssets[j]]);
            }
          }
          
          // 3 assets (limit to top 25 by value to avoid too many combos)
          const topAssets = searchAssets.slice(0, 25);
          for (let i = 0; i < topAssets.length; i++) {
            for (let j = i + 1; j < topAssets.length; j++) {
              for (let k = j + 1; k < topAssets.length; k++) {
                combinations.push([topAssets[i], topAssets[j], topAssets[k]]);
              }
            }
          }

          // Find matching combinations using adjusted values
          combinations.forEach(combo => {
            const comboValue = calculateSideValue(combo as ValueAdjustmentAsset[]);
            const comboAdjusted = comboValue.adjustedTotal;
            
            if (comboAdjusted >= minValue && comboAdjusted <= maxValue) {
              // Get full trade analysis
              const analysis = tradeMode === 'dump'
                ? analyzeTrade(selectedAssets as ValueAdjustmentAsset[], combo as ValueAdjustmentAsset[])
                : analyzeTrade(combo as ValueAdjustmentAsset[], selectedAssets as ValueAdjustmentAsset[]);
              
              const rawDiff = comboValue.rawTotal - selectedValueInfo.raw;
              const adjustedDiff = comboAdjusted - adjustedValue;
              const diffPercent = adjustedValue > 0 ? (adjustedDiff / adjustedValue) * 100 : 0;

              if (tradeMode === 'dump') {
                newScenarios.push({
                  give: selectedAssets,
                  get: combo,
                  giveTotal: selectedValueInfo.raw,
                  getTotal: comboValue.rawTotal,
                  giveAdjusted: adjustedValue,
                  getAdjusted: comboAdjusted,
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
                  giveAdjusted: comboAdjusted,
                  getAdjusted: adjustedValue,
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

        // Sort by absolute adjusted difference (closest matches first)
        newScenarios.sort((a, b) => Math.abs(a.adjustedDifference) - Math.abs(b.adjustedDifference));
        setScenarios(newScenarios.slice(0, 50));
      } finally {
        setIsSearching(false);
      }
    }, 100);
  }, [rosters, myRoster, targetRoster, selectedAssets, selectedValueInfo, tolerance, tradeMode, getPlayersOwnedByRoster, getPicksOwnedByRoster]);

  const isLoading = rostersLoading || valuesLoading || picksLoading;
  const canSearch = tradeMode === 'dump'
    ? myRoster && selectedAssetIds.length > 0
    : myRoster && targetRoster && selectedAssetIds.length > 0;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-accent-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950">
      <div className="max-w-4xl mx-auto px-4 py-6 sm:py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
            Trade Finder
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Find trade scenarios based on KTC values
          </p>
        </div>

        {/* Mode Toggle */}
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-4 sm:p-6 mb-6">
          <div className="mb-4">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              What do you want to do?
            </span>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setTradeMode('dump')}
              className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                tradeMode === 'dump'
                  ? 'border-accent-500 bg-accent-50 dark:bg-accent-900/20'
                  : 'border-slate-200 dark:border-zinc-700 hover:border-slate-300 dark:hover:border-zinc-600'
              }`}
            >
              <TrendingDown className={`h-6 w-6 ${tradeMode === 'dump' ? 'text-accent-500' : 'text-slate-400'}`} />
              <span className={`text-sm font-medium text-center ${tradeMode === 'dump' ? 'text-accent-600 dark:text-accent-400' : 'text-slate-600 dark:text-slate-300'}`}>
                I have assets to trade away
              </span>
            </button>
            
            <button
              onClick={() => setTradeMode('acquire')}
              className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                tradeMode === 'acquire'
                  ? 'border-accent-500 bg-accent-50 dark:bg-accent-900/20'
                  : 'border-slate-200 dark:border-zinc-700 hover:border-slate-300 dark:hover:border-zinc-600'
              }`}
            >
              <TrendingUp className={`h-6 w-6 ${tradeMode === 'acquire' ? 'text-accent-500' : 'text-slate-400'}`} />
              <span className={`text-sm font-medium text-center ${tradeMode === 'acquire' ? 'text-accent-600 dark:text-accent-400' : 'text-slate-600 dark:text-slate-300'}`}>
                I want a specific player
              </span>
            </button>
          </div>
        </div>

        {/* Configuration */}
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-4 sm:p-6 mb-6">
          {tradeMode === 'dump' ? (
            <>
              <div className="mb-4">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Step 1: Select your team
                </span>
              </div>
              
              <button
                onClick={() => setDropdownOpen('myTeam')}
                className="w-full p-4 rounded-xl border border-slate-200 dark:border-zinc-700 hover:border-slate-300 dark:hover:border-zinc-600 transition-colors flex items-center justify-between mb-6"
              >
                <div className="flex items-center gap-3">
                  <Users className="h-5 w-5 text-slate-400" />
                  <span className={`text-sm font-medium ${myRoster ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`}>
                    {myRoster ? (myRoster.teamName || myRoster.ownerName) : 'Select your team'}
                  </span>
                </div>
                <ChevronDown className="h-5 w-5 text-slate-400" />
              </button>

              {myRoster && (
                <>
                  <div className="mb-4">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Step 2: Select assets to trade away
                    </span>
                  </div>
                  
                  <button
                    onClick={() => setDropdownOpen('assets')}
                    className="w-full p-4 rounded-xl border border-slate-200 dark:border-zinc-700 hover:border-slate-300 dark:hover:border-zinc-600 transition-colors flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3 flex-wrap">
                      <Search className="h-5 w-5 text-slate-400" />
                      {selectedAssets.length === 0 ? (
                        <span className="text-sm text-slate-400">Select players or picks...</span>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {selectedAssets.map(asset => (
                            <span
                              key={asset.id}
                              className={`px-2 py-1 text-xs font-medium rounded-lg ${getPositionBadgeClass(asset.type === 'player' ? (asset.position || '') : 'PICK')}`}
                            >
                              {asset.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <ChevronDown className="h-5 w-5 text-slate-400 shrink-0" />
                  </button>

                  {selectedAssets.length > 0 && (
                    <div className="mt-4 p-3 bg-accent-50 dark:bg-accent-900/20 rounded-lg">
                      <div className="text-sm text-accent-700 dark:text-accent-300">
                        Adjusted value: <strong>{selectedValueInfo.adjusted.toLocaleString()}</strong> KTC
                        {selectedValueInfo.raw !== selectedValueInfo.adjusted && (
                          <span className="text-xs text-slate-500 dark:text-slate-400 block mt-1">
                            Raw: {selectedValueInfo.raw.toLocaleString()} • {selectedValueInfo.breakdown}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            <>
              <div className="mb-4">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Step 1: Select the team you want to trade with
                </span>
              </div>
              
              <button
                onClick={() => setDropdownOpen('targetTeam')}
                className="w-full p-4 rounded-xl border border-slate-200 dark:border-zinc-700 hover:border-slate-300 dark:hover:border-zinc-600 transition-colors flex items-center justify-between mb-6"
              >
                <div className="flex items-center gap-3">
                  <Users className="h-5 w-5 text-slate-400" />
                  <span className={`text-sm font-medium ${targetRoster ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`}>
                    {targetRoster ? (targetRoster.teamName || targetRoster.ownerName) : 'Select team to trade with'}
                  </span>
                </div>
                <ChevronDown className="h-5 w-5 text-slate-400" />
              </button>

              {targetRoster && (
                <>
                  <div className="mb-4">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Step 2: Select player/picks you want from them
                    </span>
                  </div>
                  
                  <button
                    onClick={() => setDropdownOpen('assets')}
                    className="w-full p-4 rounded-xl border border-slate-200 dark:border-zinc-700 hover:border-slate-300 dark:hover:border-zinc-600 transition-colors flex items-center justify-between mb-6"
                  >
                    <div className="flex items-center gap-3 flex-wrap">
                      <Search className="h-5 w-5 text-slate-400" />
                      {selectedAssets.length === 0 ? (
                        <span className="text-sm text-slate-400">Select players or picks you want...</span>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {selectedAssets.map(asset => (
                            <span
                              key={asset.id}
                              className={`px-2 py-1 text-xs font-medium rounded-lg ${getPositionBadgeClass(asset.type === 'player' ? (asset.position || '') : 'PICK')}`}
                            >
                              {asset.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <ChevronDown className="h-5 w-5 text-slate-400 shrink-0" />
                  </button>

                  {selectedAssets.length > 0 && (
                    <div className="p-3 bg-accent-50 dark:bg-accent-900/20 rounded-lg mb-6">
                      <div className="text-sm text-accent-700 dark:text-accent-300">
                        Target value: <strong>{selectedValueInfo.adjusted.toLocaleString()}</strong> KTC
                        {selectedValueInfo.raw !== selectedValueInfo.adjusted && (
                          <span className="text-xs text-slate-500 dark:text-slate-400 block mt-1">
                            Raw: {selectedValueInfo.raw.toLocaleString()} • {selectedValueInfo.breakdown}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="mb-4">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Step 3: Select your team
                    </span>
                  </div>
                  
                  <button
                    onClick={() => setDropdownOpen('myTeam')}
                    className="w-full p-4 rounded-xl border border-slate-200 dark:border-zinc-700 hover:border-slate-300 dark:hover:border-zinc-600 transition-colors flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <Users className="h-5 w-5 text-slate-400" />
                      <span className={`text-sm font-medium ${myRoster ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`}>
                        {myRoster ? (myRoster.teamName || myRoster.ownerName) : 'Select your team'}
                      </span>
                    </div>
                    <ChevronDown className="h-5 w-5 text-slate-400" />
                  </button>
                </>
              )}
            </>
          )}
        </div>

        {/* Tolerance Slider */}
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-4 sm:p-6 mb-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Value Tolerance
            </span>
            <span className="text-sm font-bold text-accent-600 dark:text-accent-400">
              ±{tolerance}%
            </span>
          </div>
          
          <input
            type="range"
            min={5}
            max={25}
            step={5}
            value={tolerance}
            onChange={(e) => setTolerance(Number(e.target.value))}
            className="w-full h-2 bg-slate-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-accent-500"
          />
          
          <div className="flex justify-between text-xs text-slate-400 mt-2">
            <span>5%</span>
            <span>15%</span>
            <span>25%</span>
          </div>
        </div>

        {/* Search Button */}
        <button
          onClick={findTrades}
          disabled={!canSearch || isSearching}
          className={`w-full py-4 rounded-xl font-semibold text-white transition-colors flex items-center justify-center gap-2 ${
            canSearch && !isSearching
              ? 'bg-accent-500 hover:bg-accent-600'
              : 'bg-slate-300 dark:bg-zinc-700 cursor-not-allowed'
          }`}
        >
          {isSearching ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Searching...
            </>
          ) : (
            <>
              <Search className="h-5 w-5" />
              Find Trade Scenarios
            </>
          )}
        </button>

        {/* Results */}
        {scenarios.length > 0 && (
          <div className="mt-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Trade Scenarios
              </h2>
              <span className="text-sm text-slate-500 dark:text-slate-400">
                {scenarios.length} found
              </span>
            </div>

            <div className="space-y-4">
              {scenarios.map((scenario, idx) => (
                <div
                  key={idx}
                  className={`bg-white dark:bg-zinc-900 border-2 rounded-xl p-4 sm:p-6 ${
                    scenario.fairness === 'fair'
                      ? 'border-emerald-300 dark:border-emerald-500/50'
                      : scenario.fairness === 'slight'
                      ? 'border-blue-300 dark:border-blue-500/50'
                      : 'border-slate-200 dark:border-zinc-800'
                  }`}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-500 dark:text-slate-400">
                        Trade with <strong className="text-slate-700 dark:text-slate-200">{scenario.partnerRoster.teamName || scenario.partnerRoster.ownerName}</strong>
                      </span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded uppercase ${
                        scenario.fairness === 'fair'
                          ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                          : scenario.fairness === 'slight'
                          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                          : scenario.fairness === 'unfair'
                          ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                          : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                      }`}>
                        {scenario.fairness}
                      </span>
                    </div>
                    <span className={`text-xs font-semibold px-2 py-1 rounded-lg ${
                      Math.abs(scenario.differencePercent) < 5
                        ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                        : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-300'
                    }`}>
                      {scenario.adjustedDifference >= 0 ? '+' : ''}{scenario.adjustedDifference.toLocaleString()} adj
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-[1fr,auto,1fr] gap-4 items-start">
                    {/* Give Side */}
                    <div>
                      <div className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-wider mb-2">
                        You Give
                        <span className="font-normal text-slate-500 dark:text-slate-400 ml-1">
                          ({scenario.giveAdjusted.toLocaleString()} adj)
                        </span>
                      </div>
                      <div className="space-y-2">
                        {scenario.give.map((asset, i) => (
                          <div key={i} className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${getPositionBadgeClass(asset.type === 'player' ? (asset.position || '') : 'PICK')}`}>
                                {asset.type === 'player' ? asset.position : 'PICK'}
                              </span>
                              <span className="text-sm text-slate-700 dark:text-slate-200">{asset.name}</span>
                            </div>
                            <span className="text-xs text-slate-500">{asset.value.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Arrow */}
                    <div className="hidden sm:flex items-center justify-center h-full">
                      <ArrowLeftRight className="h-6 w-6 text-slate-300 dark:text-zinc-600" />
                    </div>
                    <div className="sm:hidden flex justify-center">
                      <ArrowLeftRight className="h-5 w-5 text-slate-300 dark:text-zinc-600 rotate-90" />
                    </div>

                    {/* Get Side */}
                    <div>
                      <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-2">
                        You Get
                        <span className="font-normal text-slate-500 dark:text-slate-400 ml-1">
                          ({scenario.getAdjusted.toLocaleString()} adj)
                        </span>
                      </div>
                      <div className="space-y-2">
                        {scenario.get.map((asset, i) => (
                          <div key={i} className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${getPositionBadgeClass(asset.type === 'player' ? (asset.position || '') : 'PICK')}`}>
                                {asset.type === 'player' ? asset.position : 'PICK'}
                              </span>
                              <span className="text-sm text-slate-700 dark:text-slate-200">{asset.name}</span>
                            </div>
                            <span className="text-xs text-slate-500">{asset.value.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  
                  {/* Value Adjustment Info */}
                  {scenario.difference !== scenario.adjustedDifference && (
                    <div className="mt-3 pt-3 border-t border-slate-100 dark:border-zinc-800 flex items-start gap-1.5">
                      <Info className="h-3 w-3 text-slate-400 mt-0.5 shrink-0" />
                      <span className="text-[10px] text-slate-500 dark:text-slate-400">
                        Raw difference: {scenario.difference >= 0 ? '+' : ''}{scenario.difference.toLocaleString()} → 
                        Adjusted: {scenario.adjustedDifference >= 0 ? '+' : ''}{scenario.adjustedDifference.toLocaleString()} 
                        (stud factor, consolidation, piece count)
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {scenarios.length === 0 && selectedAssets.length > 0 && !isSearching && (
          <div className="mt-8 p-6 bg-slate-100 dark:bg-zinc-800/50 rounded-xl text-center">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Click "Find Trade Scenarios" to discover matching trades based on your selected assets.
            </p>
          </div>
        )}
      </div>

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
