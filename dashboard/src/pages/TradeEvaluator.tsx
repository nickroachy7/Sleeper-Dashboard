import { useState, useMemo } from 'react';
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
  PICK: 'bg-cyan-100 dark:bg-cyan-500/20 text-cyan-700 dark:text-cyan-400 border-cyan-200 dark:border-cyan-500/30',
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

  // Early = bottom 4, Mid = middle 4, Late = top 4
  if (standing > (totalRosters * 2) / 3) return 'Early';
  if (standing > totalRosters / 3) return 'Mid';
  return 'Late';
}

function getPickDisplayName(year: string, round: number, tier: string): string {
  const roundSuffix = round === 1 ? '1st' : round === 2 ? '2nd' : round === 3 ? '3rd' : `${round}th`;
  return `${year} ${tier} ${roundSuffix}`;
}

export function TradeEvaluator() {
  const [tradeSides, setTradeSides] = useState<TradeSide[]>([
    { rosterId: 0, assets: [] },
    { rosterId: 0, assets: [] },
  ]);
  const [searchQueries, setSearchQueries] = useState<string[]>(['', '']);
  const [showPlayerDropdown, setShowPlayerDropdown] = useState<number | null>(null);
  const [showPickDropdown, setShowPickDropdown] = useState<number | null>(null);

  // Fetch rosters with owner names
  const { data: rosters } = useQuery({
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
  const { data: playerValues } = useQuery({
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
  const { data: pickValues } = useQuery({
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
  const getPicksOwnedByRoster = (rosterId: number): TradeAsset[] => {
    if (!rosters || !pickValues || !tradedPicks) return [];

    const picks: TradeAsset[] = [];
    const futureYears = ['2025', '2026', '2027', '2028'];
    const rounds = [1, 2, 3, 4];

    for (const year of futureYears) {
      for (const round of rounds) {
        // For each original roster, check who owns the pick now
        for (const originalRoster of rosters) {
          const tradedPick = tradedPicks.find(
            (tp) => tp.season === year && tp.round === round && tp.roster_id === originalRoster.roster_id
          );

          const currentOwnerId = tradedPick ? tradedPick.owner_id : originalRoster.roster_id;

          if (currentOwnerId === rosterId) {
            // Get the projected tier based on the original owner's standings
            const tier = getProjectedPickTier(originalRoster.roster_id, rosters);
            const pickValue = pickValues.find(
              (pv) => pv.pick_year === year && pv.pick_round === round && pv.pick_tier === tier
            );

            if (pickValue) {
              const pickName = getPickDisplayName(year, round, tier);
              // Include original owner info if different
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

    // Sort by value descending
    return picks.sort((a, b) => b.value - a.value);
  };

  // Get players owned by a roster with their values
  const getPlayersOwnedByRoster = (rosterId: number): TradeAsset[] => {
    if (!rosters) return [];

    const roster = rosters.find((r) => r.roster_id === rosterId);
    if (!roster || !roster.players) return [];

    const playerAssets: TradeAsset[] = [];
    for (const playerId of roster.players) {
      const pv = playerValues?.get(playerId);
      
      if (pv && pv.player) {
        // Player has a KTC value
        playerAssets.push({
          id: `player-${playerId}`,
          type: 'player',
          name: pv.player.full_name,
          value: pv.value,
          position: pv.player.position,
          team: pv.player.team,
        });
      } else {
        // Player doesn't have a KTC value - look up from players table
        const player = players?.find((p) => p.player_id === playerId);
        if (player) {
          playerAssets.push({
            id: `player-${playerId}`,
            type: 'player',
            name: player.full_name,
            value: 0, // No KTC value
            position: player.position,
            team: player.team,
          });
        } else {
          // Player not in players table either (rare) - still show with ID
          playerAssets.push({
            id: `player-${playerId}`,
            type: 'player',
            name: `Player ${playerId}`,
            value: 0,
            position: undefined,
            team: null,
          });
        }
      }
    }

    // Sort by value descending, then by name for players with 0 value
    return playerAssets.sort((a, b) => {
      if (b.value !== a.value) return b.value - a.value;
      return a.name.localeCompare(b.name);
    });
  };

  // Filter players for dropdown
  const getFilteredPlayers = (sideIndex: number) => {
    const query = searchQueries[sideIndex]?.toLowerCase() || '';
    const rosterId = tradeSides[sideIndex].rosterId;
    const ownedPlayers = getPlayersOwnedByRoster(rosterId);

    // Filter out already added players
    const addedPlayerIds = new Set(
      tradeSides[sideIndex].assets.filter((a) => a.type === 'player').map((a) => a.id)
    );

    return ownedPlayers
      .filter((p) => !addedPlayerIds.has(p.id))
      .filter(
        (p) =>
          !query ||
          p.name.toLowerCase().includes(query) ||
          p.position?.toLowerCase().includes(query) ||
          p.team?.toLowerCase().includes(query)
      );
    // No limit - show all roster players
  };

  // Filter picks for dropdown
  const getFilteredPicks = (sideIndex: number) => {
    const rosterId = tradeSides[sideIndex].rosterId;
    const ownedPicks = getPicksOwnedByRoster(rosterId);

    // Filter out already added picks
    const addedPickIds = new Set(
      tradeSides[sideIndex].assets.filter((a) => a.type === 'pick').map((a) => a.id)
    );

    return ownedPicks.filter((p) => !addedPickIds.has(p.id));
  };

  // Add asset to trade side
  const addAsset = (sideIndex: number, asset: TradeAsset) => {
    setTradeSides((prev) => {
      const updated = [...prev];
      updated[sideIndex] = {
        ...updated[sideIndex],
        assets: [...updated[sideIndex].assets, asset],
      };
      return updated;
    });
    setShowPlayerDropdown(null);
    setShowPickDropdown(null);
    setSearchQueries((prev) => {
      const updated = [...prev];
      updated[sideIndex] = '';
      return updated;
    });
  };

  // Remove asset from trade side
  const removeAsset = (sideIndex: number, assetId: string) => {
    setTradeSides((prev) => {
      const updated = [...prev];
      updated[sideIndex] = {
        ...updated[sideIndex],
        assets: updated[sideIndex].assets.filter((a) => a.id !== assetId),
      };
      return updated;
    });
  };

  // Set roster for a trade side
  const setRoster = (sideIndex: number, rosterId: number) => {
    setTradeSides((prev) => {
      const updated = [...prev];
      updated[sideIndex] = { rosterId, assets: [] };
      return updated;
    });
  };

  // Add another team to the trade
  const addTradeSide = () => {
    if (tradeSides.length < 4) {
      setTradeSides((prev) => [...prev, { rosterId: 0, assets: [] }]);
      setSearchQueries((prev) => [...prev, '']);
    }
  };

  // Remove a team from the trade
  const removeTradeSide = (index: number) => {
    if (tradeSides.length > 2) {
      setTradeSides((prev) => prev.filter((_, i) => i !== index));
      setSearchQueries((prev) => prev.filter((_, i) => i !== index));
    }
  };

  // Calculate totals
  const totals = useMemo(() => {
    return tradeSides.map((side) => ({
      rosterId: side.rosterId,
      total: side.assets.reduce((sum, asset) => sum + asset.value, 0),
    }));
  }, [tradeSides]);

  // Determine winner
  // In a trade, each side shows what that team is GIVING AWAY
  // The team that gives away LESS value (lower total) and receives MORE wins
  const tradeAnalysis = useMemo(() => {
    if (tradeSides.some((s) => s.rosterId === 0) || tradeSides.some((s) => s.assets.length === 0)) {
      return null;
    }

    // Sort by total ASCENDING - the team giving away LESS wins
    const sortedTotals = [...totals].sort((a, b) => a.total - b.total);
    const winner = sortedTotals[0]; // Gives away least
    const loser = sortedTotals[sortedTotals.length - 1]; // Gives away most
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

  // Get available rosters (not already selected)
  const getAvailableRosters = (currentSideIndex: number) => {
    const selectedRosterIds = tradeSides
      .filter((_, i) => i !== currentSideIndex)
      .map((s) => s.rosterId)
      .filter((id) => id > 0);

    return (rosters || []).filter((r) => !selectedRosterIds.includes(r.roster_id));
  };

  const isLoading = !rosters || !players || !playerValues || !pickValues;

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <Loader2 className="h-8 w-8 sm:h-10 sm:w-10 animate-spin text-accent-500 mx-auto" />
            <p className="mt-4 text-slate-500 dark:text-slate-400 text-xs sm:text-sm">Loading trade evaluator...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-4 sm:mb-8 flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">Trade Evaluator</h1>
          <p className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm mt-1">
            Build and analyze potential trades using KTC dynasty values
          </p>
        </div>
        {tradeSides.length < 4 && (
          <button
            onClick={addTradeSide}
            className="flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors text-xs sm:text-sm font-medium border border-slate-200 dark:border-zinc-700"
          >
            <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            Add Team
          </button>
        )}
      </div>

      {/* Trade Analysis Summary */}
      {tradeAnalysis && (
        <div
          className={`mb-4 sm:mb-8 p-3 sm:p-4 rounded-lg sm:rounded-xl border-2 ${
            tradeAnalysis.fairness === 'fair'
              ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30'
              : tradeAnalysis.fairness === 'slight'
              ? 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30'
              : tradeAnalysis.fairness === 'unfair'
              ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30'
              : 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30'
          }`}
        >
          <div className="flex items-center gap-2 sm:gap-3">
            <Scale
              className={`h-5 w-5 sm:h-6 sm:w-6 shrink-0 ${
                tradeAnalysis.fairness === 'fair'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : tradeAnalysis.fairness === 'slight'
                  ? 'text-blue-600 dark:text-blue-400'
                  : tradeAnalysis.fairness === 'unfair'
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            />
            <div className="min-w-0">
              <p className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white">
                {tradeAnalysis.fairness === 'fair'
                  ? 'Fair Trade'
                  : tradeAnalysis.fairness === 'slight'
                  ? 'Slightly Uneven'
                  : tradeAnalysis.fairness === 'unfair'
                  ? 'Unfair Trade'
                  : 'Lopsided Trade'}
              </p>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                {rosters?.find((r) => r.roster_id === tradeAnalysis.winner)?.ownerName} wins by{' '}
                <span className="font-semibold">{tradeAnalysis.difference.toLocaleString()}</span> ({tradeAnalysis.percentDiff}%)
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Trade Sides Grid */}
      <div className="mt-4 sm:mt-10 relative">
        <div className={`grid gap-3 sm:gap-6 ${tradeSides.length === 2 ? 'grid-cols-1 sm:grid-cols-2' : tradeSides.length === 3 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'}`}>
          {tradeSides.map((side, sideIndex) => {
            const roster = rosters?.find((r) => r.roster_id === side.rosterId);
            const sideTotal = totals[sideIndex]?.total || 0;
            const isWinner = tradeAnalysis?.winner === side.rosterId;
            const isLoser = tradeAnalysis?.loser === side.rosterId;
            const sideLabel = String.fromCharCode(65 + sideIndex); // A, B, C, D

            return (
              <div
                key={sideIndex}
                className={`bg-white dark:bg-zinc-900 rounded-lg sm:rounded-xl border-2 shadow-sm dark:shadow-none ${
                  isWinner
                    ? 'border-emerald-300 dark:border-emerald-500/50 ring-2 ring-emerald-100 dark:ring-emerald-500/20'
                    : isLoser
                    ? 'border-red-300 dark:border-red-500/50 ring-2 ring-red-100 dark:ring-red-500/20'
                    : 'border-slate-200 dark:border-zinc-700'
                }`}
              >
                {/* Team Header */}
                <div className="p-3 sm:p-5 bg-slate-50 dark:bg-zinc-800/50 border-b border-slate-200 dark:border-zinc-700">
                  <div className="flex items-center justify-between mb-2 sm:mb-3">
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <span className="w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center bg-slate-200 dark:bg-zinc-700 rounded-lg text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300">
                        {sideLabel}
                      </span>
                      <span className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
                        Side {sideLabel}
                      </span>
                    </div>
                    {tradeSides.length > 2 && (
                      <button
                        onClick={() => removeTradeSide(sideIndex)}
                        className="p-1 sm:p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
                      >
                        <X className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </button>
                    )}
                  </div>

                {/* Team Selector */}
                <div className="relative">
                  <select
                    value={side.rosterId}
                    onChange={(e) => setRoster(sideIndex, parseInt(e.target.value))}
                    className="w-full px-2.5 sm:px-3 py-2 sm:py-2.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg text-xs sm:text-sm font-medium text-slate-900 dark:text-white appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
                  >
                    <option value={0}>Select Team...</option>
                    {getAvailableRosters(sideIndex).map((r) => (
                      <option key={r.roster_id} value={r.roster_id}>
                        {r.ownerName}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2.5 sm:right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 sm:h-4 sm:w-4 text-slate-400 dark:text-slate-500 pointer-events-none" />
                </div>

                {/* Team Stats */}
                {roster && (
                  <div className="mt-2 sm:mt-3 flex items-center gap-2 sm:gap-4 text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                    <span className="flex items-center gap-0.5 sm:gap-1">
                      <Trophy className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                      {roster.wins}-{roster.losses}
                    </span>
                    <span className="flex items-center gap-0.5 sm:gap-1">
                      <Users className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                      {roster.players?.length || 0}
                    </span>
                    <span className="px-1 sm:px-1.5 py-0.5 bg-slate-200 dark:bg-zinc-700 rounded text-slate-600 dark:text-slate-300 font-medium">
                      {getProjectedPickTier(roster.roster_id, rosters!)} picks
                    </span>
                  </div>
                )}
              </div>

              {/* Assets */}
              <div className="p-4 min-h-[200px] pb-8">
                {side.rosterId === 0 ? (
                  <div className="flex flex-col items-center justify-center h-40 text-slate-400 dark:text-slate-500">
                    <Users className="h-8 w-8 mb-2" />
                    <p className="text-sm">Select a team first</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Added Assets */}
                    {side.assets.map((asset) => (
                      <div
                        key={asset.id}
                        className={`flex items-center justify-between p-2.5 rounded-lg border ${
                          POSITION_COLORS[asset.position || 'PICK'] || POSITION_COLORS.PICK
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs font-semibold shrink-0">
                            {asset.type === 'player' ? asset.position : 'PICK'}
                          </span>
                          <span className="text-sm font-medium truncate">{asset.name}</span>
                          {asset.team && (
                            <span className="text-xs opacity-70 shrink-0">{asset.team}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-sm font-bold">{asset.value.toLocaleString()}</span>
                          <button
                            onClick={() => removeAsset(sideIndex, asset.id)}
                            className="p-1 hover:bg-white/50 dark:hover:bg-black/20 rounded transition-colors"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}

                    {/* Add Player */}
                    <div className="relative">
                      <div
                        className="flex items-center gap-1.5 sm:gap-2 p-2 sm:p-2.5 border border-dashed border-slate-300 dark:border-zinc-600 rounded-lg cursor-pointer hover:border-slate-400 dark:hover:border-zinc-500 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
                        onClick={() => {
                          setShowPlayerDropdown(showPlayerDropdown === sideIndex ? null : sideIndex);
                          setShowPickDropdown(null);
                        }}
                      >
                        <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-slate-400 dark:text-slate-500" />
                        <span className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Add Player</span>
                      </div>

                      {showPlayerDropdown === sideIndex && (
                        <div className="absolute z-50 left-0 right-0 mt-1 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg shadow-xl dark:shadow-none max-h-80 overflow-hidden">
                          <div className="p-2 border-b border-slate-100 dark:border-zinc-800">
                            <div className="relative">
                              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
                              <input
                                type="text"
                                placeholder="Search players..."
                                value={searchQueries[sideIndex]}
                                onChange={(e) => {
                                  const updated = [...searchQueries];
                                  updated[sideIndex] = e.target.value;
                                  setSearchQueries(updated);
                                }}
                                className="w-full pl-8 pr-3 py-1.5 text-sm bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
                                autoFocus
                              />
                            </div>
                          </div>
                          <div className="max-h-64 overflow-y-auto">
                            {getFilteredPlayers(sideIndex).length === 0 ? (
                              <div className="p-3 text-sm text-slate-500 dark:text-slate-400 text-center">
                                No players found
                              </div>
                            ) : (
                              getFilteredPlayers(sideIndex).map((player) => (
                                <button
                                  key={player.id}
                                  onClick={() => addAsset(sideIndex, player)}
                                  className="w-full flex items-center justify-between p-2.5 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors text-left"
                                >
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={`px-1.5 py-0.5 rounded text-xs font-semibold ${
                                        POSITION_COLORS[player.position || ''] || 'bg-slate-100 dark:bg-zinc-700 text-slate-600 dark:text-slate-400'
                                      }`}
                                    >
                                      {player.position}
                                    </span>
                                    <span className="text-sm font-medium text-slate-900 dark:text-white">{player.name}</span>
                                    {player.team && (
                                      <span className="text-xs text-slate-500 dark:text-slate-400">{player.team}</span>
                                    )}
                                  </div>
                                  <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                                    {player.value.toLocaleString()}
                                  </span>
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Add Pick */}
                    <div className="relative">
                      <div
                        className="flex items-center gap-1.5 sm:gap-2 p-2 sm:p-2.5 border border-dashed border-slate-300 dark:border-zinc-600 rounded-lg cursor-pointer hover:border-slate-400 dark:hover:border-zinc-500 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
                        onClick={() => {
                          setShowPickDropdown(showPickDropdown === sideIndex ? null : sideIndex);
                          setShowPlayerDropdown(null);
                        }}
                      >
                        <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-slate-400 dark:text-slate-500" />
                        <span className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Add Draft Pick</span>
                      </div>

                      {showPickDropdown === sideIndex && (
                        <div className="absolute z-50 left-0 right-0 mt-1 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg shadow-xl dark:shadow-none max-h-64 overflow-y-auto">
                          {getFilteredPicks(sideIndex).length === 0 ? (
                            <div className="p-3 text-sm text-slate-500 dark:text-slate-400 text-center">
                              No picks available
                            </div>
                          ) : (
                            getFilteredPicks(sideIndex).map((pick) => (
                              <button
                                key={pick.id}
                                onClick={() => addAsset(sideIndex, pick)}
                                className="w-full flex items-center justify-between p-2.5 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors text-left"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-cyan-100 dark:bg-cyan-500/20 text-cyan-700 dark:text-cyan-400">
                                    PICK
                                  </span>
                                  <span className="text-sm font-medium text-slate-900 dark:text-white">{pick.name}</span>
                                </div>
                                <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                                  {pick.value.toLocaleString()}
                                </span>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Total */}
              <div
                className={`p-3 sm:p-4 border-t ${
                  isWinner
                    ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30'
                    : isLoser
                    ? 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30'
                    : 'bg-slate-50 dark:bg-zinc-800/50 border-slate-200 dark:border-zinc-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400">Total Value</span>
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    {isWinner && <TrendingUp className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-emerald-600 dark:text-emerald-400" />}
                    {isLoser && <TrendingDown className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-red-600 dark:text-red-400" />}
                    {!isWinner && !isLoser && tradeAnalysis && (
                      <Minus className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-slate-400 dark:text-slate-500" />
                    )}
                    <span
                      className={`text-base sm:text-xl font-bold ${
                        isWinner ? 'text-emerald-700 dark:text-emerald-400' : isLoser ? 'text-red-700 dark:text-red-400' : 'text-slate-900 dark:text-white'
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

        {/* Swap Icon - only show for 2-team trades */}
        {tradeSides.length === 2 && (
          <div className="hidden sm:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white dark:bg-zinc-900 border-2 border-slate-200 dark:border-zinc-700 rounded-full flex items-center justify-center shadow-lg">
              <ArrowLeftRight className="w-4 h-4 sm:w-5 sm:h-5 text-slate-500 dark:text-slate-400" />
            </div>
          </div>
        )}
      </div>

      {/* Instructions */}
      {tradeSides.every((s) => s.assets.length === 0) && (
        <div className="mt-4 sm:mt-8 bg-slate-50 dark:bg-zinc-900 rounded-lg sm:rounded-xl p-4 sm:p-6 border border-slate-200 dark:border-zinc-800">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-accent-100 dark:bg-accent-500/20 rounded-lg flex items-center justify-center shrink-0">
              <ArrowLeftRight className="h-4 w-4 sm:h-5 sm:w-5 text-accent-600 dark:text-accent-400" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white mb-1">How to use</h3>
              <ul className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 space-y-0.5 sm:space-y-1">
                <li>1. Select teams for each side</li>
                <li>2. Add players and picks</li>
                <li>3. Pick values based on standings</li>
                <li>4. See who wins the trade</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TradeEvaluator;
