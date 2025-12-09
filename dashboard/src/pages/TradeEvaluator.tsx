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
  Users,
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
  QB: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
  RB: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  WR: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  TE: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20',
  PICK: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
};

const POSITION_BADGE_COLORS: Record<string, string> = {
  QB: 'bg-red-500 text-white',
  RB: 'bg-emerald-500 text-white',
  WR: 'bg-blue-500 text-white',
  TE: 'bg-orange-500 text-white',
  PICK: 'bg-purple-500 text-white',
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

// Compact Asset Dropdown
function AssetDropdown({
  isOpen,
  onClose,
  title,
  searchable = false,
  items,
  onSelect,
  emptyMessage = 'No items available',
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  searchable?: boolean;
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
    if (!isOpen) setSearch('');
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
      className="absolute z-50 left-0 right-0 mt-1 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg shadow-xl overflow-hidden"
    >
      <div className="px-2 py-1.5 bg-slate-50 dark:bg-zinc-800 border-b border-slate-200 dark:border-zinc-700 flex items-center justify-between">
        <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase">{title}</span>
        <button onClick={onClose} className="p-0.5 hover:bg-slate-200 dark:hover:bg-zinc-700 rounded">
          <X className="h-3 w-3 text-slate-400" />
        </button>
      </div>

      {searchable && (
        <div className="p-1.5 border-b border-slate-100 dark:border-zinc-800">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-6 pr-2 py-1 text-xs bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-accent-500"
            />
          </div>
        </div>
      )}

      <div className="max-h-48 overflow-y-auto">
        {filteredItems.length === 0 ? (
          <div className="p-3 text-xs text-slate-500 text-center">{emptyMessage}</div>
        ) : (
          <div className="p-1">
            {filteredItems.map((item) => (
              <button
                key={item.id}
                onClick={() => { onSelect(item); onClose(); }}
                className="w-full flex items-center justify-between p-1.5 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded text-left"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className={`px-1 py-0.5 rounded text-[9px] font-bold ${POSITION_BADGE_COLORS[item.position || 'PICK']}`}>
                    {item.type === 'player' ? item.position : 'PICK'}
                  </span>
                  <span className="text-xs font-medium text-slate-900 dark:text-white truncate">{item.name}</span>
                  {item.team && <span className="text-[10px] text-slate-400">{item.team}</span>}
                </div>
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300 tabular-nums ml-1">
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

  const { data: rosters, isLoading: rostersLoading } = useQuery({
    queryKey: ['rosters-trade'],
    queryFn: async () => {
      const { data: rostersData } = await supabase.from('rosters').select('*');
      const { data: users } = await supabase.from('users').select('*');
      if (!rostersData?.length) return [];
      return (rostersData as any[]).map((roster: any) => {
        const owner = (users as any[])?.find((u: any) => u.user_id === roster.owner_id);
        return { ...roster, ownerName: owner?.display_name || owner?.username || 'Unknown' };
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
    queryKey: ['tradedPicks-trade'],
    queryFn: async () => {
      const { data } = await supabase.from('traded_picks').select('season, round, roster_id, owner_id');
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

  const setRoster = useCallback((sideIndex: number, rosterId: number) => {
    setTradeSides((prev) => {
      const updated = [...prev];
      updated[sideIndex] = { rosterId, assets: [] };
      return updated;
    });
  }, []);

  const addTradeSide = useCallback(() => {
    if (tradeSides.length < 4) setTradeSides((prev) => [...prev, { rosterId: 0, assets: [] }]);
  }, [tradeSides.length]);

  const removeTradeSide = useCallback((index: number) => {
    if (tradeSides.length > 2) setTradeSides((prev) => prev.filter((_, i) => i !== index));
  }, [tradeSides.length]);

  const resetTrade = useCallback(() => {
    setTradeSides([{ rosterId: 0, assets: [] }, { rosterId: 0, assets: [] }]);
    setActiveDropdown(null);
  }, []);

  const totals = useMemo(() => {
    return tradeSides.map((side) => ({
      rosterId: side.rosterId,
      total: side.assets.reduce((sum, asset) => sum + asset.value, 0),
    }));
  }, [tradeSides]);

  const tradeAnalysis = useMemo(() => {
    if (tradeSides.some((s) => s.rosterId === 0) || tradeSides.some((s) => s.assets.length === 0)) return null;
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

    return { winner: winner.rosterId, loser: loser.rosterId, difference, percentDiff, fairness };
  }, [totals, tradeSides]);

  const getAvailableRosters = useCallback((currentSideIndex: number) => {
    const selectedRosterIds = tradeSides.filter((_, i) => i !== currentSideIndex).map((s) => s.rosterId).filter((id) => id > 0);
    return (rosters || []).filter((r) => !selectedRosterIds.includes(r.roster_id));
  }, [tradeSides, rosters]);

  const isLoading = rostersLoading || valuesLoading || picksLoading;
  const hasAssets = tradeSides.some((s) => s.assets.length > 0);

  if (isLoading) {
    return (
      <div className="p-4 max-w-6xl mx-auto">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-accent-500" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-4 max-w-6xl mx-auto">
      {/* Compact Header */}
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">Trade Evaluator</h1>
          <p className="text-slate-500 dark:text-slate-400 text-xs">KTC dynasty values</p>
        </div>
        <div className="flex items-center gap-1.5">
          {hasAssets && (
            <button
              onClick={resetTrade}
              className="flex items-center gap-1 px-2 py-1 text-slate-500 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800 rounded text-xs font-medium"
            >
              <RotateCcw className="h-3 w-3" />
              Reset
            </button>
          )}
          {tradeSides.length < 4 && (
            <button
              onClick={addTradeSide}
              className="flex items-center gap-1 px-2.5 py-1 bg-accent-500 hover:bg-accent-600 text-white rounded text-xs font-medium"
            >
              <Plus className="h-3 w-3" />
              Team
            </button>
          )}
        </div>
      </div>

      {/* Trade Analysis - Compact Banner */}
      {tradeAnalysis && (
        <div
          className={`mb-3 px-3 py-2 rounded-lg flex items-center justify-between ${
            tradeAnalysis.fairness === 'fair'
              ? 'bg-emerald-500/10 border border-emerald-500/30'
              : tradeAnalysis.fairness === 'slight'
              ? 'bg-blue-500/10 border border-blue-500/30'
              : tradeAnalysis.fairness === 'unfair'
              ? 'bg-amber-500/10 border border-amber-500/30'
              : 'bg-red-500/10 border border-red-500/30'
          }`}
        >
          <div className="flex items-center gap-2">
            <Scale
              className={`h-4 w-4 ${
                tradeAnalysis.fairness === 'fair'
                  ? 'text-emerald-500'
                  : tradeAnalysis.fairness === 'slight'
                  ? 'text-blue-500'
                  : tradeAnalysis.fairness === 'unfair'
                  ? 'text-amber-500'
                  : 'text-red-500'
              }`}
            />
            <span className="text-sm font-semibold text-slate-900 dark:text-white">
              {tradeAnalysis.fairness === 'fair' ? 'Fair Trade' : tradeAnalysis.fairness === 'slight' ? 'Slightly Uneven' : tradeAnalysis.fairness === 'unfair' ? 'Unfair' : 'Lopsided'}
            </span>
          </div>
          <span className="text-xs text-slate-600 dark:text-slate-300">
            <span className="font-semibold">{rosters?.find((r) => r.roster_id === tradeAnalysis.winner)?.ownerName}</span> wins by{' '}
            <span className="font-bold">{tradeAnalysis.difference.toLocaleString()}</span> ({tradeAnalysis.percentDiff}%)
          </span>
        </div>
      )}

      {/* Trade Cards Grid */}
      <div className={`grid gap-3 ${
        tradeSides.length === 2 ? 'grid-cols-1 sm:grid-cols-2' : tradeSides.length === 3 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-4'
      }`}>
        {tradeSides.map((side, sideIndex) => {
          const roster = rosters?.find((r) => r.roster_id === side.rosterId);
          const sideTotal = totals[sideIndex]?.total || 0;
          const isWinner = tradeAnalysis?.winner === side.rosterId;
          const isLoser = tradeAnalysis?.loser === side.rosterId;

          return (
            <div
              key={sideIndex}
              className={`bg-white dark:bg-zinc-900 rounded-lg border-2 overflow-hidden ${
                isWinner
                  ? 'border-emerald-400 dark:border-emerald-500'
                  : isLoser
                  ? 'border-red-400 dark:border-red-500'
                  : 'border-slate-200 dark:border-zinc-700'
              }`}
            >
              {/* Team Header - Compact */}
              <div className="px-2.5 py-2 bg-slate-50 dark:bg-zinc-800/50 border-b border-slate-200 dark:border-zinc-700">
                <div className="flex items-center justify-between mb-1.5">
                  {isWinner ? (
                    <span className="px-1.5 py-0.5 bg-emerald-500 text-white text-[9px] font-bold rounded uppercase">Winner</span>
                  ) : isLoser ? (
                    <span className="px-1.5 py-0.5 bg-red-500 text-white text-[9px] font-bold rounded uppercase">Loser</span>
                  ) : (
                    <span className="text-[10px] font-medium text-slate-400 uppercase">Team {sideIndex + 1}</span>
                  )}
                  {tradeSides.length > 2 && (
                    <button onClick={() => removeTradeSide(sideIndex)} className="p-0.5 text-slate-400 hover:text-red-500 rounded">
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
                <div className="relative">
                  <select
                    value={side.rosterId}
                    onChange={(e) => setRoster(sideIndex, parseInt(e.target.value))}
                    className="w-full px-2 py-1.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded text-xs font-semibold text-slate-900 dark:text-white appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-accent-500"
                  >
                    <option value={0}>Select Team...</option>
                    {getAvailableRosters(sideIndex).map((r) => (
                      <option key={r.roster_id} value={r.roster_id}>{r.ownerName}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none" />
                </div>
              </div>

              {/* Assets - Compact */}
              <div className="p-2 min-h-[120px]">
                {side.rosterId === 0 ? (
                  <div className="flex flex-col items-center justify-center h-24 text-slate-400">
                    <Users className="h-6 w-6 mb-1 opacity-50" />
                    <p className="text-[10px]">Select a team</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {/* Added Assets - Very Compact */}
                    {side.assets.map((asset) => (
                      <div
                        key={asset.id}
                        className={`flex items-center justify-between px-2 py-1.5 rounded border text-xs ${
                          POSITION_COLORS[asset.position || 'PICK'] || POSITION_COLORS.PICK
                        }`}
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className={`px-1 py-0.5 rounded text-[8px] font-bold ${POSITION_BADGE_COLORS[asset.position || 'PICK']}`}>
                            {asset.type === 'player' ? asset.position : 'PK'}
                          </span>
                          <span className="font-medium truncate">{asset.name}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="font-bold tabular-nums">{asset.value.toLocaleString()}</span>
                          <button onClick={() => removeAsset(sideIndex, asset.id)} className="p-0.5 hover:bg-black/10 rounded">
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      </div>
                    ))}

                    {/* Add Buttons - Compact Row */}
                    <div className="flex gap-1 pt-1">
                      <div className="relative flex-1">
                        <button
                          onClick={() => setActiveDropdown(activeDropdown?.side === sideIndex && activeDropdown?.type === 'player' ? null : { side: sideIndex, type: 'player' })}
                          className="w-full flex items-center justify-center gap-1 py-1.5 border border-dashed border-slate-300 dark:border-zinc-600 rounded text-[10px] text-slate-500 hover:border-accent-400 hover:text-accent-600 hover:bg-accent-50 dark:hover:bg-accent-500/5 transition-colors"
                        >
                          <Plus className="h-2.5 w-2.5" />
                          Player
                        </button>
                        <AssetDropdown
                          isOpen={activeDropdown?.side === sideIndex && activeDropdown?.type === 'player'}
                          onClose={() => setActiveDropdown(null)}
                          title="Players"
                          searchable
                          items={getAvailableAssets(sideIndex, 'player')}
                          onSelect={(asset) => addAsset(sideIndex, asset)}
                          emptyMessage="No players"
                        />
                      </div>
                      <div className="relative flex-1">
                        <button
                          onClick={() => setActiveDropdown(activeDropdown?.side === sideIndex && activeDropdown?.type === 'pick' ? null : { side: sideIndex, type: 'pick' })}
                          className="w-full flex items-center justify-center gap-1 py-1.5 border border-dashed border-slate-300 dark:border-zinc-600 rounded text-[10px] text-slate-500 hover:border-purple-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-500/5 transition-colors"
                        >
                          <Plus className="h-2.5 w-2.5" />
                          Pick
                        </button>
                        <AssetDropdown
                          isOpen={activeDropdown?.side === sideIndex && activeDropdown?.type === 'pick'}
                          onClose={() => setActiveDropdown(null)}
                          title="Picks"
                          items={getAvailableAssets(sideIndex, 'pick')}
                          onSelect={(asset) => addAsset(sideIndex, asset)}
                          emptyMessage="No picks"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Total - Compact */}
              <div
                className={`px-2.5 py-2 border-t flex items-center justify-between ${
                  isWinner
                    ? 'bg-emerald-500/10 border-emerald-500/30'
                    : isLoser
                    ? 'bg-red-500/10 border-red-500/30'
                    : 'bg-slate-50 dark:bg-zinc-800/50 border-slate-200 dark:border-zinc-700'
                }`}
              >
                <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase">Total</span>
                <div className="flex items-center gap-1">
                  {isWinner && <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />}
                  {isLoser && <TrendingDown className="h-3.5 w-3.5 text-red-500" />}
                  <span className={`text-base font-bold tabular-nums ${
                    isWinner ? 'text-emerald-600 dark:text-emerald-400' : isLoser ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white'
                  }`}>
                    {sideTotal.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Swap Icon for 2-team trades */}
      {tradeSides.length === 2 && !hasAssets && (
        <div className="flex justify-center mt-3">
          <div className="w-8 h-8 bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-full flex items-center justify-center">
            <ArrowLeftRight className="w-4 h-4 text-slate-400" />
          </div>
        </div>
      )}
    </div>
  );
}

export default TradeEvaluator;
