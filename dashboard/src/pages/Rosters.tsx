import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Users, Loader2, ChevronDown, ChevronUp, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useMemo } from 'react';

interface Player {
  player_id: string;
  full_name: string;
  first_name: string;
  last_name: string;
  position: string;
  team: string | null;
  injury_status: string | null;
}

interface PlayerValue {
  player_id: string;
  value: number;
}

interface PickValue {
  pick_year: string;
  pick_round: number;
  pick_tier: string | null;
  value: number;
}

interface TradedPick {
  season: string;
  round: number;
  roster_id: number; // Original owner
  owner_id: number; // Current owner
}

interface LeagueUser {
  user_id: string;
  team_name: string | null;
  display_name: string | null;
}

interface PositionRanks {
  QB: number;
  RB: number;
  WR: number;
  TE: number;
  PICKS: number;
}

interface PositionValues {
  QB: number;
  RB: number;
  WR: number;
  TE: number;
  PICKS: number;
}

// Helper to determine pick tier based on roster standings
function getPickTier(roster_id: number, rosters: any[]): string {
  // Find the roster's current standing (by wins, then points)
  const sortedRosters = [...rosters].sort((a, b) => {
    const winsA = a.wins || 0;
    const winsB = b.wins || 0;
    if (winsA !== winsB) return winsB - winsA;
    const fptsA = Number(a.fpts) || 0;
    const fptsB = Number(b.fpts) || 0;
    return fptsB - fptsA;
  });
  
  const standing = sortedRosters.findIndex(r => r.roster_id === roster_id) + 1;
  const totalRosters = rosters.length;
  
  // Early = bottom 4, Mid = middle 4, Late = top 4
  if (standing > totalRosters * 2/3) return 'Early';
  if (standing > totalRosters * 1/3) return 'Mid';
  return 'Late';
}

const positionColors: Record<string, string> = {
  QB: 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/30',
  RB: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30',
  WR: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/30',
  TE: 'bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-500/30',
  K: 'bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-500/30',
  DEF: 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-500/30',
};

// Get color classes based on rank (1-12)
function getRankColorClass(rank: number): string {
  if (rank <= 3) return 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400'; // Top tier
  if (rank <= 6) return 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400'; // Good
  if (rank <= 9) return 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400'; // Average
  return 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400'; // Poor
}

