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

// Position badge classes matching TradeFinder design
const getPositionBadgeClass = (position: string): string => {
  switch (position) {
    case 'QB':
      return 'bg-red-500/20 text-red-400 border border-red-500/30';
    case 'RB':
      return 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
    case 'WR':
      return 'bg-blue-500/20 text-blue-400 border border-blue-500/30';
    case 'TE':
      return 'bg-orange-500/20 text-orange-400 border border-orange-500/30';
    case 'PICK':
      return 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30';
    default:
      return 'bg-[#111111] text-[#333333] border border-[#151515]';
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

// Asset selection dropdown - matching TradeFinder style
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
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div
        ref={dropdownRef}
        className="fixed z-50 left-4 right-4 top-1/2 -translate-y-1/2 max-w-lg mx-auto bg-[#0a0a0a] border border-[#151515] rounded-md shadow-2xl overflow-hidden"
      >
        <div className="px-4 py-3 bg-[#0a0a0a] border-b border-[#151515] flex items-center justify-between">
          <span className="text-xs font-semibold text-[#888888] uppercase tracking-wider">{title}</span>
          <button onClick={onClose} className="p-1.5 hover:bg-[#111111] rounded-md transition-colors">
            <X className="h-4 w-4 text-[#888888]" />
          </button>
        </div>

        <div className="p-3 border-b border-[#151515]">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#888888]" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search players or picks..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 text-sm bg-[#0a0a0a] border border-[#151515] rounded-md text-white placeholder-[#555555] focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent transition-colors"
            />
          </div>
        </div>

        <div className="px-4 py-2 bg-[#0a0a0a] border-b border-[#151515]">
          <span className="text-xs text-[#888888]">
            Showing {filteredItems.length} {filteredItems.length === 1 ? 'asset' : 'assets'}
          </span>
        </div>

        <div className="max-h-96 overflow-y-auto overscroll-contain">
          {filteredItems.length === 0 ? (
            <div className="p-8 text-sm text-[#888888] text-center">{emptyMessage}</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-[#0a0a0a] border-b border-[#151515]">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#888888] uppercase tracking-wider">Asset</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-[#888888] uppercase tracking-wider">Type</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-[#888888] uppercase tracking-wider">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#111111]">
                {filteredItems.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => { onSelect(item); onClose(); }}
                    className="hover:bg-[#111111] cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <span className="text-sm text-white font-medium">{item.name}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-md ${getPositionBadgeClass(item.type === 'player' ? (item.position || '') : 'PICK')}`}>
                        {item.type === 'player' ? item.position : 'PICK'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-bold text-accent-400">{item.value.toLocaleString()}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}

// Team selector dropdown - matching TradeFinder style
function TeamDropdown({
  isOpen,
  onClose,
  title,
  rosters,
  excludeRosterIds,
  onSelect,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
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
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div
        ref={dropdownRef}
        className="fixed z-50 left-4 right-4 top-1/2 -translate-y-1/2 max-w-md mx-auto bg-[#0a0a0a] border border-[#151515] rounded-md shadow-2xl overflow-hidden"
      >
        <div className="px-4 py-3 bg-[#0a0a0a] border-b border-[#151515] flex items-center justify-between">
          <span className="text-xs font-semibold text-[#888888] uppercase tracking-wider">{title}</span>
          <button onClick={onClose} className="p-1.5 hover:bg-[#111111] rounded-md transition-colors">
            <X className="h-4 w-4 text-[#888888]" />
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto overscroll-contain divide-y divide-[#111111]">
          {filteredRosters.map((roster) => (
            <button
              key={roster.roster_id}
              onClick={() => { onSelect(roster); onClose(); }}
              className="w-full px-4 py-3 text-left hover:bg-[#111111] transition-colors flex items-center justify-between"
            >
              <span className="text-sm text-white font-medium">
                {roster.teamName || roster.ownerName}
              </span>
              <span className="text-xs text-[#888888]">
                {roster.wins}-{roster.losses}
              </span>
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

  const setRoster = useCallback((sideIndex: number, roster: Roster) => {
    setTradeSides((prev) => {
      const updated = [...prev];
      updated[sideIndex] = { rosterId: roster.roster_id, assets: [] };
      return updated;
    });
  }, []);

  const resetTrade = useCallback(() => {
    setTradeSides([{ rosterId: 0, assets: [] }, { rosterId: 0, assets: [] }]);
    setActiveDropdown(null);
  }, []);

  const totals = useMemo(() => {
    return tradeSides.map((side) => {
      const sideValue = calculateSideValue(side.assets as ValueAdjustmentAsset[]);
      return {
        rosterId: side.rosterId,
        rawTotal: sideValue.rawTotal,
        adjustedTotal: sideValue.adjustedTotal,
        studBonus: sideValue.studBonus,
        consolidationBonus: sideValue.consolidationBonus,
        piecesPenalty: sideValue.piecesPenalty,
        tierMismatchPenalty: sideValue.tierMismatchPenalty,
        adjustmentBreakdown: sideValue.adjustmentBreakdown,
      };
    });
  }, [tradeSides]);

  const tradeAnalysis = useMemo(() => {
    if (tradeSides.some((s) => s.rosterId === 0) || tradeSides.some((s) => s.assets.length === 0)) return null;

    const analysis = analyzeTrade(
      tradeSides[0].assets as ValueAdjustmentAsset[],
      tradeSides[1].assets as ValueAdjustmentAsset[]
    );

    return {
      winner: tradeSides[analysis.winnerIndex].rosterId,
      loser: tradeSides[analysis.winnerIndex === 0 ? 1 : 0].rosterId,
      rawDifference: analysis.rawDifference,
      adjustedDifference: analysis.adjustedDifference,
      valueAdjustment: analysis.valueAdjustment,
      fairness: analysis.fairness,
      explanation: analysis.explanation,
      tierMismatchExplanation: analysis.tierMismatchExplanation,
    };
  }, [totals, tradeSides]);

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

  return (
    <div>
        {/* Reset button */}
        <div className="mb-4 sm:mb-6 flex items-center justify-end">
          {hasAssets && (
            <button
              onClick={resetTrade}
              className="flex items-center gap-1.5 px-3 py-2 text-[#888888] hover:text-white hover:bg-[#111111] rounded-md text-xs sm:text-sm font-medium transition-colors"
            >
              <RotateCcw className="h-4 w-4" />
              <span className="hidden sm:inline">Reset</span>
            </button>
          )}
        </div>

        {/* Trade Analysis Banner - matching TradeFinder style */}
        {tradeAnalysis && (
          <div
            className={`mb-4 sm:mb-6 bg-[#0a0a0a] border-2 rounded-md p-4 sm:p-6 ${
              tradeAnalysis.fairness === 'fair'
                ? 'border-emerald-500/50'
                : tradeAnalysis.fairness === 'slight'
                ? 'border-blue-500/50'
                : tradeAnalysis.fairness === 'unfair'
                ? 'border-amber-500/50'
                : 'border-red-500/50'
            }`}
          >
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Scale
                  className={`h-4 w-4 sm:h-5 sm:w-5 ${
                    tradeAnalysis.fairness === 'fair'
                      ? 'text-emerald-500'
                      : tradeAnalysis.fairness === 'slight'
                      ? 'text-blue-500'
                      : tradeAnalysis.fairness === 'unfair'
                      ? 'text-amber-500'
                      : 'text-red-500'
                  }`}
                />
                <span className="text-sm sm:text-base font-semibold text-white">
                  {tradeAnalysis.fairness === 'fair' ? 'Fair Trade' : tradeAnalysis.fairness === 'slight' ? 'Slightly Uneven' : tradeAnalysis.fairness === 'unfair' ? 'Unfair' : 'Lopsided'}
                </span>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase ${
                  tradeAnalysis.fairness === 'fair'
                    ? 'bg-emerald-900/30 text-emerald-400'
                    : tradeAnalysis.fairness === 'slight'
                    ? 'bg-blue-900/30 text-blue-400'
                    : tradeAnalysis.fairness === 'unfair'
                    ? 'bg-amber-900/30 text-amber-400'
                    : 'bg-red-900/30 text-red-400'
                }`}>
                  {tradeAnalysis.fairness}
                </span>
              </div>
              <span className="text-xs sm:text-sm text-[#333333]">
                <span className="font-semibold">{rosters?.find((r) => r.roster_id === tradeAnalysis.winner)?.teamName || rosters?.find((r) => r.roster_id === tradeAnalysis.winner)?.ownerName}</span> wins by{' '}
                <span className="font-bold">{tradeAnalysis.adjustedDifference.toLocaleString()}</span>
              </span>
            </div>
            {/* Value Adjustment Explanation */}
            {tradeAnalysis.rawDifference !== tradeAnalysis.adjustedDifference && (
              <div className="mt-3 pt-3 border-t border-[#151515] flex items-start gap-1.5">
                <Info className="h-3 w-3 text-[#888888] mt-0.5 shrink-0" />
                <span className="text-[10px] sm:text-xs text-[#888888]">
                  Raw: {tradeAnalysis.rawDifference.toLocaleString()} → Adj: {tradeAnalysis.adjustedDifference.toLocaleString()}
                </span>
              </div>
            )}
            {/* Tier Mismatch Warning */}
            {tradeAnalysis.tierMismatchExplanation && (
              <div className="mt-2 pt-2 border-t border-[#151515] flex items-start gap-1.5">
                <AlertTriangle className="h-3 w-3 text-amber-500 mt-0.5 shrink-0" />
                <span className="text-[10px] sm:text-xs text-amber-400">
                  {tradeAnalysis.tierMismatchExplanation}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Trade Cards - matching TradeFinder scenario card style */}
        <div className="space-y-3 sm:space-y-4">
          {tradeSides.map((side, sideIndex) => {
            const sideTotal = totals[sideIndex];
            const isWinner = tradeAnalysis?.winner === side.rosterId;
            const isLoser = tradeAnalysis?.loser === side.rosterId;
            const roster = rosters?.find(r => r.roster_id === side.rosterId);

            return (
              <div
                key={sideIndex}
                className={`bg-[#0a0a0a] border-2 rounded-md overflow-hidden ${
                  isWinner
                    ? 'border-emerald-500/50'
                    : isLoser
                    ? 'border-red-500/50'
                    : 'border-[#151515]'
                }`}
              >
                {/* Team Header with dropdown button */}
                <div className="px-3 sm:px-4 py-3 bg-[#0a0a0a] border-b border-[#151515]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {isWinner ? (
                        <span className="px-2 py-0.5 bg-emerald-500 text-white text-[10px] sm:text-xs font-bold rounded uppercase">Winner</span>
                      ) : isLoser ? (
                        <span className="px-2 py-0.5 bg-red-500 text-white text-[10px] sm:text-xs font-bold rounded uppercase">Loser</span>
                      ) : null}
                    </div>
                    {sideTotal && sideTotal.adjustedTotal > 0 && (
                      <span className={`text-[10px] sm:text-xs font-semibold px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md ${
                        isWinner
                          ? 'bg-emerald-900/30 text-emerald-400'
                          : isLoser
                          ? 'bg-red-900/30 text-red-400'
                          : 'bg-[#111111] text-[#333333]'
                      }`}>
                        {tradeAnalysis && isWinner ? '+' : tradeAnalysis && isLoser ? '-' : ''}{sideTotal.adjustedTotal.toLocaleString()}
                      </span>
                    )}
                  </div>

                  {/* Team Selector Button */}
                  <button
                    onClick={() => setActiveDropdown({ side: sideIndex, type: 'team' })}
                    className="w-full mt-2 p-3 rounded-md border border-[#151515] hover:border-[#333333] transition-colors flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2 sm:gap-3">
                      <Users className="h-4 w-4 sm:h-5 sm:w-5 text-[#888888]" />
                      <span className={`text-xs sm:text-sm font-medium ${roster ? 'text-white' : 'text-[#888888]'}`}>
                        {roster ? (roster.teamName || roster.ownerName) : 'Select team...'}
                      </span>
                    </div>
                    <ChevronDown className="h-4 w-4 sm:h-5 sm:w-5 text-[#888888]" />
                  </button>
                </div>

                {/* Assets Section - matching TradeFinder GIVE/GET style */}
                <div className="p-3 sm:p-4">
                  {side.rosterId === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-[#888888]">
                      <Users className="h-8 w-8 mb-2 opacity-50" />
                      <p className="text-xs sm:text-sm">Select a team above</p>
                    </div>
                  ) : (
                    <div className={`rounded-md p-3 ${
                      isLoser
                        ? 'bg-red-900/10'
                        : isWinner
                        ? 'bg-emerald-900/10'
                        : 'bg-[#111111]'
                    }`}>
                      <div className={`text-[10px] sm:text-xs font-semibold uppercase tracking-wider mb-2 ${
                        isLoser
                          ? 'text-red-400'
                          : isWinner
                          ? 'text-emerald-400'
                          : 'text-[#888888]'
                      }`}>
                        {isLoser ? 'Give' : isWinner ? 'Get' : 'Assets'}
                        {sideTotal && sideTotal.adjustedTotal > 0 && (
                          <span className="font-normal text-[#888888] ml-1">
                            ({sideTotal.adjustedTotal.toLocaleString()})
                          </span>
                        )}
                      </div>

                      {/* Asset List */}
                      <div className="space-y-1.5 sm:space-y-2">
                        {side.assets.map((asset) => (
                          <div key={asset.id} className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className={`px-1.5 py-0.5 text-[10px] sm:text-xs font-medium rounded shrink-0 ${getPositionBadgeClass(asset.type === 'player' ? (asset.position || '') : 'PICK')}`}>
                                {asset.type === 'player' ? asset.position : 'PICK'}
                              </span>
                              <span className="text-xs sm:text-sm text-white truncate">{asset.name}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[10px] sm:text-xs text-[#888888]">{asset.value.toLocaleString()}</span>
                              <button onClick={() => removeAsset(sideIndex, asset.id)} className="p-1 hover:bg-[#111111] rounded transition-colors">
                                <X className="h-3 w-3 text-[#888888] hover:text-red-500" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Add Buttons */}
                      <div className="flex gap-2 mt-3 pt-3 border-t border-[#151515]">
                        <button
                          onClick={() => setActiveDropdown({ side: sideIndex, type: 'player' })}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-dashed border-[#333333] rounded-md text-xs sm:text-sm text-[#888888] hover:border-accent-400 hover:text-accent-500 hover:bg-accent-500/5 transition-colors"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Player
                        </button>
                        <button
                          onClick={() => setActiveDropdown({ side: sideIndex, type: 'pick' })}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-dashed border-[#333333] rounded-md text-xs sm:text-sm text-[#888888] hover:border-cyan-400 hover:text-cyan-400 hover:bg-cyan-500/5 transition-colors"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Pick
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Total Footer - matching TradeFinder style */}
                {side.assets.length > 0 && sideTotal && (
                  <div
                    className={`px-3 sm:px-4 py-3 border-t ${
                      isWinner
                        ? 'bg-emerald-500/10 border-emerald-500/30'
                        : isLoser
                        ? 'bg-red-500/10 border-red-500/30'
                        : 'bg-[#0a0a0a] border-[#151515]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] sm:text-xs font-medium text-[#888888] uppercase">Total</span>
                      <div className="flex items-center gap-1.5">
                        {isWinner && <TrendingUp className="h-4 w-4 text-emerald-500" />}
                        {isLoser && <TrendingDown className="h-4 w-4 text-red-500" />}
                        <span className={`text-base sm:text-lg font-bold tabular-nums ${
                          isWinner ? 'text-emerald-400' : isLoser ? 'text-red-400' : 'text-white'
                        }`}>
                          {sideTotal.adjustedTotal.toLocaleString()}
                        </span>
                      </div>
                    </div>
                    {/* Value Adjustment Breakdown */}
                    {(sideTotal.studBonus > 0 || sideTotal.consolidationBonus > 0 || sideTotal.piecesPenalty > 0 || sideTotal.tierMismatchPenalty > 0) && (
                      <div className="mt-2 pt-2 border-t border-[#151515] flex items-start gap-1.5">
                        <Info className="h-3 w-3 text-[#888888] mt-0.5 shrink-0" />
                        <span className="text-[10px] text-[#888888]">
                          Raw: {sideTotal.rawTotal.toLocaleString()} {sideTotal.adjustmentBreakdown}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Swap Icon between cards */}
        {!hasAssets && (
          <div className="flex justify-center my-4">
            <div className="w-10 h-10 bg-[#111111] border border-[#151515] rounded-full flex items-center justify-center">
              <ArrowLeftRight className="w-5 h-5 text-[#888888]" />
            </div>
          </div>
        )}

      {/* Dropdowns */}
      {tradeSides.map((_, sideIndex) => (
        <div key={sideIndex}>
          <TeamDropdown
            isOpen={activeDropdown?.side === sideIndex && activeDropdown?.type === 'team'}
            onClose={() => setActiveDropdown(null)}
            title="Select Team"
            rosters={rosters || []}
            excludeRosterIds={getExcludedRosterIds(sideIndex)}
            onSelect={(roster) => setRoster(sideIndex, roster)}
          />
          <AssetDropdown
            isOpen={activeDropdown?.side === sideIndex && activeDropdown?.type === 'player'}
            onClose={() => setActiveDropdown(null)}
            title="Select Player"
            items={getAvailableAssets(sideIndex, 'player')}
            onSelect={(asset) => addAsset(sideIndex, asset)}
            emptyMessage="No players available"
          />
          <AssetDropdown
            isOpen={activeDropdown?.side === sideIndex && activeDropdown?.type === 'pick'}
            onClose={() => setActiveDropdown(null)}
            title="Select Pick"
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
