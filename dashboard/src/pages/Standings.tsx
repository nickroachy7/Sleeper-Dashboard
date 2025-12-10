import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Trophy, TrendingUp, TrendingDown, Loader2, Medal, Crown } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';

interface LeagueUser {
  user_id: string;
  team_name: string | null;
  display_name: string | null;
}

export default function Standings() {
  const { data: standings, isLoading } = useQuery({
    queryKey: ['standings'],
    queryFn: async () => {
      const { data: rosters } = await supabase
        .from('rosters')
        .select('*')
        .order('wins', { ascending: false });

      if (!rosters?.length) return [];

      const { data: users } = await supabase.from('users').select('*');
      const { data: leagueUsers } = await supabase.from('league_users').select('user_id, team_name, display_name');

      return (rosters as any[])
        .map((roster: any) => {
          const owner = (users as any[])?.find((u: any) => u.user_id === roster.owner_id);
          const leagueUser = (leagueUsers as LeagueUser[])?.find((lu: LeagueUser) => lu.user_id === roster.owner_id);
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
    },
  });

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <Loader2 className="h-8 w-8 sm:h-10 sm:w-10 animate-spin text-accent-500 mx-auto" />
            <p className="mt-4 text-slate-500 dark:text-slate-400 text-xs sm:text-sm">Loading standings...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!standings?.length) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="flex flex-col items-center justify-center py-12">
          <div className="text-center max-w-sm">
            <div className="w-12 h-12 sm:w-16 sm:h-16 bg-amber-100 dark:bg-amber-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Trophy className="h-6 w-6 sm:h-8 sm:w-8 text-amber-600 dark:text-amber-400" />
            </div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">No Standings Yet</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">Connect your league to see standings</p>
            <Link
              to="/setup"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-accent-500 text-white text-sm font-medium rounded-lg hover:bg-accent-600 transition-colors"
            >
              Connect League
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Rank icons for top 3 places
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

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <PageHeader title="Standings" backTo="/league" />
      <p className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm -mt-3 mb-4 sm:mb-6">Current league rankings</p>

      {/* Top 3 */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-4 sm:mb-6">
        {standings.slice(0, 3).map((team, idx) => (
          <div
            key={team.id}
            className={`rounded-lg sm:rounded-xl p-3 sm:p-6 border ${getRankBgClass(idx + 1)}`}
          >
            <div className="flex items-center gap-1 sm:gap-2 mb-1.5 sm:mb-3">
              {getRankIcon(idx + 1)}
              <span className="text-[10px] sm:text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide hidden sm:inline">
                {idx === 0 ? 'First' : idx === 1 ? 'Second' : 'Third'} Place
              </span>
              <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase sm:hidden">
                #{idx + 1}
              </span>
            </div>
            <h3 className="font-bold text-slate-900 dark:text-white text-xs sm:text-lg truncate">{team.teamName}</h3>
            <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5 sm:mt-1 truncate hidden sm:block">{team.ownerName}</p>
            <div className="mt-2 sm:mt-4 flex items-baseline gap-1 sm:gap-2">
              <span className="text-base sm:text-2xl font-bold text-slate-900 dark:text-white">
                {team.wins}-{team.losses}
              </span>
              <span className="text-[10px] sm:text-sm text-slate-500 dark:text-slate-400 hidden sm:inline">{team.totalPoints.toFixed(1)} pts</span>
            </div>
          </div>
        ))}
      </div>

      {/* Full Table */}
      <div className="bg-white dark:bg-zinc-900 rounded-lg sm:rounded-xl border border-slate-200 dark:border-zinc-800 shadow-sm dark:shadow-none overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 dark:bg-zinc-800/50 border-b border-slate-100 dark:border-zinc-700">
                <th className="px-2 sm:px-5 py-2.5 sm:py-4 text-left text-[10px] sm:text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Rank
                </th>
                <th className="px-2 sm:px-5 py-2.5 sm:py-4 text-left text-[10px] sm:text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Team
                </th>
                <th className="px-2 sm:px-5 py-2.5 sm:py-4 text-center text-[10px] sm:text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Record
                </th>
                <th className="hidden sm:table-cell px-5 py-4 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Win %
                </th>
                <th className="px-2 sm:px-5 py-2.5 sm:py-4 text-right text-[10px] sm:text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  PF
                </th>
                <th className="hidden md:table-cell px-5 py-4 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  PA
                </th>
                <th className="hidden md:table-cell px-5 py-4 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  +/-
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
              {standings.map((team) => (
                <tr key={team.id} className="hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors">
                  <td className="px-2 sm:px-5 py-2 sm:py-4">
                    <div className="flex items-center gap-1 sm:gap-2">
                      {team.rank <= 3 && (
                        <Medal
                          className={`h-3 w-3 sm:h-4 sm:w-4 ${
                            team.rank === 1
                              ? 'text-amber-500'
                              : team.rank === 2
                              ? 'text-slate-400'
                              : 'text-orange-500'
                          }`}
                        />
                      )}
                      <span className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white">{team.rank}</span>
                    </div>
                  </td>
                  <td className="px-2 sm:px-5 py-2 sm:py-4">
                    <div>
                      <span className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white">{team.teamName}</span>
                      <span className="hidden sm:block text-xs text-slate-500 dark:text-slate-400">{team.ownerName}</span>
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
                        <div
                          className="h-full bg-accent-500 rounded-full"
                          style={{ width: `${team.winPct * 100}%` }}
                        />
                      </div>
                      <span className="text-sm text-slate-600 dark:text-slate-400 tabular-nums">
                        {(team.winPct * 100).toFixed(0)}%
                      </span>
                    </div>
                  </td>
                  <td className="px-2 sm:px-5 py-2 sm:py-4 text-right text-xs sm:text-sm font-medium text-slate-900 dark:text-white tabular-nums">
                    {team.totalPoints.toFixed(1)}
                  </td>
                  <td className="hidden md:table-cell px-5 py-4 text-right text-sm text-slate-500 dark:text-slate-400 tabular-nums">
                    {team.pointsAgainst.toFixed(1)}
                  </td>
                  <td className="hidden md:table-cell px-5 py-4 text-right">
                    <span
                      className={`inline-flex items-center gap-1 text-sm font-medium tabular-nums ${
                        team.pointsDiff > 0
                          ? 'text-accent-600 dark:text-accent-400'
                          : team.pointsDiff < 0
                          ? 'text-red-500 dark:text-red-400'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {team.pointsDiff > 0 ? (
                        <TrendingUp className="h-3.5 w-3.5" />
                      ) : team.pointsDiff < 0 ? (
                        <TrendingDown className="h-3.5 w-3.5" />
                      ) : null}
                      {team.pointsDiff > 0 ? '+' : ''}
                      {team.pointsDiff.toFixed(1)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
