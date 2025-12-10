import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Loader2, Trophy, Calendar, Users, Zap, Database, Sun, Moon, Monitor } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/theme';
import { PageHeader } from '../components/PageHeader';

export default function LeagueSetup() {
  const { theme, setTheme } = useTheme();
  
  const { data: league, isLoading } = useQuery({
    queryKey: ['league'],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from('leagues')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1) as any);
      if (error) throw error;
      return data?.[0] || null;
    },
  });

  const { data: stats } = useQuery({
    queryKey: ['league-stats'],
    queryFn: async () => {
      const [users, rosters, matchups, transactions, drafts, draftPicks, tradedPicks] = await Promise.all([
        supabase.from('users').select('*', { count: 'exact', head: true }),
        supabase.from('rosters').select('*', { count: 'exact', head: true }),
        supabase.from('matchups').select('*', { count: 'exact', head: true }),
        supabase.from('transactions').select('*', { count: 'exact', head: true }),
        supabase.from('drafts').select('*', { count: 'exact', head: true }),
        supabase.from('draft_picks').select('*', { count: 'exact', head: true }),
        supabase.from('traded_picks').select('*', { count: 'exact', head: true }),
      ]);
      return {
        users: (users as any).count || 0,
        rosters: (rosters as any).count || 0,
        matchups: (matchups as any).count || 0,
        transactions: (transactions as any).count || 0,
        drafts: (drafts as any).count || 0,
        draftPicks: (draftPicks as any).count || 0,
        tradedPicks: (tradedPicks as any).count || 0,
      };
    },
  });

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="flex items-center justify-center h-64">
          <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
            <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 animate-spin" />
            <span className="text-sm">Loading league data...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <PageHeader title="Settings" backTo="/league" />
      <p className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm -mt-3 mb-4 sm:mb-6">Your Sleeper fantasy league connection and preferences</p>

      {/* Appearance Section */}
      <section className="mb-6 space-y-4">
        <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Appearance</h2>
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-6 shadow-sm dark:shadow-none">
          <div className="flex items-center gap-3 mb-4">
            {theme === 'dark' ? (
              <Moon className="h-5 w-5 text-slate-600 dark:text-slate-400" />
            ) : (
              <Sun className="h-5 w-5 text-amber-500" />
            )}
            <h3 className="font-semibold text-slate-900 dark:text-white">Color Theme</h3>
          </div>
          
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            Choose your preferred color theme for the dashboard.
          </p>
          
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setTheme('light')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                theme === 'light'
                  ? 'bg-accent-50 dark:bg-accent-500/20 border-accent-300 dark:border-accent-500/50 text-accent-700 dark:text-accent-400'
                  : 'bg-white dark:bg-zinc-800 border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-zinc-700'
              }`}
            >
              <Sun className="h-4 w-4" />
              Light
            </button>
            <button
              onClick={() => setTheme('dark')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                theme === 'dark'
                  ? 'bg-accent-50 dark:bg-accent-500/20 border-accent-300 dark:border-accent-500/50 text-accent-700 dark:text-accent-400'
                  : 'bg-white dark:bg-zinc-800 border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-zinc-700'
              }`}
            >
              <Moon className="h-4 w-4" />
              Dark
            </button>
            <button
              onClick={() => setTheme('system')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                theme === 'system'
                  ? 'bg-accent-50 dark:bg-accent-500/20 border-accent-300 dark:border-accent-500/50 text-accent-700 dark:text-accent-400'
                  : 'bg-white dark:bg-zinc-800 border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-zinc-700'
              }`}
            >
              <Monitor className="h-4 w-4" />
              System
            </button>
          </div>
        </div>
      </section>

      {league ? (
        <>
          {/* League Connection Section */}
          <section className="mb-6 space-y-4">
            <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">League Connection</h2>
            
            {/* Connected League Card */}
            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-500/10 dark:to-teal-500/10 rounded-xl border border-emerald-200 dark:border-emerald-500/30 p-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">League Connected</h3>
                  <p className="text-slate-600 dark:text-slate-300 mt-1">{league.name}</p>
                  
                  <div className="mt-4 flex flex-wrap gap-4">
                    <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                      <Trophy className="h-4 w-4 text-amber-500" />
                      <span>{league.name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                      <Calendar className="h-4 w-4 text-blue-500" />
                      <span>{league.season} Season</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                      <Users className="h-4 w-4 text-purple-500" />
                      <span>{league.total_rosters} Teams</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                      <Zap className="h-4 w-4 text-orange-500" />
                      <span className="capitalize">{league.status?.replace('_', ' ')}</span>
                    </div>
                  </div>

                  <div className="mt-4 text-xs text-slate-500 dark:text-slate-400">
                    League ID: <code className="bg-slate-200 dark:bg-zinc-800 px-1.5 py-0.5 rounded">{league.league_id}</code>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* League Settings Section */}
          <section className="mb-6 space-y-4">
            <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">League Settings</h2>
            
            {/* League Info Card */}
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-6 shadow-sm dark:shadow-none">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div>
                  <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Roster Positions</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {league.roster_positions?.map((pos: string, i: number) => (
                      <span
                        key={i}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium ${
                          pos === 'QB' ? 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400' :
                          pos === 'RB' ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400' :
                          pos === 'WR' ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400' :
                          pos === 'TE' ? 'bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-400' :
                          pos === 'FLEX' ? 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400' :
                          pos === 'SUPER_FLEX' ? 'bg-pink-100 dark:bg-pink-500/20 text-pink-700 dark:text-pink-400' :
                          pos === 'K' ? 'bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-400' :
                          pos === 'DEF' ? 'bg-slate-100 dark:bg-zinc-700 text-slate-700 dark:text-slate-300' :
                          'bg-gray-100 dark:bg-zinc-700 text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        {pos === 'BN' ? 'Bench' : pos.replace('_', ' ')}
                      </span>
                    ))}
                  </div>
                </div>
                
                <div>
                  <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Key Settings</h4>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-zinc-800">
                      <span className="text-slate-500 dark:text-slate-400">Playoff Teams</span>
                      <span className="text-slate-900 dark:text-white font-semibold">{league.settings?.playoff_teams || 6}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-zinc-800">
                      <span className="text-slate-500 dark:text-slate-400">Trade Deadline</span>
                      <span className="text-slate-900 dark:text-white font-semibold">Week {league.settings?.trade_deadline || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-zinc-800">
                      <span className="text-slate-500 dark:text-slate-400">Waiver Budget</span>
                      <span className="text-slate-900 dark:text-white font-semibold">${league.settings?.waiver_budget || 100}</span>
                    </div>
                    <div className="flex justify-between items-center py-2">
                      <span className="text-slate-500 dark:text-slate-400">Taxi Slots</span>
                      <span className="text-slate-900 dark:text-white font-semibold">{league.settings?.taxi_slots || 0}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Database Statistics Section */}
          {stats && (
            <section className="space-y-4">
              <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Database Statistics</h2>
              
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-6 shadow-sm dark:shadow-none">
                <div className="flex items-center gap-3 mb-5">
                  <Database className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                  <p className="text-sm text-slate-500 dark:text-slate-400">Records synced from Sleeper API</p>
                </div>
                
                <div className="grid grid-cols-4 sm:grid-cols-4 md:grid-cols-4 gap-2 sm:gap-4">
                  <div className="bg-slate-50 dark:bg-zinc-800 rounded-xl p-2 sm:p-4 text-center">
                    <div className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-white">{stats.users}</div>
                    <div className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5 sm:mt-1 font-medium">Users</div>
                  </div>
                  <div className="bg-slate-50 dark:bg-zinc-800 rounded-xl p-2 sm:p-4 text-center">
                    <div className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-white">{stats.rosters}</div>
                    <div className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5 sm:mt-1 font-medium">Rosters</div>
                  </div>
                  <div className="bg-slate-50 dark:bg-zinc-800 rounded-xl p-2 sm:p-4 text-center">
                    <div className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-white">{stats.matchups}</div>
                    <div className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5 sm:mt-1 font-medium">Matchups</div>
                  </div>
                  <div className="bg-slate-50 dark:bg-zinc-800 rounded-xl p-2 sm:p-4 text-center">
                    <div className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-white">{stats.transactions}</div>
                    <div className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5 sm:mt-1 font-medium">Trans</div>
                  </div>
                  <div className="bg-slate-50 dark:bg-zinc-800 rounded-xl p-2 sm:p-4 text-center">
                    <div className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-white">{stats.drafts}</div>
                    <div className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5 sm:mt-1 font-medium">Drafts</div>
                  </div>
                  <div className="bg-slate-50 dark:bg-zinc-800 rounded-xl p-2 sm:p-4 text-center">
                    <div className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-white">{stats.draftPicks}</div>
                    <div className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5 sm:mt-1 font-medium">Picks</div>
                  </div>
                  <div className="bg-slate-50 dark:bg-zinc-800 rounded-xl p-2 sm:p-4 text-center">
                    <div className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-white">{stats.tradedPicks}</div>
                    <div className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5 sm:mt-1 font-medium">Traded</div>
                  </div>
                  <div className="bg-emerald-50 dark:bg-emerald-500/10 rounded-xl p-2 sm:p-4 text-center border border-emerald-200 dark:border-emerald-500/30">
                    <div className="text-lg sm:text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                      {stats.users + stats.rosters + stats.matchups + stats.transactions + stats.drafts + stats.draftPicks + stats.tradedPicks}
                    </div>
                    <div className="text-[10px] sm:text-xs text-emerald-600 dark:text-emerald-400 mt-0.5 sm:mt-1 font-medium">Total</div>
                  </div>
                </div>
              </div>
            </section>
          )}
        </>
      ) : (
        <div className="bg-amber-50 dark:bg-amber-500/10 rounded-xl border border-amber-200 dark:border-amber-500/30 p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 dark:bg-amber-500/20 rounded-lg flex items-center justify-center">
              <Database className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white">No League Data</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                No league data found in the database. Please contact the administrator to populate the data.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