export default function Rosters() {
  const [expandedRoster, setExpandedRoster] = useState<string | null>(null);

  const { data: players } = useQuery({
    queryKey: ['players'],
    queryFn: async () => {
      const { data } = await supabase.from('players').select('*');
      const playerMap = new Map<string, Player>();
      (data as Player[] || []).forEach(p => playerMap.set(p.player_id, p));
      return playerMap;
    },
  });

  const { data: rosters, isLoading } = useQuery({
    queryKey: ['rosters'],
    queryFn: async () => {
      const { data: rostersData } = await supabase.from('rosters').select('*');
      const { data: users } = await supabase.from('users').select('*');
      const { data: leagueUsers } = await supabase.from('league_users').select('user_id, team_name, display_name');

      if (!rostersData?.length) return [];

      return (rostersData as any[]).map((roster: any) => {
        const owner = (users as any[])?.find((u: any) => u.user_id === roster.owner_id);
        const leagueUser = (leagueUsers as LeagueUser[])?.find((lu: LeagueUser) => lu.user_id === roster.owner_id);
        return {
          ...roster,
          teamName: leagueUser?.team_name || leagueUser?.display_name || owner?.display_name || 'Team ' + roster.roster_id,
          ownerName: owner?.display_name || owner?.username || 'Unknown Owner',
          playerCount: roster.players?.length || 0,
          starterCount: roster.starters?.length || 0,
        };
      });
    },
  });

  // Fetch KTC player values
  const { data: playerValues } = useQuery({
    queryKey: ['playerValuesMap'],
    queryFn: async () => {
      const { data } = await supabase.from('player_values').select('player_id, value');
      const valueMap = new Map<string, number>();
      (data as PlayerValue[] || []).forEach(pv => valueMap.set(pv.player_id, pv.value));
      return valueMap;
    },
  });

  // Fetch KTC pick values
  const { data: pickValues } = useQuery({
    queryKey: ['pickValuesArray'],
    queryFn: async () => {
      const { data } = await supabase.from('pick_values').select('pick_year, pick_round, pick_tier, value');
      return data as PickValue[] || [];
    },
  });

  // Fetch traded picks
  const { data: tradedPicks } = useQuery({
    queryKey: ['tradedPicks'],
    queryFn: async () => {
      const { data } = await supabase.from('traded_picks').select('season, round, roster_id, owner_id');
      return data as TradedPick[] || [];
    },
  });

  // Calculate position rankings for all rosters
  const { positionRankings, rosterValues, rosterPicks } = useMemo(() => {
    if (!rosters || !players || !playerValues || !pickValues || !tradedPicks) {
      return { 
        positionRankings: new Map<number, PositionRanks>(),
        rosterValues: new Map<number, PositionValues & { total: number }>(),
        rosterPicks: new Map<number, { year: string; round: number; tier: string; value: number }[]>()
      };
    }

    // Calculate position values for each roster
    const rosterPositionValues: { roster_id: number; QB: number; RB: number; WR: number; TE: number; PICKS: number }[] = [];
    const valuesMap = new Map<number, PositionValues & { total: number }>();
    const picksMap = new Map<number, { year: string; round: number; tier: string; value: number }[]>();

    for (const roster of rosters) {
      const posValues = { roster_id: roster.roster_id, QB: 0, RB: 0, WR: 0, TE: 0, PICKS: 0 };
      const picks: { year: string; round: number; tier: string; value: number }[] = [];

      // Sum player values by position
      if (roster.players) {
        for (const playerId of roster.players) {
          const player = players.get(playerId);
          const value = playerValues.get(playerId) || 0;
          if (player && value > 0) {
            const pos = player.position as keyof typeof posValues;
            if (pos === 'QB' || pos === 'RB' || pos === 'WR' || pos === 'TE') {
              posValues[pos] += value;
            }
          }
        }
      }

      // Calculate pick values for this roster
      const futureYears = ['2025', '2026', '2027', '2028'];
      const rounds = [1, 2, 3, 4];

      for (const year of futureYears) {
        for (const round of rounds) {
          const tradedPick = tradedPicks.find(
            tp => tp.season === year && tp.round === round && tp.roster_id === roster.roster_id
          );
          
          const currentOwnerId = tradedPick ? tradedPick.owner_id : roster.roster_id;
          
          if (currentOwnerId === roster.roster_id) {
            const originalRosterId = tradedPick ? tradedPick.roster_id : roster.roster_id;
            const tier = getPickTier(originalRosterId, rosters);
            
            const pickValue = pickValues.find(
              pv => pv.pick_year === year && pv.pick_round === round && pv.pick_tier === tier
            );
            
            if (pickValue) {
              posValues.PICKS += pickValue.value;
              picks.push({ year, round, tier, value: pickValue.value });
            }
          }
        }
      }

      // Also check for picks traded TO this roster from other rosters
      const picksOwnedFromOthers = tradedPicks.filter(
        tp => tp.owner_id === roster.roster_id && tp.roster_id !== roster.roster_id
      );
      
      for (const pick of picksOwnedFromOthers) {
        const tier = getPickTier(pick.roster_id, rosters);
        const pickValue = pickValues.find(
          pv => pv.pick_year === pick.season && pv.pick_round === pick.round && pv.pick_tier === tier
        );
        if (pickValue) {
          posValues.PICKS += pickValue.value;
          picks.push({ year: pick.season, round: pick.round, tier, value: pickValue.value });
        }
      }

      rosterPositionValues.push(posValues);
      valuesMap.set(roster.roster_id, {
        QB: posValues.QB,
        RB: posValues.RB,
        WR: posValues.WR,
        TE: posValues.TE,
        PICKS: posValues.PICKS,
        total: posValues.QB + posValues.RB + posValues.WR + posValues.TE + posValues.PICKS
      });
      picksMap.set(roster.roster_id, picks.sort((a, b) => {
        if (a.year !== b.year) return a.year.localeCompare(b.year);
        return a.round - b.round;
      }));
    }

    // Rank rosters for each position (1 = best, 12 = worst)
    const rankings = new Map<number, PositionRanks>();
    
    const positions = ['QB', 'RB', 'WR', 'TE', 'PICKS'] as const;
    for (const pos of positions) {
      const sorted = [...rosterPositionValues].sort((a, b) => b[pos] - a[pos]);
      sorted.forEach((rv, index) => {
        if (!rankings.has(rv.roster_id)) {
          rankings.set(rv.roster_id, { QB: 0, RB: 0, WR: 0, TE: 0, PICKS: 0 });
        }
        rankings.get(rv.roster_id)![pos] = index + 1;
      });
    }

    return { positionRankings: rankings, rosterValues: valuesMap, rosterPicks: picksMap };
  }, [rosters, players, playerValues, pickValues, tradedPicks]);

  const getPlayer = (playerId: string): Player | undefined => {
    return players?.get(playerId);
  };

  // Group players by position for a roster
  const getGroupedPlayers = (rosterPlayers: string[]) => {
    const grouped: Record<string, { player: Player; value: number }[]> = {
      QB: [],
      RB: [],
      WR: [],
      TE: [],
      OTHER: []
    };
    
    for (const playerId of rosterPlayers || []) {
      const player = getPlayer(playerId);
      const value = playerValues?.get(playerId) || 0;
      if (player) {
        const pos = player.position;
        if (pos === 'QB' || pos === 'RB' || pos === 'WR' || pos === 'TE') {
          grouped[pos].push({ player, value });
        } else {
          grouped.OTHER.push({ player, value });
        }
      }
    }
    
    // Sort each group by value descending
    for (const pos of Object.keys(grouped)) {
      grouped[pos].sort((a, b) => b.value - a.value);
    }
    
    return grouped;
  };

  // Group picks by year
  const getGroupedPicks = (rosterId: number) => {
    const picks = rosterPicks.get(rosterId) || [];
    const grouped: Record<string, { round: number; tier: string; value: number }[]> = {};
    
    for (const pick of picks) {
      if (!grouped[pick.year]) {
        grouped[pick.year] = [];
      }
      grouped[pick.year].push({ round: pick.round, tier: pick.tier, value: pick.value });
    }
    
    return grouped;
  };

  const PlayerRow = ({ player, value }: { player: Player; value: number }) => {
    const posClass = positionColors[player.position] || 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-zinc-700';
    const injuryBadge = player.injury_status && player.injury_status !== 'None' && (
      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
        player.injury_status === 'Out' ? 'bg-red-500 text-white' :
        player.injury_status === 'Doubtful' ? 'bg-red-400 text-white' :
        player.injury_status === 'Questionable' ? 'bg-amber-400 text-amber-900' :
        player.injury_status === 'IR' ? 'bg-red-600 text-white' :
        'bg-slate-400 text-white'
      }`}>
        {player.injury_status === 'Questionable' ? 'Q' : 
         player.injury_status === 'Doubtful' ? 'D' : 
         player.injury_status === 'Out' ? 'O' : 
         player.injury_status}
      </span>
    );

    return (
      <div className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors">
        <div className="flex items-center gap-3 min-w-0">
          <span className={`px-2 py-0.5 rounded text-xs font-bold border ${posClass}`}>
            {player.position}
          </span>
          <span className="font-medium text-slate-900 dark:text-white truncate">{player.full_name}</span>
          {player.team && (
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">{player.team}</span>
          )}
          {injuryBadge}
        </div>
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
          {value > 0 ? value.toLocaleString() : '—'}
        </span>
      </div>
    );
  };

  // Sort rosters by total value
  const sortedRosters = useMemo(() => {
    if (!rosters) return [];
    return [...rosters].sort((a, b) => {
      const aTotal = rosterValues.get(a.roster_id)?.total || 0;
      const bTotal = rosterValues.get(b.roster_id)?.total || 0;
      return bTotal - aTotal;
    });
  }, [rosters, rosterValues]);

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <Loader2 className="h-8 w-8 sm:h-10 sm:w-10 animate-spin text-accent-500 mx-auto" />
            <p className="mt-4 text-slate-500 dark:text-slate-400 text-xs sm:text-sm">Loading rosters...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!rosters?.length) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-12 h-12 sm:w-16 sm:h-16 bg-slate-100 dark:bg-zinc-800 rounded-2xl flex items-center justify-center mb-4">
            <Users className="h-6 w-6 sm:h-8 sm:w-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">No Rosters Yet</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mb-6">
            Connect your league to see team rosters and dynasty asset values
          </p>
          <Link
            to="/setup"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-accent-600 text-white text-sm font-medium rounded-lg hover:bg-accent-700 transition-colors"
          >
            Connect League
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-4 sm:mb-6">
        <div className="flex items-center gap-2 sm:gap-3">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">Rosters</h1>
          <span className="px-2.5 py-1 bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-400 text-sm font-medium rounded-full">
            {rosters.length} Teams
          </span>
        </div>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
          View team rosters, position strengths, and dynasty asset values
        </p>
      </div>

      {/* Teams List - Single Column */}
      <div className="mt-6">
        {sortedRosters.map((roster, index) => {
          const rosterValue = rosterValues.get(roster.roster_id);
          const totalValue = rosterValue?.total || 0;
          const groupedPlayers = getGroupedPlayers(roster.players);
          const groupedPicks = getGroupedPicks(roster.roster_id);
          const isExpanded = expandedRoster === roster.id;

          return (
            <div
              key={roster.id}
              className="mb-4 bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 shadow-sm dark:shadow-none overflow-hidden"
            >
              {/* Team Header - Always Visible */}
              <button
                className="w-full p-3 sm:p-5 text-left hover:bg-slate-50/50 dark:hover:bg-zinc-800/30 transition-colors"
                onClick={() => setExpandedRoster(isExpanded ? null : roster.id)}
              >
                <div className="flex items-start justify-between gap-2 sm:gap-4">
                  {/* Left Side: Team Info */}
                  <div className="flex items-center gap-2 sm:gap-4 min-w-0">
                    {/* Rank Badge */}
                    <div className={`flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl flex items-center justify-center text-sm sm:text-lg font-bold ${
                      index === 0 ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400' :
                      index === 1 ? 'bg-slate-200 dark:bg-slate-500/20 text-slate-700 dark:text-slate-400' :
                      index === 2 ? 'bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-400' :
                      'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-400'
                    }`}>
                      {index + 1}
                    </div>
                    
                    <div className="min-w-0">
                      <h3 className="text-sm sm:text-lg font-bold text-slate-900 dark:text-white truncate">
                        {roster.teamName}
                      </h3>
                      <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 hidden sm:block">
                        Owner: {roster.ownerName}
                      </p>
                    </div>
                  </div>

                  {/* Right Side: Total Value */}
                  <div className="flex items-center gap-2 sm:gap-4">
                    <div className="text-right">
                      <div className="flex items-center gap-1 sm:gap-1.5 justify-end">
                        <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4 text-emerald-500" />
                        <span className="text-base sm:text-xl font-bold text-slate-900 dark:text-white tabular-nums">
                          {totalValue.toLocaleString()}
                        </span>
                      </div>
                      <span className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 font-medium">Total Value</span>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 sm:h-5 sm:w-5 text-slate-400 dark:text-slate-500 flex-shrink-0" />
                    ) : (
                      <ChevronDown className="h-4 w-4 sm:h-5 sm:w-5 text-slate-400 dark:text-slate-500 flex-shrink-0" />
                    )}
                  </div>
                </div>

                {/* Position Grades Bar - Always Visible */}
                <div className="mt-3 sm:mt-5">
                  <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                    <span className="text-[10px] sm:text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                      Position Rankings
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 sm:gap-2">
                    {(['QB', 'RB', 'WR', 'TE', 'PICKS'] as const).map((pos) => {
                      const rank = positionRankings.get(roster.roster_id)?.[pos] || 0;
                      const posValue = pos === 'PICKS' ? rosterValue?.PICKS : rosterValue?.[pos];
                      return (
                        <div
                          key={pos}
                          className={`flex items-center gap-1 sm:gap-2 px-1.5 sm:px-3 py-1 sm:py-2 rounded-md sm:rounded-lg text-xs sm:text-sm font-medium ${getRankColorClass(rank)}`}
                        >
                          <span className="font-bold">{pos === 'PICKS' ? 'Pck' : pos}</span>
                          <span className="text-[10px] sm:text-xs opacity-75">#{rank}</span>
                          <span className="text-[10px] sm:text-xs opacity-60 tabular-nums hidden sm:inline">
                            ({(posValue || 0).toLocaleString()})
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </button>

              {/* Expanded Content */}
              {isExpanded && (
                <div className="border-t border-slate-100 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-800/30">
                  <div className="p-5 space-y-5">
                    {/* Players Section */}
                    <div>
                      <div className="mb-4">
                        <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Players</h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {roster.playerCount} players on roster
                        </p>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* Quarterbacks */}
                        {groupedPlayers.QB.length > 0 && (
                          <div className="bg-white dark:bg-zinc-900 rounded-lg border border-slate-200 dark:border-zinc-700 overflow-hidden">
                            <div className="px-4 py-2 bg-red-50 dark:bg-red-500/10 border-b border-red-100 dark:border-red-500/20">
                              <h5 className="text-sm font-bold text-red-700 dark:text-red-400">Quarterbacks</h5>
                            </div>
                            <div className="divide-y divide-slate-100 dark:divide-zinc-800">
                              {groupedPlayers.QB.map(({ player, value }) => (
                                <PlayerRow key={player.player_id} player={player} value={value} />
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Running Backs */}
                        {groupedPlayers.RB.length > 0 && (
                          <div className="bg-white dark:bg-zinc-900 rounded-lg border border-slate-200 dark:border-zinc-700 overflow-hidden">
                            <div className="px-4 py-2 bg-emerald-50 dark:bg-emerald-500/10 border-b border-emerald-100 dark:border-emerald-500/20">
                              <h5 className="text-sm font-bold text-emerald-700 dark:text-emerald-400">Running Backs</h5>
                            </div>
                            <div className="divide-y divide-slate-100 dark:divide-zinc-800">
                              {groupedPlayers.RB.map(({ player, value }) => (
                                <PlayerRow key={player.player_id} player={player} value={value} />
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Wide Receivers */}
                        {groupedPlayers.WR.length > 0 && (
                          <div className="bg-white dark:bg-zinc-900 rounded-lg border border-slate-200 dark:border-zinc-700 overflow-hidden">
                            <div className="px-4 py-2 bg-blue-50 dark:bg-blue-500/10 border-b border-blue-100 dark:border-blue-500/20">
                              <h5 className="text-sm font-bold text-blue-700 dark:text-blue-400">Wide Receivers</h5>
                            </div>
                            <div className="divide-y divide-slate-100 dark:divide-zinc-800">
                              {groupedPlayers.WR.map(({ player, value }) => (
                                <PlayerRow key={player.player_id} player={player} value={value} />
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Tight Ends */}
                        {groupedPlayers.TE.length > 0 && (
                          <div className="bg-white dark:bg-zinc-900 rounded-lg border border-slate-200 dark:border-zinc-700 overflow-hidden">
                            <div className="px-4 py-2 bg-orange-50 dark:bg-orange-500/10 border-b border-orange-100 dark:border-orange-500/20">
                              <h5 className="text-sm font-bold text-orange-700 dark:text-orange-400">Tight Ends</h5>
                            </div>
                            <div className="divide-y divide-slate-100 dark:divide-zinc-800">
                              {groupedPlayers.TE.map(({ player, value }) => (
                                <PlayerRow key={player.player_id} player={player} value={value} />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Draft Picks Section */}
                    {Object.keys(groupedPicks).length > 0 && (
                      <div>
                        <div className="mb-4">
                          <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Draft Picks</h4>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            Future draft capital by year
                          </p>
                        </div>

                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                          {Object.entries(groupedPicks).map(([year, picks]) => (
                            <div 
                              key={year}
                              className="bg-white dark:bg-zinc-900 rounded-lg border border-slate-200 dark:border-zinc-700 overflow-hidden"
                            >
                              <div className="px-4 py-2 bg-purple-50 dark:bg-purple-500/10 border-b border-purple-100 dark:border-purple-500/20">
                                <h5 className="text-sm font-bold text-purple-700 dark:text-purple-400">{year}</h5>
                              </div>
                              <div className="p-3 space-y-2">
                                {picks.map((pick, idx) => (
                                  <div key={idx} className="flex items-center justify-between text-sm">
                                    <span className="text-slate-700 dark:text-slate-300">
                                      <span className="font-medium">{pick.tier}</span>
                                      <span className="text-slate-500 dark:text-slate-400"> Rd {pick.round}</span>
                                    </span>
                                    <span className="font-semibold text-slate-600 dark:text-slate-400 tabular-nums">
                                      {pick.value.toLocaleString()}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Quick Stats Footer */}
                    <div className="flex items-center gap-6 pt-4 border-t border-slate-200 dark:border-zinc-700 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500 dark:text-slate-400">Record:</span>
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {roster.wins || 0}-{roster.losses || 0}{roster.ties ? `-${roster.ties}` : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500 dark:text-slate-400">Points:</span>
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {(roster.fpts || 0).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500 dark:text-slate-400">Starters:</span>
                        <span className="font-semibold text-slate-900 dark:text-white">{roster.starterCount}</span>
                      </div>
                      {roster.reserve?.length > 0 && (
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500 dark:text-slate-400">IR:</span>
                          <span className="font-semibold text-slate-900 dark:text-white">{roster.reserve.length}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Ranking Calculation Explanation */}
      <div className="mt-8 bg-slate-50 dark:bg-zinc-900 rounded-xl p-5 border border-slate-200 dark:border-zinc-800">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 bg-accent-100 dark:bg-accent-500/20 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
            <TrendingUp className="h-4 w-4 text-accent-600 dark:text-accent-400" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white mb-2">How Rankings Are Calculated</h3>
            <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1.5">
              <li>• <strong>Total Value:</strong> Sum of all player dynasty values + draft pick values from KeepTradeCut (KTC)</li>
              <li>• <strong>Position Rankings:</strong> Teams are ranked 1-{sortedRosters.length} at each position based on total KTC value at that position</li>
              <li>• <strong>Player Values:</strong> Sourced from KeepTradeCut Superflex + TEP (Tight End Premium) + Half PPR dynasty rankings, updated daily</li>
              <li>• <strong>Draft Pick Values:</strong> Based on pick round and projected position (Early/Mid/Late) derived from current standings</li>
              <li>• <strong>Overall Rank:</strong> Teams are sorted by Total Value (players + picks combined)</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
