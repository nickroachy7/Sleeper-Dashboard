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
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
  Trophy,
  RotateCcw,
} from 'lucide-react';

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

const POSITION_COLORS: Record<string, string> = {
  QB: 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/30',
  RB: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30',
  WR: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/30',
  TE: 'bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-500/30',
  PICK: 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-500/30',
};

const POSITION_BADGE_COLORS: Record<string, string> = {
  QB: 'bg-red-500 text-white',
  RB: 'bg-emerald-500 text-white',
  WR: 'bg-blue-500 text-white',
  TE: 'bg-orange-500 text-white',
  PICK: 'bg-purple-500 text-white',
};

// Helper to determine pick tier based on roster standings
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

// Click outside hook
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

// Asset Dropdown Component
function AssetDropdown({
  isOpen,
  onClose,
  title,
  searchable = false,
  searchPlaceholder = 'Search...',
  items,
  onSelect,
  emptyMessage = 'No items available',
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  items: TradeAsset[];
  onSelect: (item: TradeAsset) => void;
  emptyMessage?: string;
}) {
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useClickOutside(dropdownRef, onClose);

  useEffect(() => {
    if (isOpen && searchable && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
    if (!isOpen) {
      setSearch('');
    }
  }, [isOpen, searchable]);

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
    <div
      ref={dropdownRef}
      className="absolute z-50 left-0 right-0 mt-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl shadow-2xl dark:shadow-none overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200"
    >
      {/* Header */}
      <div className="px-3 py-2.5 bg-slate-50 dark:bg-zinc-800/80 border-b border-slate-200 dark:border-zinc-700 flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">{title}</span>
        <button
          onClick={onClose}
          className="p-1 hover:bg-slate-200 dark:hover:bg-zinc-700 rounded-lg transition-colors"
        >
          <X className="h-3.5 w-3.5 text-slate-400" />
        </button>
      </div>

      {/* Search */}
      {searchable && (
        <div className="p-2 border-b border-slate-100 dark:border-zinc-800">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
            <input
              ref={inputRef}
              type="text"
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent transition-all"
            />
          </div>
        </div>
      )}

      {/* Items */}
      <div className="max-h-72 overflow-y-auto overscroll-contain">
        {filteredItems.length === 0 ? (
          <div className="p-6 text-sm text-slate-500 dark:text-slate-400 text-center">
            {emptyMessage}
          </div>
        ) : (
          <div className="p-1.5">
            {filteredItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  onSelect(item);
                  onClose();
                }}
                className="w-full flex items-center justify-between p-2.5 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-all duration-150 text-left group"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${
                      POSITION_BADGE_COLORS[item.position || 'PICK'] || POSITION_BADGE_COLORS.PICK
                    }`}
                  >
                    {item.type === 'player' ? item.position : 'PICK'}
                  </span>
                  <span className="text-sm font-medium text-slate-900 dark:text-white truncate group-hover:text-accent-600 dark:group-hover:text-accent-400 transition-colors">
                    {item.name}
                  </span>
                  {item.team && (
                    <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0">{item.team}</span>
                  )}
                </div>
                <span className="text-sm font-bold text-slate-600 dark:text-slate-300 tabular-nums shrink-0 ml-2">
                  {item.value.toLocaleString()}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function TradeEvaluator() {
  const [tradeSides, setTradeSides] = useState<TradeSide[]>([
    { rosterId: 0, assets: [] },
    { rosterId: 0, assets: [] },
  ]);
  const [activeDropdown, setActiveDropdown] = useState<{ side: number; type: 'player' | 'pick' } | null>(null);

  // Fetch rosters with owner names
  const { data: rosters, isLoading: rostersLoading } = useQuery({
    queryKey: ['rosters-trade'],
    queryFn: async () => {
      const { data: rostersData } = await supabase.from('rosters').select('*');
      const { data: users } = await supabase.from('users').select('*');

      if (!rostersData?.length) return [];

      return (rostersData as any[]).map((roster: any) => {
        const owner = (users as any[])?.find((u: any) => u.user_id === roster.owner_id);
        return {
          ...roster,
          ownerName: owner?.display_name || owner?.username || 'Unknown',
        };
      }) as Roster[];
    },
  });

  // Fetch players
  const { data: players } = useQuery({
    queryKey: ['players-trade'],
    queryFn: async () => {
      const { data } = await supabase.from('players').select('player_id, full_name, position, team');
      return (data as Player[]) || [];
    },
  });

  // Fetch player values
  const { data: playerValues, isLoading: valuesLoading } = useQuery({
    queryKey: ['playerValues-trade'],
    queryFn: async () => {
      const { data } = await supabase
        .from('player_values')
        .select('player_id, value, player:players(full_name, position, team)');
      const valueMap = new Map<string, PlayerValue>();
      (data || []).forEach((pv: any) => {
        const player = Array.isArray(pv.player) ? pv.player[0] : pv.player;
        if (player) {
          valueMap.set(pv.player_id, { ...pv, player });
        }
      });
      return valueMap;
    },
  });

  // Fetch pick values
  const { data: pickValues, isLoading: picksLoading } = useQuery({
    queryKey: ['pickValues-trade'],
    queryFn: async () => {
      const { data } = await supabase.from('pick_values').select('pick_year, pick_round, pick_tier, value');
      return (data as PickValue[]) || [];
    },
  });

  // Fetch traded picks
  const { data: tradedPicks } = useQuery({
    queryKey: ['tradedPicks-trade'],
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
              const displayName =
                originalRoster.roster_id !== rosterId
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

  // Get players owned by a roster with their values
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

    return playerAssets.sort((a, b) => {
      if (b.value !== a.value) return b.value - a.value;
      return a.name.localeCompare(b.name);
    });
  }, [rosters, playerValues, players]);

  // Get available assets for dropdown
  const getAvailableAssets = useCallback((sideIndex: number, type: 'player' | 'pick') => {
    const rosterId = tradeSides[sideIndex].rosterId;
    const assets = type === 'player' ? getPlayersOwnedByRoster(rosterId) : getPicksOwnedByRoster(rosterId);
    const addedIds = new Set(
      tradeSides[sideIndex].assets.filter((a) => a.type === type).map((a) => a.id)
    );
    return assets.filter((a) => !addedIds.has(a.id));
  }, [tradeSides, getPlayersOwnedByRoster, getPicksOwnedByRoster]);

  // Add asset to trade side
  const addAsset = useCallback((sideIndex: number, asset: TradeAsset) => {
    setTradeSides((prev) => {
      const updated = [...prev];
      updated[sideIndex] = {
        ...updated[sideIndex],
        assets: [...updated[sideIndex].assets, asset],
      };
      return updated;
    });
  }, []);

  // Remove asset from trade side
  const removeAsset = useCallback((sideIndex: number, assetId: string) => {
    setTradeSides((prev) => {
      const updated = [...prev];
      updated[sideIndex] = {
        ...updated[sideIndex],
        assets: updated[sideIndex].assets.filter((a) => a.id !== assetId),
      };
      return updated;
    });
  }, []);

  // Set roster for a trade side
  const setRoster = useCallback((sideIndex: number, rosterId: number) => {
    setTradeSides((prev) => {
      const updated = [...prev];
      updated[sideIndex] = { rosterId, assets: [] };
      return updated;
    });
  }, []);

  // Add another team to the trade
  const addTradeSide = useCallback(() => {
    if (tradeSides.length < 4) {
      setTradeSides((prev) => [...prev, { rosterId: 0, assets: [] }]);
    }
  }, [tradeSides.length]);

  // Remove a team from the trade
  const removeTradeSide = useCallback((index: number) => {
    if (tradeSides.length > 2) {
      setTradeSides((prev) => prev.filter((_, i) => i !== index));
    }
  }, [tradeSides.length]);

  // Reset trade
  const resetTrade = useCallback(() => {
    setTradeSides([
      { rosterId: 0, assets: [] },
      { rosterId: 0, assets: [] },
    ]);
    setActiveDropdown(null);
  }, []);

  // Calculate totals
  const totals = useMemo(() => {
    return tradeSides.map((side) => ({
      rosterId: side.rosterId,
      total: side.assets.reduce((sum, asset) => sum + asset.value, 0),
    }));
  }, [tradeSides]);

  // Determine winner
  const tradeAnalysis = useMemo(() => {
    if (tradeSides.some((s) => s.rosterId === 0) || tradeSides.some((s) => s.assets.length === 0)) {
      return null;
    }

    const sortedTotals = [...totals].sort((a, b) => a.total - b.total);
    const winner = sortedTotals[0];
    const loser = sortedTotals[sortedTotals.length - 1];
    const difference = loser.total - winner.total;
    const percentDiff = winner.total > 0 ? ((difference / winner.total) * 100).toFixed(1) : 0;

    let fairness: 'fair' | 'slight' | 'unfair' | 'lopsided';
    if (difference < 500) fairness = 'fair';
    else if (difference < 1500) fairness = 'slight';
    else if (difference < 3000) fairness = 'unfair';
    else fairness = 'lopsided';

    return {
      winner: winner.rosterId,
      loser: loser.rosterId,
      difference,
      percentDiff,
      fairness,
    };
  }, [totals, tradeSides]);

  // Get available rosters
  const getAvailableRosters = useCallback((currentSideIndex: number) => {
    const selectedRosterIds = tradeSides
      .filter((_, i) => i !== currentSideIndex)
      .map((s) => s.rosterId)
      .filter((id) => id > 0);

    return (rosters || []).filter((r) => !selectedRosterIds.includes(r.roster_id));
  }, [tradeSides, rosters]);

  const isLoading = rostersLoading || valuesLoading || picksLoading;
  const hasAssets = tradeSides.some((s) => s.assets.length > 0);

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <Loader2 className="h-8 w-8 sm:h-10 sm:w-10 animate-spin text-accent-500 mx-auto" />
            <p className="mt-4 text-slate-500 dark:text-slate-400 text-sm">Loading trade evaluator...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">Trade Evaluator</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Build and analyze trades using KTC dynasty values
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasAssets && (
            <button
              onClick={resetTrade}
              className="flex items-center gap-2 px-3 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors text-sm font-medium"
            >
              <RotateCcw className="h-4 w-4" />
              Reset
            </button>
          )}
          {tradeSides.length < 4 && (
            <button
              onClick={addTradeSide}
              className="flex items-center gap-2 px-4 py-2 bg-accent-500 hover:bg-accent-600 text-white rounded-lg transition-colors text-sm font-medium shadow-sm"
            >
              <Plus className="h-4 w-4" />
              Add Team
            </button>
          )}
        </div>
      </div>

      {/* Trade Analysis Summary */}
      {tradeAnalysis && (
        <div
          className={`mb-6 p-4 sm:p-5 rounded-xl border-2 transition-all duration-300 ${
            tradeAnalysis.fairness === 'fair'
              ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-500/40'
              : tradeAnalysis.fairness === 'slight'
              ? 'bg-blue-50 dark:bg-blue-500/10 border-blue-300 dark:border-blue-500/40'
              : tradeAnalysis.fairness === 'unfair'
              ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-300 dark:border-amber-500/40'
              : 'bg-red-50 dark:bg-red-500/10 border-red-300 dark:border-red-500/40'
          }`}
        >
          <div className="flex items-center gap-4">
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                tradeAnalysis.fairness === 'fair'
                  ? 'bg-emerald-100 dark:bg-emerald-500/20'
                  : tradeAnalysis.fairness === 'slight'
                  ? 'bg-blue-100 dark:bg-blue-500/20'
                  : tradeAnalysis.fairness === 'unfair'
                  ? 'bg-amber-100 dark:bg-amber-500/20'
                  : 'bg-red-100 dark:bg-red-500/20'
              }`}
            >
              <Scale
                className={`h-6 w-6 ${
                  tradeAnalysis.fairness === 'fair'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : tradeAnalysis.fairness === 'slight'
                    ? 'text-blue-600 dark:text-blue-400'
                    : tradeAnalysis.fairness === 'unfair'
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-red-600 dark:text-red-400'
                }`}
              />
            </div>
            <div>
              <p className="text-lg font-bold text-slate-900 dark:text-white">
                {tradeAnalysis.fairness === 'fair'
                  ? 'Fair Trade'
                  : tradeAnalysis.fairness === 'slight'
                  ? 'Slightly Uneven'
                  : tradeAnalysis.fairness === 'unfair'
                  ? 'Unfair Trade'
                  : 'Lopsided Trade'}
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                <span className="font-semibold">{rosters?.find((r) => r.roster_id === tradeAnalysis.winner)?.ownerName}</span> wins by{' '}
                <span className="font-bold">{tradeAnalysis.difference.toLocaleString()}</span> points ({tradeAnalysis.percentDiff}% advantage)
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Trade Sides Grid */}
      <div className="relative">
        <div className={`grid gap-4 sm:gap-6 ${
          tradeSides.length === 2 
            ? 'grid-cols-1 lg:grid-cols-2' 
            : tradeSides.length === 3 
            ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' 
            : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4'
        }`}>
          {tradeSides.map((side, sideIndex) => {
            const roster = rosters?.find((r) => r.roster_id === side.rosterId);
            const sideTotal = totals[sideIndex]?.total || 0;
            const isWinner = tradeAnalysis?.winner === side.rosterId;
            const isLoser = tradeAnalysis?.loser === side.rosterId;

            return (
              <div
                key={sideIndex}
                className={`bg-white dark:bg-zinc-900 rounded-xl border-2 shadow-sm transition-all duration-300 ${
                  isWinner
                    ? 'border-emerald-400 dark:border-emerald-500/60 shadow-emerald-100 dark:shadow-none'
                    : isLoser
                    ? 'border-red-400 dark:border-red-500/60 shadow-red-100 dark:shadow-none'
                    : 'border-slate-200 dark:border-zinc-700'
                }`}
              >
                {/* Team Header */}
                <div className="p-4 bg-slate-50 dark:bg-zinc-800/50 border-b border-slate-200 dark:border-zinc-700 rounded-t-xl">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      {isWinner && (
                        <span className="px-2 py-0.5 bg-emerald-500 text-white text-[10px] font-bold rounded-full uppercase">
                          Winner
                        </span>
                      )}
                      {isLoser && (
                        <span className="px-2 py-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full uppercase">
                          Loser
                        </span>
                      )}
                    </div>
                    {tradeSides.length > 2 && (
                      <button
                        onClick={() => removeTradeSide(sideIndex)}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  {/* Team Selector */}
                  <div className="relative">
                    <select
                      value={side.rosterId}
                      onChange={(e) => setRoster(sideIndex, parseInt(e.target.value))}
                      className="w-full px-3 py-2.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg text-sm font-semibold text-slate-900 dark:text-white appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent transition-all"
                    >
                      <option value={0}>Select Team...</option>
                      {getAvailableRosters(sideIndex).map((r) => (
                        <option key={r.roster_id} value={r.roster_id}>
                          {r.ownerName}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                  </div>

                  {/* Team Stats */}
                  {roster && (
                    <div className="mt-3 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                      <span className="flex items-center gap-1">
                        <Trophy className="h-3.5 w-3.5" />
                        {roster.wins}-{roster.losses}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {roster.players?.length || 0} players
                      </span>
                      <span className="px-1.5 py-0.5 bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400 rounded font-medium">
                        {getProjectedPickTier(roster.roster_id, rosters!)} picks
                      </span>
                    </div>
                  )}
                </div>

                {/* Assets */}
                <div className="p-4 min-h-[240px]">
                  {side.rosterId === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 text-slate-400 dark:text-slate-500">
                      <Users className="h-10 w-10 mb-3 opacity-50" />
                      <p className="text-sm font-medium">Select a team to get started</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {/* Added Assets */}
                      {side.assets.length > 0 && (
                        <div className="space-y-2 mb-4">
                          {side.assets.map((asset) => (
                            <div
                              key={asset.id}
                              className={`flex items-center justify-between p-3 rounded-lg border transition-all duration-200 hover:shadow-md ${
                                POSITION_COLORS[asset.position || 'PICK'] || POSITION_COLORS.PICK
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span
                                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                                    POSITION_BADGE_COLORS[asset.position || 'PICK'] || POSITION_BADGE_COLORS.PICK
                                  }`}
                                >
                                  {asset.type === 'player' ? asset.position : 'PICK'}
                                </span>
                                <span className="text-sm font-semibold truncate">{asset.name}</span>
                                {asset.team && (
                                  <span className="text-xs opacity-60 shrink-0">{asset.team}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-sm font-bold tabular-nums">{asset.value.toLocaleString()}</span>
                                <button
                                  onClick={() => removeAsset(sideIndex, asset.id)}
                                  className="p-1 hover:bg-black/10 dark:hover:bg-white/10 rounded-md transition-colors"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Add Buttons */}
                      <div className="space-y-2">
                        {/* Add Player */}
                        <div className="relative">
                          <button
                            onClick={() =>
                              setActiveDropdown(
                                activeDropdown?.side === sideIndex && activeDropdown?.type === 'player'
                                  ? null
                                  : { side: sideIndex, type: 'player' }
                              )
                            }
                            className="w-full flex items-center justify-center gap-2 p-3 border-2 border-dashed border-slate-300 dark:border-zinc-600 rounded-lg text-slate-500 dark:text-slate-400 hover:border-accent-400 hover:text-accent-600 dark:hover:border-accent-500 dark:hover:text-accent-400 hover:bg-accent-50 dark:hover:bg-accent-500/5 transition-all duration-200"
                          >
                            <Plus className="h-4 w-4" />
                            <span className="text-sm font-medium">Add Player</span>
                          </button>

                          <AssetDropdown
                            isOpen={activeDropdown?.side === sideIndex && activeDropdown?.type === 'player'}
                            onClose={() => setActiveDropdown(null)}
                            title="Select Player"
                            searchable
                            searchPlaceholder="Search by name, position, or team..."
                            items={getAvailableAssets(sideIndex, 'player')}
                            onSelect={(asset) => addAsset(sideIndex, asset)}
                            emptyMessage="No players available"
                          />
                        </div>

                        {/* Add Pick */}
                        <div className="relative">
                          <button
                            onClick={() =>
                              setActiveDropdown(
                                activeDropdown?.side === sideIndex && activeDropdown?.type === 'pick'
                                  ? null
                                  : { side: sideIndex, type: 'pick' }
                              )
                            }
                            className="w-full flex items-center justify-center gap-2 p-3 border-2 border-dashed border-slate-300 dark:border-zinc-600 rounded-lg text-slate-500 dark:text-slate-400 hover:border-purple-400 hover:text-purple-600 dark:hover:border-purple-500 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/5 transition-all duration-200"
                          >
                            <Plus className="h-4 w-4" />
                            <span className="text-sm font-medium">Add Draft Pick</span>
                          </button>

                          <AssetDropdown
                            isOpen={activeDropdown?.side === sideIndex && activeDropdown?.type === 'pick'}
                            onClose={() => setActiveDropdown(null)}
                            title="Select Pick"
                            items={getAvailableAssets(sideIndex, 'pick')}
                            onSelect={(asset) => addAsset(sideIndex, asset)}
                            emptyMessage="No picks available"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Total */}
                <div
                  className={`p-4 border-t rounded-b-xl transition-all duration-300 ${
                    isWinner
                      ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30'
                      : isLoser
                      ? 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30'
                      : 'bg-slate-50 dark:bg-zinc-800/50 border-slate-200 dark:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Total Value</span>
                    <div className="flex items-center gap-2">
                      {isWinner && <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />}
                      {isLoser && <TrendingDown className="h-5 w-5 text-red-600 dark:text-red-400" />}
                      {!isWinner && !isLoser && tradeAnalysis && (
                        <Minus className="h-5 w-5 text-slate-400 dark:text-slate-500" />
                      )}
                      <span
                        className={`text-xl font-bold tabular-nums ${
                          isWinner
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : isLoser
                            ? 'text-red-700 dark:text-red-400'
                            : 'text-slate-900 dark:text-white'
                        }`}
                      >
                        {sideTotal.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Swap Icon - only show for 2-team trades on larger screens */}
        {tradeSides.length === 2 && (
          <div className="hidden lg:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
            <div className="w-14 h-14 bg-white dark:bg-zinc-900 border-2 border-slate-200 dark:border-zinc-700 rounded-full flex items-center justify-center shadow-lg">
              <ArrowLeftRight className="w-6 h-6 text-slate-400 dark:text-slate-500" />
            </div>
          </div>
        )}
      </div>

      {/* Instructions */}
      {!hasAssets && tradeSides.every((s) => s.rosterId === 0) && (
        <div className="mt-8 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-zinc-900 dark:to-zinc-800 rounded-xl p-6 border border-slate-200 dark:border-zinc-700">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-accent-100 dark:bg-accent-500/20 rounded-xl flex items-center justify-center shrink-0">
              <ArrowLeftRight className="h-6 w-6 text-accent-600 dark:text-accent-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">How to use the Trade Evaluator</h3>
              <ol className="text-sm text-slate-600 dark:text-slate-400 space-y-1.5">
                <li className="flex items-center gap-2">
                  <span className="w-5 h-5 bg-slate-200 dark:bg-zinc-700 rounded-full flex items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-300">1</span>
                  Select teams for each side of the trade
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-5 h-5 bg-slate-200 dark:bg-zinc-700 rounded-full flex items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-300">2</span>
                  Add players and draft picks to each side
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-5 h-5 bg-slate-200 dark:bg-zinc-700 rounded-full flex items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-300">3</span>
                  Pick values are calculated based on team standings
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-5 h-5 bg-slate-200 dark:bg-zinc-700 rounded-full flex items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-300">4</span>
                  See who wins the trade based on total KTC value
                </li>
              </ol>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TradeEvaluator;
