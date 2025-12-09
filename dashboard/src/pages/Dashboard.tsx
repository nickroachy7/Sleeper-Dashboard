import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { 
  Users, 
  Trophy, 
  ArrowRightLeft, 
  Loader2,
  ChevronRight,
  Zap,
  FileText,
  Scale,
  RefreshCw,
  Crown,
  Medal,
  TrendingUp,
  TrendingDown,
  UserPlus,
  UserMinus,
  Clock,
  Minus
} from 'lucide-react';
import { Link } from 'react-router-dom';

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
  K: 'bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-400',
  DEF: 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400',
};

export default function Dashboard() {
  // Fetch all data needed for dashboard
  const { data: dashboardData, isLoading } = useQuery({
    queryKey: ['dashboard-full'],
    queryFn: async () => {
      const [
        leaguesRes,
        rostersRes,
        transactionsRes,
        usersRes,
        leagueUsersRes,
        playersRes,
        playerValuesRes,
        draftPicksRes,
        draftsRes,
      ] = await Promise.all([
        supabase.from('leagues').select('*').order('created_at', { ascending: false }).limit(1),
        supabase.from('rosters').select('*').order('wins', { ascending: false }),
        supabase.from('transactions').select('*'),
        supabase.from('users').select('*'),
        supabase.from('league_users').select('user_id, team_name, display_name'),
        supabase.from('players').select('player_id, full_name, position, team'),
        supabase.from('player_values').select('player_id, value'),
        supabase.from('draft_picks').select(`draft_slot, round, player_id, roster_id, draft_id, drafts!inner(season)`).not('player_id', 'is', null),
        supabase.from('drafts').select('draft_id, season').order('season', { ascending: true }).limit(1),
      ]);

      // Build player map
      const playerMap = new Map<string, Player>();
      (playersRes.data as Player[] || []).forEach(p => playerMap.set(p.player_id, p));

      // Build player values map
      const playerValuesMap = new Map<string, number>();
      (playerValuesRes.data as PlayerValue[] || []).forEach(pv => playerValuesMap.set(pv.player_id, pv.value));

      // Build draft pick results map
      const draftPickResultsMap = new Map<string, string>();
      (draftPicksRes.data as any[] || []).forEach((pick: any) => {
        const key = `${pick.drafts.season}-${pick.round}-${pick.draft_slot}`;
        draftPickResultsMap.set(key, pick.player_id);
      });

      // Build roster_id to draft_slot mapping from startup draft
      // In dynasty leagues, each roster's draft slot is determined by their position in the startup draft
      const rosterToDraftSlotMap = new Map<number, number>();
      const startupDraftId = draftsRes.data?.[0]?.draft_id;
      if (startupDraftId) {
        (draftPicksRes.data as any[] || [])
          .filter((pick: any) => pick.draft_id === startupDraftId && pick.round === 1)
          .forEach((pick: any) => {
            rosterToDraftSlotMap.set(pick.roster_id, pick.draft_slot);
          });
      }

      // Build roster to owner map
      const rosterToOwner = new Map<number, string>();
      (rostersRes.data as any[] || []).forEach((r: any) => {
        rosterToOwner.set(r.roster_id, r.owner_id);
      });

      // Process standings (exact same logic as Standings.tsx)
      const standings = (rostersRes.data as any[] || [])
        .map((roster: any) => {
          const owner = (usersRes.data as any[])?.find((u: any) => u.user_id === roster.owner_id);
          const leagueUser = (leagueUsersRes.data as LeagueUser[])?.find((lu: LeagueUser) => lu.user_id === roster.owner_id);
          const totalPoints = (roster.fpts ?? 0) + (roster.fpts_decimal ?? 0) / 100;
          const pointsAgainst = (roster.fpts_against ?? 0) + (roster.fpts_against_decimal ?? 0) / 100;
          const wins = roster.wins ?? 0;
          const losses = roster.losses ?? 0;
          const ties = roster.ties ?? 0;

          return {
            ...roster,
            teamName: leagueUser?.team_name || leagueUser?.display_name || owner?.display_name || owner?.username || 'Unknown',
            ownerName: owner?.display_name || owner?.username || 'Unknown',
            wins,
            losses,
            ties,
            totalPoints,
            pointsAgainst,
            pointsDiff: totalPoints - pointsAgainst,
            winPct: wins > 0 ? wins / (wins + losses + ties) : 0,
          };
        })
        .sort((a, b) => b.wins - a.wins || b.totalPoints - a.totalPoints)
        .map((team, idx) => ({ ...team, rank: idx + 1 }));

      // Process transactions (exact same logic as Transactions.tsx)
      const allTransactions = (transactionsRes.data as any[] || []);
      const sortedTransactions = allTransactions
        .sort((a: any, b: any) => {
          const getTimestamp = (tx: any): number => {
            if (tx.created) return tx.created;
            if (tx.status_updated) return tx.status_updated;
            if (tx.created_at) return new Date(tx.created_at).getTime();
            return 0;
          };
          return getTimestamp(b) - getTimestamp(a);
        })
        .slice(0, 5)
        .map((tx: any) => {
          const rosterOwners = tx.roster_ids?.map((rosterId: number) => {
            const ownerId = rosterToOwner.get(rosterId);
            const owner = (usersRes.data as any[])?.find((u: any) => u.user_id === ownerId);
            const leagueUser = (leagueUsersRes.data as LeagueUser[])?.find((lu: LeagueUser) => lu.user_id === ownerId);
            return {
              rosterId,
              teamName: leagueUser?.team_name || leagueUser?.display_name || owner?.display_name || `Team ${rosterId}`,
              ownerName: owner?.display_name || owner?.username || 'Unknown'
            };
          }) || [];
          return { ...tx, teams: rosterOwners };
        });

      return {
        league: leaguesRes.data?.[0] || null,
        standings,
        transactions: sortedTransactions,
        transactionCount: allTransactions.length,
        players: playerMap,
        playerValues: playerValuesMap,
        draftPickResults: draftPickResultsMap,
        rosterToDraftSlot: rosterToDraftSlotMap,
      };
    },
  });

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <Loader2 className="h-8 w-8 sm:h-10 sm:w-10 animate-spin text-accent-500 mx-auto" />
            <p className="mt-4 text-slate-500 dark:text-slate-400 text-xs sm:text-sm">Loading dashboard...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!dashboardData?.league) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="flex flex-col items-center justify-center py-12">
          <div className="text-center max-w-sm">
            <div className="w-16 h-16 bg-accent-100 dark:bg-accent-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Trophy className="h-8 w-8 text-accent-600 dark:text-accent-400" />
            </div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">Welcome to Sleeper Dashboard</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
              Connect your Sleeper fantasy league to get started
            </p>
            <Link
              to="/setup"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-accent-500 text-white text-sm font-medium rounded-lg hover:bg-accent-600 transition-colors"
            >
              <Zap className="h-4 w-4" />
              Connect Your League
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { standings, transactions, transactionCount, players, playerValues, draftPickResults, rosterToDraftSlot } = dashboardData;

  const getPlayer = (playerId: string): Player | undefined => players?.get(playerId);
  const getPlayerValue = (playerId: string): number => playerValues?.get(playerId) || 0;
  
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

  const formatDate = (tx: any) => {
    const timestamp = tx.created ? tx.created : (tx.status_updated ? tx.status_updated : null);
    const date = timestamp ? new Date(timestamp) : new Date(tx.created_at);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Standings helpers (same as Standings.tsx)
  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Crown className="h-5 w-5 text-yellow-500" />;
    if (rank === 2) return <Medal className="h-5 w-5 text-slate-400" />;
    if (rank === 3) return <Medal className="h-5 w-5 text-orange-500" />;
    return null;
  };

  const getRankBgClass = (rank: number) => {
    if (rank === 1) return 'bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-yellow-500/10 dark:to-amber-500/10 border-amber-200 dark:border-yellow-500/30';
    if (rank === 2) return 'bg-gradient-to-br from-slate-50 to-gray-100 dark:from-slate-500/10 dark:to-gray-500/10 border-slate-200 dark:border-slate-500/30';
    if (rank === 3) return 'bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-500/10 dark:to-amber-500/10 border-orange-200 dark:border-orange-500/30';
    return '';
  };

  // Transaction type styles (same as Transactions.tsx)
  const getTypeStyles = (type: string) => {
    switch (type) {
      case 'trade':
        return { icon: ArrowRightLeft, text: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-100 dark:bg-purple-500/20' };
      case 'waiver':
        return { icon: Clock, text: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-500/20' };
      case 'free_agent':
        return { icon: UserPlus, text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-500/20' };
      default:
        return { icon: RefreshCw, text: 'text-slate-600 dark:text-slate-400', bg: 'bg-slate-100 dark:bg-zinc-800' };
    }
  };

  // Trade card helper - get assets for each team
  const getTradeAssets = (tx: any) => {
    const teamAssets: Record<number, { players: string[]; picks: any[]; value: number }> = {};
    tx.teams?.forEach((team: any) => {
      teamAssets[team.rosterId] = { players: [], picks: [], value: 0 };
    });
    if (tx.adds) {
      Object.entries(tx.adds).forEach(([playerId, rosterId]) => {
        if (teamAssets[rosterId as number]) {
          teamAssets[rosterId as number].players.push(playerId);
          teamAssets[rosterId as number].value += getPlayerValue(playerId);
        }
      });
    }
    if (tx.draft_picks && Array.isArray(tx.draft_picks)) {
      tx.draft_picks.forEach((pick: any) => {
        if (pick.owner_id && teamAssets[pick.owner_id]) {
          teamAssets[pick.owner_id].picks.push(pick);
          const pickBaseValue = pick.round === 1 ? 5000 : pick.round === 2 ? 2000 : pick.round === 3 ? 800 : 400;
          teamAssets[pick.owner_id].value += pickBaseValue;
        }
      });
    }
    return teamAssets;
  };

  // Navigation links
  const navLinks = [
    { to: '/standings', icon: Trophy, label: 'Standings', desc: 'League rankings', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-500/20' },
    { to: '/rosters', icon: Users, label: 'Rosters', desc: 'Team players & values', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-500/20' },
    { to: '/transactions', icon: ArrowRightLeft, label: 'Transactions', desc: 'Trades & moves', color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-100 dark:bg-purple-500/20' },
    { to: '/drafts', icon: FileText, label: 'Drafts', desc: 'History & capital', color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-100 dark:bg-indigo-500/20' },
    { to: '/trade-evaluator', icon: Scale, label: 'Trade Evaluator', desc: 'Analyze trades', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-500/20' },
    { to: '/ktc-values', icon: TrendingUp, label: 'Player Values', desc: 'KTC rankings', color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-100 dark:bg-rose-500/20' },
  ];

  // Trade Card Component (exact same as Transactions.tsx)
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

        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-100 dark:divide-zinc-800">
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

  // Roster Move Card Component (exact same as Transactions.tsx)
  const RosterMoveCard = ({ tx }: { tx: any }) => {
    const styles = getTypeStyles(tx.type);
    const Icon = styles.icon;
    const team = tx.teams?.[0];
    const adds = tx.adds ? Object.keys(tx.adds) : [];
    const drops = tx.drops ? Object.keys(tx.drops) : [];

    return (
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 shadow-sm dark:shadow-none overflow-hidden">
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

        <div className="p-3 sm:p-6">
          <div className="mb-2 sm:mb-4">
            <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">{team?.teamName || 'Unknown Team'}</h4>
          </div>

          <div className="space-y-2 sm:space-y-3">
            {adds.map((playerId) => {
              const player = getPlayer(playerId);
              const posClass = positionColors[player?.position || ''] || 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-400';
              return (
                <div key={playerId} className="flex items-center gap-1.5 sm:gap-3 py-2 sm:py-2.5 px-2 sm:px-3 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 rounded-lg">
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
              );
            })}

            {drops.map((playerId) => {
              const player = getPlayer(playerId);
              const posClass = positionColors[player?.position || ''] || 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-400';
              return (
                <div key={playerId} className="flex items-center gap-1.5 sm:gap-3 py-2 sm:py-2.5 px-2 sm:px-3 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-lg">
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
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">Dashboard</h1>
      </div>

      {/* Navigation Grid */}
      <div className="grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3 mb-4 sm:mb-6">
        {navLinks.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className="group bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-2.5 sm:p-4 shadow-sm dark:shadow-none hover:border-slate-300 dark:hover:border-zinc-700 hover:shadow-md dark:hover:shadow-none transition-all"
          >
            <div className={`w-8 h-8 sm:w-10 sm:h-10 ${link.bg} rounded-lg flex items-center justify-center mb-2 sm:mb-3`}>
              <link.icon className={`h-4 w-4 sm:h-5 sm:w-5 ${link.color}`} />
            </div>
            <div className="font-medium text-slate-900 dark:text-white text-[10px] sm:text-sm">{link.label}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 hidden sm:block">{link.desc}</div>
          </Link>
        ))}
      </div>

      {/* Standings Section - Exact same as Standings.tsx */}
      <div className="mb-4 sm:mb-6">
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <h2 className="text-sm sm:text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Trophy className="h-4 w-4 sm:h-5 sm:w-5 text-amber-500" />
            Standings
          </h2>
          <Link to="/standings" className="text-xs sm:text-sm text-accent-600 dark:text-accent-400 hover:text-accent-700 dark:hover:text-accent-300 font-medium flex items-center gap-1">
            View full <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </Link>
        </div>

        {/* Top 3 - Podium Style: 2nd (left), 1st (center, tallest), 3rd (right, shortest) */}
        <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-3 sm:mb-4 items-end">
          {/* 2nd Place - Left, Medium Height */}
          {standings[1] && (
            <div
              className={`rounded-xl border ${getRankBgClass(2)} pt-3 sm:pt-5 pb-3 sm:pb-5 px-3 sm:px-5 flex flex-col min-h-[120px] sm:min-h-[180px]`}
            >
              <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                <div className="[&>svg]:h-4 [&>svg]:w-4 sm:[&>svg]:h-5 sm:[&>svg]:w-5">
                  {getRankIcon(2)}
                </div>
                <span className="text-[10px] sm:text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide hidden sm:inline">
                  Second Place
                </span>
                <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide sm:hidden">
                  2ND
                </span>
              </div>
              <h3 className="font-bold text-slate-900 dark:text-white text-xs sm:text-lg truncate">{standings[1].teamName}</h3>
              <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5 sm:mt-1 truncate hidden sm:block">{standings[1].ownerName}</p>
              <div className="mt-auto pt-2 sm:pt-3 flex items-baseline gap-1 sm:gap-2">
                <span className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-white">
                  {standings[1].wins}-{standings[1].losses}
                </span>
              </div>
            </div>
          )}

          {/* 1st Place - Center, Tallest */}
          {standings[0] && (
            <div
              className={`rounded-xl border ${getRankBgClass(1)} pt-3 sm:pt-5 pb-4 sm:pb-6 px-3 sm:px-5 flex flex-col min-h-[140px] sm:min-h-[220px]`}
            >
              <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                <div className="[&>svg]:h-5 [&>svg]:w-5 sm:[&>svg]:h-6 sm:[&>svg]:w-6">
                  {getRankIcon(1)}
                </div>
                <span className="text-[10px] sm:text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide hidden sm:inline">
                  First Place
                </span>
                <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide sm:hidden">
                  1ST
                </span>
              </div>
              <h3 className="font-bold text-slate-900 dark:text-white text-xs sm:text-lg truncate">{standings[0].teamName}</h3>
              <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5 sm:mt-1 truncate hidden sm:block">{standings[0].ownerName}</p>
              <div className="mt-auto pt-2 sm:pt-4 flex items-baseline gap-1 sm:gap-2">
                <span className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-white">
                  {standings[0].wins}-{standings[0].losses}
                </span>
              </div>
            </div>
          )}

          {/* 3rd Place - Right, Shortest */}
          {standings[2] && (
            <div
              className={`rounded-xl border ${getRankBgClass(3)} pt-3 sm:pt-4 pb-2.5 sm:pb-4 px-3 sm:px-5 flex flex-col min-h-[100px] sm:min-h-[140px]`}
            >
              <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
                <div className="[&>svg]:h-4 [&>svg]:w-4 sm:[&>svg]:h-5 sm:[&>svg]:w-5">
                  {getRankIcon(3)}
                </div>
                <span className="text-[10px] sm:text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide hidden sm:inline">
                  Third Place
                </span>
                <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide sm:hidden">
                  3RD
                </span>
              </div>
              <h3 className="font-bold text-slate-900 dark:text-white text-xs sm:text-lg truncate">{standings[2].teamName}</h3>
              <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate hidden sm:block">{standings[2].ownerName}</p>
              <div className="mt-auto pt-1.5 sm:pt-3 flex items-baseline gap-1 sm:gap-2">
                <span className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-white">
                  {standings[2].wins}-{standings[2].losses}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Full Table */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 shadow-sm dark:shadow-none overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 dark:bg-zinc-800/50 border-b border-slate-100 dark:border-zinc-700">
                  <th className="px-2 sm:px-5 py-2 sm:py-4 text-left text-[10px] sm:text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Rank</th>
                  <th className="px-2 sm:px-5 py-2 sm:py-4 text-left text-[10px] sm:text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Team</th>
                  <th className="px-2 sm:px-5 py-2 sm:py-4 text-center text-[10px] sm:text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Record</th>
                  <th className="hidden sm:table-cell px-5 py-4 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Win %</th>
                  <th className="px-2 sm:px-5 py-2 sm:py-4 text-right text-[10px] sm:text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">PF</th>
                  <th className="hidden sm:table-cell px-5 py-4 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">PA</th>
                  <th className="hidden sm:table-cell px-5 py-4 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">+/-</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                {standings.map((team: any) => (
                  <tr key={team.id} className="hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors">
                    <td className="px-2 sm:px-5 py-2 sm:py-4">
                      <div className="flex items-center gap-1 sm:gap-2">
                        {team.rank <= 3 && (
                          <Medal
                            className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${
                              team.rank === 1 ? 'text-amber-500' : team.rank === 2 ? 'text-slate-400' : 'text-orange-500'
                            }`}
                          />
                        )}
                        <span className="font-semibold text-xs sm:text-sm text-slate-900 dark:text-white">{team.rank}</span>
                      </div>
                    </td>
                    <td className="px-2 sm:px-5 py-2 sm:py-4">
                      <div>
                        <span className="font-semibold text-xs sm:text-sm text-slate-900 dark:text-white">{team.teamName}</span>
                        <span className="block text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 hidden sm:block">{team.ownerName}</span>
                      </div>
                    </td>
                    <td className="px-2 sm:px-5 py-2 sm:py-4 text-center">
                      <span className="inline-flex items-center gap-0.5 sm:gap-1 text-xs sm:text-sm font-medium">
                        <span className="text-accent-600 dark:text-accent-400">{team.wins}</span>
                        <span className="text-slate-300 dark:text-zinc-600">-</span>
                        <span className="text-red-500 dark:text-red-400">{team.losses}</span>
                        {team.ties > 0 && (
                          <>
                            <span className="text-slate-300 dark:text-zinc-600">-</span>
                            <span className="text-slate-500 dark:text-slate-400">{team.ties}</span>
                          </>
                        )}
                      </span>
                    </td>
                    <td className="hidden sm:table-cell px-5 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-12 h-1.5 bg-slate-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                          <div className="h-full bg-accent-500 rounded-full" style={{ width: `${team.winPct * 100}%` }} />
                        </div>
                        <span className="text-sm text-slate-600 dark:text-slate-400 tabular-nums">
                          {(team.winPct * 100).toFixed(0)}%
                        </span>
                      </div>
                    </td>
                    <td className="px-2 sm:px-5 py-2 sm:py-4 text-right font-medium text-xs sm:text-sm text-slate-900 dark:text-white tabular-nums">
                      {team.totalPoints.toFixed(1)}
                    </td>
                    <td className="hidden sm:table-cell px-5 py-4 text-right text-slate-500 dark:text-slate-400 tabular-nums">
                      {team.pointsAgainst.toFixed(1)}
                    </td>
                    <td className="hidden sm:table-cell px-5 py-4 text-right">
                      <span className={`inline-flex items-center gap-1 font-medium tabular-nums ${
                        team.pointsDiff > 0 ? 'text-accent-600 dark:text-accent-400' : team.pointsDiff < 0 ? 'text-red-500 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'
                      }`}>
                        {team.pointsDiff > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : team.pointsDiff < 0 ? <TrendingDown className="h-3.5 w-3.5" /> : null}
                        {team.pointsDiff > 0 ? '+' : ''}{team.pointsDiff.toFixed(1)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Recent Transactions Section - Exact same cards as Transactions.tsx */}
      <div>
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <h2 className="text-sm sm:text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4 sm:h-5 sm:w-5 text-purple-500" />
            Recent Transactions
          </h2>
          <Link to="/transactions" className="text-xs sm:text-sm text-accent-600 dark:text-accent-400 hover:text-accent-700 dark:hover:text-accent-300 font-medium flex items-center gap-1">
            View all ({transactionCount}) <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </Link>
        </div>

        <div className="space-y-4">
          {transactions.length === 0 ? (
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-12 text-center">
              <p className="text-slate-500 dark:text-slate-400">No transactions yet</p>
            </div>
          ) : (
            transactions.map((tx: any) => (
              tx.type === 'trade' ? (
                <TradeCard key={tx.transaction_id} tx={tx} />
              ) : (
                <RosterMoveCard key={tx.transaction_id} tx={tx} />
              )
            ))
          )}
        </div>
      </div>
    </div>
  );
}
