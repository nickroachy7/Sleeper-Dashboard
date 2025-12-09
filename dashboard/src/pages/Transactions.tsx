import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { 
  ArrowRightLeft, 
  Loader2, 
  UserPlus, 
  UserMinus, 
  RefreshCw,
  Clock,
  ArrowLeftRight,
  TrendingUp,
  TrendingDown,
  Minus,
  Filter,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useMemo } from 'react';

interface Player {
  player_id: string;
  full_name: string;
  position: string;
  team: string | null;
}

interface PlayerValue {
  player_id: string;
  value: number;
}

interface LeagueUser {
  user_id: string;
  team_name: string | null;
  display_name: string | null;
}

const positionColors: Record<string, string> = {
  QB: 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400',
  RB: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400',
  WR: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400',
  TE: 'bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-400',
};

const ITEMS_PER_PAGE = 50;

export default function Transactions() {
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('recent');
  const [currentPage, setCurrentPage] = useState(1);
  const { data: players } = useQuery({
    queryKey: ['players'],
    queryFn: async () => {
      const { data } = await supabase.from('players').select('*');
      const playerMap = new Map<string, Player>();
      (data as Player[] || []).forEach(p => playerMap.set(p.player_id, p));
      return playerMap;
    },
  });

  const { data: playerValues } = useQuery({
    queryKey: ['playerValuesMap'],
    queryFn: async () => {
      const { data } = await supabase.from('player_values').select('player_id, value');
      const valueMap = new Map<string, number>();
      (data as PlayerValue[] || []).forEach(pv => valueMap.set(pv.player_id, pv.value));
      return valueMap;
    },
  });

  // Fetch roster_id to draft_slot mapping from the startup draft (earliest draft)
  // In dynasty leagues, each roster is assigned a permanent draft slot from the startup draft
  const { data: rosterToDraftSlot } = useQuery({
    queryKey: ['roster-draft-slot-mapping'],
    queryFn: async () => {
      // Get the earliest draft (startup draft) to determine roster -> draft_slot mapping
      const { data: drafts } = await supabase
        .from('drafts')
        .select('draft_id, season')
        .order('season', { ascending: true })
        .limit(1);
      
      if (!drafts?.length) return new Map<number, number>();
      
      const startupDraftId = drafts[0].draft_id;
      
      // Get round 1 picks from startup draft to map roster_id -> draft_slot
      const { data: startupPicks } = await supabase
        .from('draft_picks')
        .select('roster_id, draft_slot')
        .eq('draft_id', startupDraftId)
        .eq('round', 1);
      
      const mapping = new Map<number, number>();
      (startupPicks as any[])?.forEach((pick: any) => {
        mapping.set(pick.roster_id, pick.draft_slot);
      });
      return mapping;
    },
  });

  // Fetch draft picks with player info to show what was picked
  const { data: draftPickResults } = useQuery({
    queryKey: ['draft-pick-results'],
    queryFn: async () => {
      const { data } = await supabase
        .from('draft_picks')
        .select(`
          draft_slot,
          round,
          player_id,
          drafts!inner(season)
        `)
        .not('player_id', 'is', null);
      
      // Create a map: "season-round-draft_slot" -> player_id
      const pickMap = new Map<string, string>();
      (data as any[])?.forEach((pick: any) => {
        const key = `${pick.drafts.season}-${pick.round}-${pick.draft_slot}`;
        pickMap.set(key, pick.player_id);
      });
      return pickMap;
    },
  });

  const { data: transactions, isLoading } = useQuery({
    queryKey: ['transactions'],
    queryFn: async () => {
      // Fetch all transactions - need to paginate since Supabase has 1000 row default limit
      let allTransactions: any[] = [];
      let from = 0;
      const pageSize = 1000;
      
      while (true) {
        const { data, error } = await supabase
          .from('transactions')
          .select('*')
          .range(from, from + pageSize - 1)
          .order('created', { ascending: false, nullsFirst: false });
        
        if (error || !data || data.length === 0) break;
        allTransactions = [...allTransactions, ...data];
        if (data.length < pageSize) break;
        from += pageSize;
      }
      
      const data = allTransactions;

      const { data: users } = await supabase.from('users').select('*');
      const { data: rosters } = await supabase.from('rosters').select('*');
      const { data: leagueUsers } = await supabase.from('league_users').select('user_id, team_name, display_name');

      if (!data?.length) return [];

      // Build a roster_id to owner mapping from current league rosters
      const rosterToOwner = new Map<number, string>();
      (rosters as any[])?.forEach((r: any) => {
        rosterToOwner.set(r.roster_id, r.owner_id);
      });

      return (data as any[]).map((tx: any) => {
        const rosterOwners = tx.roster_ids?.map((rosterId: number) => {
          // Use roster mapping - roster IDs are consistent across league years
          const ownerId = rosterToOwner.get(rosterId);
          const owner = (users as any[])?.find((u: any) => u.user_id === ownerId);
          const leagueUser = (leagueUsers as LeagueUser[])?.find((lu: LeagueUser) => lu.user_id === ownerId);
          return {
            rosterId,
            teamName: leagueUser?.team_name || leagueUser?.display_name || owner?.display_name || `Team ${rosterId}`,
            ownerName: owner?.display_name || owner?.username || 'Unknown'
          };
        }) || [];

        return { ...tx, teams: rosterOwners };
      }).sort((a: any, b: any) => {
        // Sort by created (Unix ms), fallback to status_updated, fallback to created_at
        const getTimestamp = (tx: any): number => {
          if (tx.created) return tx.created;
          if (tx.status_updated) return tx.status_updated;
          if (tx.created_at) return new Date(tx.created_at).getTime();
          return 0;
        };
        return getTimestamp(b) - getTimestamp(a); // Most recent first
      });
    },
  });

  const getPlayer = (playerId: string): Player | undefined => {
    return players?.get(playerId);
  };

  const getPlayerValue = (playerId: string): number => {
    return playerValues?.get(playerId) || 0;
  };

  // Get the player picked with a traded draft pick (if draft already happened)
  const getPickResult = (pick: any): { playerId: string; player: Player | undefined } | null => {
    if (!draftPickResults || !rosterToDraftSlot) return null;
    
    // The pick's roster_id represents "this roster's pick" - we need to map it to the actual draft_slot
    // In dynasty leagues, roster_id doesn't equal draft_slot - we use the startup draft mapping
    const draftSlot = rosterToDraftSlot.get(pick.roster_id);
    if (!draftSlot) return null;
    
    const key = `${pick.season}-${pick.round}-${draftSlot}`;
    const playerId = draftPickResults.get(key);
    if (!playerId) return null;
    return { playerId, player: getPlayer(playerId) };
  };

  // Filter and sort transactions
  const filteredAndSortedTransactions = useMemo(() => {
    if (!transactions) return [];
    
    // Helper to calculate transaction value metrics for sorting
    const getTransactionValueMetrics = (tx: any): { totalValue: number; valueDiff: number; maxTeamGain: number } => {
      if (tx.type === 'trade') {
        // For trades, calculate value for each team involved
        const teamValues: Record<number, { received: number; gave: number }> = {};
        
        // Players received by each team (adds shows player_id -> receiving_roster_id)
        if (tx.adds) {
          Object.entries(tx.adds).forEach(([playerId, rosterId]) => {
            const rId = rosterId as number;
            if (!teamValues[rId]) teamValues[rId] = { received: 0, gave: 0 };
            teamValues[rId].received += playerValues?.get(playerId) || 0;
          });
        }
        
        // Players given up by each team (drops shows player_id -> giving_roster_id)
        if (tx.drops) {
          Object.entries(tx.drops).forEach(([playerId, rosterId]) => {
            const rId = rosterId as number;
            if (!teamValues[rId]) teamValues[rId] = { received: 0, gave: 0 };
            teamValues[rId].gave += playerValues?.get(playerId) || 0;
          });
        }
        
        // Draft picks - owner_id receives the pick, previous_owner_id gives it
        if (tx.draft_picks && Array.isArray(tx.draft_picks)) {
          tx.draft_picks.forEach((pick: any) => {
            const pickValue = pick.round === 1 ? 5000 : pick.round === 2 ? 2000 : pick.round === 3 ? 800 : 400;
            if (pick.owner_id) {
              if (!teamValues[pick.owner_id]) teamValues[pick.owner_id] = { received: 0, gave: 0 };
              teamValues[pick.owner_id].received += pickValue;
            }
            if (pick.previous_owner_id) {
              if (!teamValues[pick.previous_owner_id]) teamValues[pick.previous_owner_id] = { received: 0, gave: 0 };
              teamValues[pick.previous_owner_id].gave += pickValue;
            }
          });
        }
        
        // Calculate total value in trade and the biggest winner's margin
        let totalValue = 0;
        let maxGain = -Infinity;
        let maxLoss = Infinity;
        
        Object.values(teamValues).forEach(team => {
          totalValue += team.received;
          const netGain = team.received - team.gave;
          if (netGain > maxGain) maxGain = netGain;
          if (netGain < maxLoss) maxLoss = netGain;
        });
        
        // valueDiff is the spread between winner and loser (how lopsided the trade is)
        const valueDiff = maxGain - maxLoss;
        
        return {
          totalValue,
          valueDiff,
          maxTeamGain: maxGain === -Infinity ? 0 : maxGain
        };
      } else {
        // For waivers/free agents, calculate net value change
        const adds = tx.adds ? Object.keys(tx.adds) : [];
        const drops = tx.drops ? Object.keys(tx.drops) : [];
        
        const addedValue = adds.reduce((sum: number, playerId: string) => sum + (playerValues?.get(playerId) || 0), 0);
        const droppedValue = drops.reduce((sum: number, playerId: string) => sum + (playerValues?.get(playerId) || 0), 0);
        
        return {
          totalValue: addedValue + droppedValue,
          valueDiff: Math.abs(addedValue - droppedValue),
          maxTeamGain: addedValue - droppedValue
        };
      }
    };
    
    let filtered = typeFilter === 'all' 
      ? transactions 
      : transactions.filter((tx: any) => tx.type === typeFilter);
    
    // Apply sorting
    if (sortBy === 'recent') {
      // Already sorted by date from the query
      return filtered;
    }
    
    return [...filtered].sort((a: any, b: any) => {
      const metricsA = getTransactionValueMetrics(a);
      const metricsB = getTransactionValueMetrics(b);
      
      switch (sortBy) {
        case 'value-high':
          // Sort by total value involved in the transaction
          return metricsB.totalValue - metricsA.totalValue;
        case 'value-low':
          return metricsA.totalValue - metricsB.totalValue;
        case 'best-moves':
          // Sort by most lopsided trades (biggest value difference)
          return metricsB.valueDiff - metricsA.valueDiff;
        case 'worst-moves':
          // Sort by least value difference (most even trades first)
          return metricsA.valueDiff - metricsB.valueDiff;
        default:
          return 0;
      }
    });
  }, [transactions, typeFilter, sortBy, playerValues]);

  // Paginate filtered transactions
  const totalPages = Math.ceil(filteredAndSortedTransactions.length / ITEMS_PER_PAGE);
  const paginatedTransactions = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredAndSortedTransactions.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredAndSortedTransactions, currentPage]);

  // Reset to page 1 when filter or sort changes
  const handleFilterChange = (newFilter: string) => {
    setTypeFilter(newFilter);
    setCurrentPage(1);
  };

  const handleSortChange = (newSort: string) => {
    setSortBy(newSort);
    setCurrentPage(1);
  };

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <Loader2 className="h-8 w-8 sm:h-10 sm:w-10 animate-spin text-accent-500 mx-auto" />
            <p className="mt-4 text-slate-500 dark:text-slate-400 text-xs sm:text-sm">Loading transactions...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!transactions?.length) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-12 h-12 sm:w-16 sm:h-16 bg-slate-100 dark:bg-zinc-800 rounded-2xl flex items-center justify-center mb-4">
            <ArrowRightLeft className="h-6 w-6 sm:h-8 sm:w-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">No Transactions</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mb-6">
            Connect your league to see trades, waivers, and roster moves
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

  const getTypeStyles = (type: string) => {
    switch (type) {
      case 'trade':
        return { bg: 'bg-purple-100 dark:bg-purple-500/20', text: 'text-purple-600 dark:text-purple-400', icon: ArrowRightLeft };
      case 'waiver':
        return { bg: 'bg-amber-100 dark:bg-amber-500/20', text: 'text-amber-600 dark:text-amber-400', icon: RefreshCw };
      case 'free_agent':
        return { bg: 'bg-emerald-100 dark:bg-emerald-500/20', text: 'text-emerald-600 dark:text-emerald-400', icon: UserPlus };
      default:
        return { bg: 'bg-slate-100 dark:bg-zinc-800', text: 'text-slate-600 dark:text-slate-400', icon: ArrowRightLeft };
    }
  };

  const formatDate = (tx: any) => {
    // Use created (Unix ms timestamp) if available, otherwise fall back to created_at
    const timestamp = tx.created || tx.status_updated;
    const date = timestamp ? new Date(timestamp) : new Date(tx.created_at);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Group by type for stats
  const typeCounts = transactions.reduce((acc: any, tx: any) => {
    acc[tx.type] = (acc[tx.type] || 0) + 1;
    return acc;
  }, {});

  // Helper to get assets for each team in a trade
  const getTradeAssets = (tx: any) => {
    const teamAssets: Record<number, { players: string[]; picks: any[]; value: number }> = {};
    
    // Initialize for each team
    tx.teams?.forEach((team: any) => {
      teamAssets[team.rosterId] = { players: [], picks: [], value: 0 };
    });

    // Adds are players received by a team
    if (tx.adds) {
      Object.entries(tx.adds).forEach(([playerId, rosterId]) => {
        if (teamAssets[rosterId as number]) {
          teamAssets[rosterId as number].players.push(playerId);
          teamAssets[rosterId as number].value += getPlayerValue(playerId);
        }
      });
    }

    // Draft picks
    if (tx.draft_picks && Array.isArray(tx.draft_picks)) {
      tx.draft_picks.forEach((pick: any) => {
        if (pick.owner_id && teamAssets[pick.owner_id]) {
          teamAssets[pick.owner_id].picks.push(pick);
          // Estimate pick value (this is simplified - should use pick_values table)
          const pickBaseValue = pick.round === 1 ? 5000 : pick.round === 2 ? 2000 : pick.round === 3 ? 800 : 400;
          teamAssets[pick.owner_id].value += pickBaseValue;
        }
      });
    }

    return teamAssets;
  };

  // Component for trade card
  const TradeCard = ({ tx }: { tx: any }) => {
    const teamAssets = getTradeAssets(tx);
    const teams = tx.teams || [];
    
    if (teams.length < 2) return null;

    const team1 = teams[0];
    const team2 = teams[1];
    const team1Assets = teamAssets[team1?.rosterId] || { players: [], picks: [], value: 0 };
    const team2Assets = teamAssets[team2?.rosterId] || { players: [], picks: [], value: 0 };
    const valueDiff = team1Assets.value - team2Assets.value;

    return (
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 shadow-sm dark:shadow-none overflow-hidden">
        {/* Trade Header */}
        <div className="px-3 sm:px-6 py-3 sm:py-4 border-b border-slate-100 dark:border-zinc-800 bg-purple-50/50 dark:bg-purple-500/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 bg-purple-100 dark:bg-purple-500/20 rounded-lg">
                <ArrowRightLeft className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <h3 className="font-semibold text-sm sm:text-base text-slate-900 dark:text-white">Trade</h3>
                <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <Clock className="h-3 w-3" />
                  {formatDate(tx)}
                </div>
              </div>
            </div>
            <span className={`px-2 py-1 rounded-md text-xs font-medium ${
              tx.status === 'complete'
                ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                : 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400'
            }`}>
              {tx.status}
            </span>
          </div>
        </div>

        {/* Trade Content - Side by Side */}
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-100 dark:divide-zinc-800">
          {/* Team 1 Receives */}
          <div className="p-3 sm:p-5 flex flex-col">
            <div className="mb-2 sm:mb-4">
              <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">{team1?.teamName || 'Team 1'}</h4>
              <span className="text-[10px] sm:text-xs text-emerald-600 dark:text-emerald-400 font-medium">RECEIVES</span>
            </div>
            <div className="space-y-1.5 sm:space-y-2 flex-1">
              {team1Assets.players.map((playerId) => {
                const player = getPlayer(playerId);
                const value = getPlayerValue(playerId);
                const posClass = positionColors[player?.position || ''] || 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-400';
                return (
                  <div key={playerId} className="flex items-center justify-between py-1.5 sm:py-2 px-2 sm:px-3 bg-slate-50 dark:bg-zinc-800/50 rounded-lg">
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      {player?.position && (
                        <span className={`px-1 sm:px-1.5 py-0.5 rounded text-[10px] sm:text-xs font-bold ${posClass}`}>
                          {player.position}
                        </span>
                      )}
                      <span className="font-medium text-slate-900 dark:text-white text-xs sm:text-sm">
                        {player?.full_name || playerId}
                      </span>
                      {player?.team && (
                        <span className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 hidden sm:inline">{player.team}</span>
                      )}
                    </div>
                    <span className="text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-400 tabular-nums">
                      {value > 0 ? value.toLocaleString() : '—'}
                    </span>
                  </div>
                );
              })}
              {team1Assets.picks.map((pick, idx) => {
                const pickResult = getPickResult(pick);
                return (
                  <div key={idx} className="flex items-center justify-between py-2 px-3 bg-purple-50 dark:bg-purple-500/10 rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400">
                        PICK
                      </span>
                      <div className="flex flex-col">
                        <span className="font-medium text-slate-900 dark:text-white text-sm">
                          {pick.season} Round {pick.round}
                        </span>
                        {pickResult && (
                          <span className="text-xs text-purple-600 dark:text-purple-400">
                            → {pickResult.player?.full_name || pickResult.playerId}
                          </span>
                        )}
                      </div>
                    </div>
                    {pickResult && (
                      <span className="text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-400 tabular-nums">
                        {getPlayerValue(pickResult.playerId) > 0 ? getPlayerValue(pickResult.playerId).toLocaleString() : '—'}
                      </span>
                    )}
                  </div>
                );
              })}
              {team1Assets.players.length === 0 && team1Assets.picks.length === 0 && (
                <p className="text-sm text-slate-400 dark:text-slate-500 italic">No assets received</p>
              )}
            </div>
            <div className="mt-auto pt-3 border-t border-slate-100 dark:border-zinc-800">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Total Value</span>
                <span className="text-lg font-bold text-slate-900 dark:text-white tabular-nums">
                  {team1Assets.value.toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* Swap Icon (hidden on mobile) */}
          <div className="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
            <div className="w-10 h-10 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-full flex items-center justify-center shadow-sm">
              <ArrowLeftRight className="w-5 h-5 text-slate-400 dark:text-slate-500" />
            </div>
          </div>

          {/* Team 2 Receives */}
          <div className="p-3 sm:p-5 flex flex-col">
            <div className="mb-2 sm:mb-4">
              <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">{team2?.teamName || 'Team 2'}</h4>
              <span className="text-[10px] sm:text-xs text-emerald-600 dark:text-emerald-400 font-medium">RECEIVES</span>
            </div>
            <div className="space-y-1.5 sm:space-y-2 flex-1">
              {team2Assets.players.map((playerId) => {
                const player = getPlayer(playerId);
                const value = getPlayerValue(playerId);
                const posClass = positionColors[player?.position || ''] || 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-400';
                return (
                  <div key={playerId} className="flex items-center justify-between py-2 px-3 bg-slate-50 dark:bg-zinc-800/50 rounded-lg">
                    <div className="flex items-center gap-2">
                      {player?.position && (
                        <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${posClass}`}>
                          {player.position}
                        </span>
                      )}
                      <span className="font-medium text-slate-900 dark:text-white text-sm">
                        {player?.full_name || playerId}
                      </span>
                      {player?.team && (
                        <span className="text-xs text-slate-500 dark:text-slate-400">{player.team}</span>
                      )}
                    </div>
                    <span className="text-sm font-semibold text-slate-600 dark:text-slate-400 tabular-nums">
                      {value > 0 ? value.toLocaleString() : '—'}
                    </span>
                  </div>
                );
              })}
              {team2Assets.picks.map((pick, idx) => {
                const pickResult = getPickResult(pick);
                return (
                  <div key={idx} className="flex items-center justify-between py-2 px-3 bg-purple-50 dark:bg-purple-500/10 rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400">
                        PICK
                      </span>
                      <div className="flex flex-col">
                        <span className="font-medium text-slate-900 dark:text-white text-sm">
                          {pick.season} Round {pick.round}
                        </span>
                        {pickResult && (
                          <span className="text-xs text-purple-600 dark:text-purple-400">
                            → {pickResult.player?.full_name || pickResult.playerId}
                          </span>
                        )}
                      </div>
                    </div>
                    {pickResult && (
                      <span className="text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-400 tabular-nums">
                        {getPlayerValue(pickResult.playerId) > 0 ? getPlayerValue(pickResult.playerId).toLocaleString() : '—'}
                      </span>
                    )}
                  </div>
                );
              })}
              {team2Assets.players.length === 0 && team2Assets.picks.length === 0 && (
                <p className="text-sm text-slate-400 dark:text-slate-500 italic">No assets received</p>
              )}
            </div>
            <div className="mt-auto pt-3 border-t border-slate-100 dark:border-zinc-800">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Total Value</span>
                <span className="text-lg font-bold text-slate-900 dark:text-white tabular-nums">
                  {team2Assets.value.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Trade Analysis Footer */}
        {(team1Assets.value > 0 || team2Assets.value > 0) && (
          <div className="px-3 sm:px-6 py-3 sm:py-4 bg-slate-50 dark:bg-zinc-800/50 border-t border-slate-100 dark:border-zinc-800">
            <div className="flex items-center justify-center gap-2 sm:gap-3">
              {valueDiff > 500 ? (
                <>
                  <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500" />
                  <span className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300">
                    {team1?.teamName} wins by <span className="font-bold text-emerald-600 dark:text-emerald-400">+{Math.abs(valueDiff).toLocaleString()}</span>
                  </span>
                </>
              ) : valueDiff < -500 ? (
                <>
                  <TrendingUp className="w-4 h-4 text-emerald-500" />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    {team2?.teamName} wins by <span className="font-bold text-emerald-600 dark:text-emerald-400">+{Math.abs(valueDiff).toLocaleString()}</span>
                  </span>
                </>
              ) : (
                <>
                  <Minus className="w-4 h-4 text-slate-400" />
                  <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Even trade</span>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Component for waiver/free agent card
  const RosterMoveCard = ({ tx }: { tx: any }) => {
    const styles = getTypeStyles(tx.type);
    const Icon = styles.icon;
    const team = tx.teams?.[0];
    const adds = tx.adds ? Object.keys(tx.adds) : [];
    const drops = tx.drops ? Object.keys(tx.drops) : [];
    
    // Calculate total value change
    const addedValue = adds.reduce((sum, playerId) => sum + getPlayerValue(playerId), 0);
    const droppedValue = drops.reduce((sum, playerId) => sum + getPlayerValue(playerId), 0);
    const netValue = addedValue - droppedValue;

    return (
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 shadow-sm dark:shadow-none overflow-hidden">
        {/* Header */}
        <div className="px-3 sm:px-6 py-3 sm:py-4 border-b border-slate-100 dark:border-zinc-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className={`p-1.5 sm:p-2 rounded-lg ${styles.bg}`}>
                <Icon className={`h-4 w-4 sm:h-5 sm:w-5 ${styles.text}`} />
              </div>
              <div>
                <h3 className="font-semibold text-sm sm:text-base text-slate-900 dark:text-white capitalize">
                  {tx.type.replace('_', ' ')}
                </h3>
                <div className="flex items-center gap-1.5 text-[10px] sm:text-xs text-slate-500 dark:text-slate-400">
                  <Clock className="h-3 w-3" />
                  {formatDate(tx)}
                </div>
              </div>
            </div>
            <span className={`px-2 py-1 rounded-md text-xs font-medium ${
              tx.status === 'complete'
                ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                : 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400'
            }`}>
              {tx.status}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="p-3 sm:p-6">
          <div className="mb-2 sm:mb-4">
            <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">{team?.teamName || 'Unknown Team'}</h4>
          </div>

          <div className="space-y-2 sm:space-y-3">
            {/* Added players */}
            {adds.map((playerId) => {
              const player = getPlayer(playerId);
              const value = getPlayerValue(playerId);
              const posClass = positionColors[player?.position || ''] || 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-400';
              return (
                <div key={playerId} className="flex items-center justify-between py-2 sm:py-2.5 px-2 sm:px-3 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 rounded-lg">
                  <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
                    <div className="flex-shrink-0 p-0.5 sm:p-1 bg-emerald-100 dark:bg-emerald-500/20 rounded">
                      <UserPlus className="h-3 w-3 sm:h-4 sm:w-4 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <span className="text-[10px] sm:text-xs font-bold text-emerald-700 dark:text-emerald-400">ADD</span>
                    {player?.position && (
                      <span className={`px-1 sm:px-1.5 py-0.5 rounded text-[10px] sm:text-xs font-bold ${posClass}`}>
                        {player.position}
                      </span>
                    )}
                    <span className="font-medium text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                      {player?.full_name || playerId}
                    </span>
                    {player?.team && (
                      <span className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 hidden sm:inline">{player.team}</span>
                    )}
                  </div>
                  <span className="text-xs sm:text-sm font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums flex-shrink-0 ml-2">
                    {value > 0 ? `+${value.toLocaleString()}` : '—'}
                  </span>
                </div>
              );
            })}

            {/* Dropped players */}
            {drops.map((playerId) => {
              const player = getPlayer(playerId);
              const value = getPlayerValue(playerId);
              const posClass = positionColors[player?.position || ''] || 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-400';
              return (
                <div key={playerId} className="flex items-center justify-between py-2 sm:py-2.5 px-2 sm:px-3 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-lg">
                  <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
                    <div className="flex-shrink-0 p-0.5 sm:p-1 bg-red-100 dark:bg-red-500/20 rounded">
                      <UserMinus className="h-3 w-3 sm:h-4 sm:w-4 text-red-600 dark:text-red-400" />
                    </div>
                    <span className="text-[10px] sm:text-xs font-bold text-red-700 dark:text-red-400">DROP</span>
                    {player?.position && (
                      <span className={`px-1 sm:px-1.5 py-0.5 rounded text-[10px] sm:text-xs font-bold ${posClass}`}>
                        {player.position}
                      </span>
                    )}
                    <span className="font-medium text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                      {player?.full_name || playerId}
                    </span>
                    {player?.team && (
                      <span className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 hidden sm:inline">{player.team}</span>
                    )}
                  </div>
                  <span className="text-xs sm:text-sm font-semibold text-red-600 dark:text-red-400 tabular-nums flex-shrink-0 ml-2">
                    {value > 0 ? `-${value.toLocaleString()}` : '—'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Net Value Footer */}
        {(addedValue > 0 || droppedValue > 0) && (
          <div className="px-3 sm:px-6 py-3 sm:py-4 bg-slate-50 dark:bg-zinc-800/50 border-t border-slate-100 dark:border-zinc-800">
            <div className="flex items-center justify-center gap-2 sm:gap-3">
              {netValue > 0 ? (
                <>
                  <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500" />
                  <span className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300">
                    Net value: <span className="font-bold text-emerald-600 dark:text-emerald-400">+{netValue.toLocaleString()}</span>
                  </span>
                </>
              ) : netValue < 0 ? (
                <>
                  <TrendingDown className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-500" />
                  <span className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300">
                    Net value: <span className="font-bold text-red-600 dark:text-red-400">{netValue.toLocaleString()}</span>
                  </span>
                </>
              ) : (
                <>
                  <Minus className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400" />
                  <span className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400">Even swap</span>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-4 sm:mb-6">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 sm:gap-3">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">Transactions</h1>
            <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-400 text-xs sm:text-sm font-medium rounded-full">
              {transactions.length} Total
            </span>
          </div>
          
          {/* Filter & Sort Dropdowns */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-1.5">
              <Filter className="h-4 w-4 text-slate-400 flex-shrink-0" />
              <select
                value={typeFilter}
                onChange={(e) => handleFilterChange(e.target.value)}
                className="px-2 sm:px-3 py-1.5 sm:py-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-500 dark:focus:ring-accent-400 dark:text-white"
              >
                <option value="all">All Types</option>
                <option value="trade">Trades</option>
                <option value="waiver">Waivers</option>
                <option value="free_agent">Free Agent</option>
                <option value="commissioner">Commissioner</option>
              </select>
            </div>
            
            {/* Sort Dropdown */}
            <div className="flex items-center gap-1.5">
              <ArrowUpDown className="h-4 w-4 text-slate-400 flex-shrink-0" />
              <select
                value={sortBy}
                onChange={(e) => handleSortChange(e.target.value)}
                className="px-2 sm:px-3 py-1.5 sm:py-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-500 dark:focus:ring-accent-400 dark:text-white"
              >
                <option value="recent">Recent</option>
                <option value="value-high">High Value</option>
                <option value="value-low">Low Value</option>
                <option value="best-moves">Most Lopsided</option>
                <option value="worst-moves">Most Even</option>
              </select>
            </div>
          </div>
        </div>
        <p className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm mt-2">
          Trades, waivers, and roster moves across the league
        </p>
      </div>

      {/* Stats */}
      <div className="mt-4 sm:mt-6 grid grid-cols-4 gap-2 sm:gap-4">
        {[
          { type: 'trade', label: 'Trades', icon: ArrowRightLeft, color: 'purple' },
          { type: 'waiver', label: 'Waivers', icon: RefreshCw, color: 'amber' },
          { type: 'free_agent', label: 'Free Agent', icon: UserPlus, color: 'emerald' },
          { type: 'commissioner', label: 'Commissioner', icon: ArrowRightLeft, color: 'slate' },
        ].map(({ type, label, icon: Icon, color }) => (
          <div key={type} className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-2 sm:p-4 shadow-sm dark:shadow-none">
            <div className={`inline-flex p-1.5 sm:p-2 rounded-lg bg-${color}-100 dark:bg-${color}-500/20 mb-1.5 sm:mb-3`}>
              <Icon className={`h-3.5 w-3.5 sm:h-4 sm:w-4 text-${color}-600 dark:text-${color}-400`} />
            </div>
            <div className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-white">{typeCounts[type] || 0}</div>
            <div className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400">{label}</div>
          </div>
        ))}
      </div>

      {/* Transaction List */}
      <div className="mt-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Activity</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {typeFilter === 'all' ? 'All transactions' : `Showing ${typeFilter.replace('_', ' ')}s`} • {filteredAndSortedTransactions.length} results
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {paginatedTransactions.map((tx) => (
            tx.type === 'trade' ? (
              <TradeCard key={tx.transaction_id} tx={tx} />
            ) : (
              <RosterMoveCard key={tx.transaction_id} tx={tx} />
            )
          ))}
          {paginatedTransactions.length === 0 && (
            <div className="text-center py-12">
              <p className="text-slate-500 dark:text-slate-400">No transactions found for this filter.</p>
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-between">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, filteredAndSortedTransactions.length)} of {filteredAndSortedTransactions.length}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-2 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-slate-50 dark:hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="h-4 w-4 text-slate-600 dark:text-slate-400" />
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`min-w-[36px] h-9 px-3 rounded-lg text-sm font-medium transition-colors ${
                        currentPage === pageNum
                          ? 'bg-accent-600 text-white'
                          : 'bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-zinc-800'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-2 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-slate-50 dark:hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="h-4 w-4 text-slate-600 dark:text-slate-400" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
