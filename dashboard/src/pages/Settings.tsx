import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import {
  CheckCircle2,
  Loader2,
  Trophy,
  Calendar,
  Users,
  Zap,
  Database,
  RefreshCw,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Play,
  Crown,
  Activity,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';

// ─── Sync Types ─────────────────────────────────────────────────────

interface SyncLog {
  id: string;
  sync_type: string;
  league_id: string | null;
  status: string;
  records_processed: number | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}

interface CronJob {
  jobid: number;
  jobname: string;
  schedule: string;
  active: boolean;
}

interface CronRun {
  jobname: string;
  runid: number;
  status: string;
  return_message: string | null;
  start_time: string;
  end_time: string | null;
  duration_seconds: number | null;
}

const SYNC_TYPE_CONFIG: Record<string, { icon: typeof Database; label: string; color: string }> = {
  ktc_values: { icon: Crown, label: 'KTC Player Values', color: 'text-yellow-400' },
  league_data: { icon: Users, label: 'League Data', color: 'text-blue-400' },
  players: { icon: Database, label: 'Players', color: 'text-green-400' },
  nfl_state: { icon: Activity, label: 'NFL State', color: 'text-purple-400' },
};

const CRON_DESCRIPTIONS: Record<string, string> = {
  'sync-ktc-values': 'Daily at 6 AM ET',
  'sync-league-data': 'Every 6 hours',
  'sync-players': 'Mondays at 8 AM ET',
  'sync-nfl-state': 'Daily at 10 AM ET',
};

// ─── Data Fetchers ──────────────────────────────────────────────────

async function fetchSyncLogs(): Promise<SyncLog[]> {
  const { data, error } = await supabase
    .from('sync_log')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(20);
  if (error) throw error;
  return data || [];
}

async function fetchCronJobs(): Promise<CronJob[]> {
  const { data, error } = await supabase
    .from('sync.cron_jobs' as any)
    .select('*');
  if (error) {
    console.warn('Could not fetch cron jobs:', error.message);
    return [];
  }
  return data || [];
}

async function fetchCronRuns(): Promise<CronRun[]> {
  const { data, error } = await supabase
    .from('sync.recent_runs' as any)
    .select('*')
    .limit(10);
  if (error) {
    console.warn('Could not fetch cron runs:', error.message);
    return [];
  }
  return data || [];
}

// ─── Component ──────────────────────────────────────────────────────

export default function Settings() {
  const queryClient = useQueryClient();
  const [triggeringSync, setTriggeringSync] = useState<string | null>(null);

  // League data
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
      const [users, rosters, transactions, drafts, draftPicks, tradedPicks] = await Promise.all([
        supabase.from('users').select('*', { count: 'exact', head: true }),
        supabase.from('rosters').select('*', { count: 'exact', head: true }),
        supabase.from('transactions').select('*', { count: 'exact', head: true }),
        supabase.from('drafts').select('*', { count: 'exact', head: true }),
        supabase.from('draft_picks').select('*', { count: 'exact', head: true }),
        supabase.from('traded_picks').select('*', { count: 'exact', head: true }),
      ]);
      return {
        users: (users as any).count || 0,
        rosters: (rosters as any).count || 0,
        transactions: (transactions as any).count || 0,
        drafts: (drafts as any).count || 0,
        draftPicks: (draftPicks as any).count || 0,
        tradedPicks: (tradedPicks as any).count || 0,
      };
    },
  });

  // Sync data
  const { data: syncLogs } = useQuery({
    queryKey: ['syncLogs'],
    queryFn: fetchSyncLogs,
    refetchInterval: 30000,
  });

  const { data: cronJobs } = useQuery({
    queryKey: ['cronJobs'],
    queryFn: fetchCronJobs,
  });

  const { data: cronRuns } = useQuery({
    queryKey: ['cronRuns'],
    queryFn: fetchCronRuns,
    refetchInterval: 30000,
  });

  const triggerSync = useMutation({
    mutationFn: async (functionName: string) => {
      setTriggeringSync(functionName);
      const response = await supabase.functions.invoke(functionName);
      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['syncLogs'] });
      setTriggeringSync(null);
    },
    onError: (error) => {
      console.error('Sync error:', error);
      setTriggeringSync(null);
    },
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'completed_with_errors':
        return <AlertCircle className="w-4 h-4 text-yellow-400" />;
      case 'running':
        return <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-400" />;
      default:
        return <Clock className="w-4 h-4 text-slate-400" />;
    }
  };

  const formatDuration = (started: string, completed: string | null) => {
    if (!completed) return 'In progress...';
    const duration = new Date(completed).getTime() - new Date(started).getTime();
    if (duration < 1000) return `${duration}ms`;
    if (duration < 60000) return `${(duration / 1000).toFixed(1)}s`;
    return `${(duration / 60000).toFixed(1)}m`;
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="flex items-center justify-center h-64">
          <div className="flex items-center gap-3 text-[#888888]">
            <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 animate-spin" />
            <span className="text-sm">Loading settings...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      <PageHeader sectionLabel="System" title="Settings" subtitle="League connection, sync operations, and database info" />

      {league ? (
        <>
          {/* ── LEAGUE CONNECTION ───────────────────────────────────── */}
          <section className="mb-8">
            <p className="text-[10px] font-bold text-[#555555] tracking-[3px] uppercase mb-4">LEAGUE CONNECTION</p>

            <div className="bg-gradient-to-br from-emerald-500/10 to-teal-500/10 rounded-md border border-emerald-500/30 p-5">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-emerald-500/20 rounded-md flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-white">League Connected</h3>
                  <p className="text-slate-300 text-sm mt-1">{league.name}</p>

                  <div className="mt-3 flex flex-wrap gap-3">
                    <div className="flex items-center gap-1.5 text-xs text-slate-300">
                      <Trophy className="h-3.5 w-3.5 text-amber-500" />
                      <span>{league.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-300">
                      <Calendar className="h-3.5 w-3.5 text-blue-500" />
                      <span>{league.season} Season</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-300">
                      <Users className="h-3.5 w-3.5 text-purple-500" />
                      <span>{league.total_rosters} Teams</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-300">
                      <Zap className="h-3.5 w-3.5 text-orange-500" />
                      <span className="capitalize">{league.status?.replace('_', ' ')}</span>
                    </div>
                  </div>

                  <div className="mt-3 text-xs text-[#555555]">
                    League ID: <code className="bg-[#111111] px-1.5 py-0.5 rounded text-[#888888]">{league.league_id}</code>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ── LEAGUE SETTINGS ─────────────────────────────────────── */}
          <section className="mb-8">
            <p className="text-[10px] font-bold text-[#555555] tracking-[3px] uppercase mb-4">LEAGUE SETTINGS</p>

            <div className="rounded-md border border-[#151515] p-5">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-xs font-medium text-[#888888] uppercase tracking-wide mb-3">Roster Positions</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {league.roster_positions?.map((pos: string, i: number) => (
                      <span
                        key={i}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          pos === 'QB' ? 'bg-red-500/20 text-red-400' :
                          pos === 'RB' ? 'bg-emerald-500/20 text-emerald-400' :
                          pos === 'WR' ? 'bg-blue-500/20 text-blue-400' :
                          pos === 'TE' ? 'bg-orange-500/20 text-orange-400' :
                          pos === 'FLEX' ? 'bg-purple-500/20 text-purple-400' :
                          pos === 'SUPER_FLEX' ? 'bg-pink-500/20 text-pink-400' :
                          pos === 'K' ? 'bg-yellow-500/20 text-yellow-400' :
                          pos === 'DEF' ? 'bg-zinc-700 text-slate-300' :
                          'bg-[#111111] text-[#888888]'
                        }`}
                      >
                        {pos === 'BN' ? 'Bench' : pos.replace('_', ' ')}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-medium text-[#888888] uppercase tracking-wide mb-3">Key Settings</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between items-center py-1.5 border-b border-[#111111]">
                      <span className="text-[#666666]">Playoff Teams</span>
                      <span className="text-white font-semibold">{league.settings?.playoff_teams || 6}</span>
                    </div>
                    <div className="flex justify-between items-center py-1.5 border-b border-[#111111]">
                      <span className="text-[#666666]">Trade Deadline</span>
                      <span className="text-white font-semibold">Week {league.settings?.trade_deadline || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between items-center py-1.5 border-b border-[#111111]">
                      <span className="text-[#666666]">Waiver Budget</span>
                      <span className="text-white font-semibold">${league.settings?.waiver_budget || 100}</span>
                    </div>
                    <div className="flex justify-between items-center py-1.5">
                      <span className="text-[#666666]">Taxi Slots</span>
                      <span className="text-white font-semibold">{league.settings?.taxi_slots || 0}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ── Divider ──────────────────────────────────────────────── */}
          <div className="border-t border-[#151515] mb-8" />

          {/* ── SYNC OPERATIONS ──────────────────────────────────────── */}
          <section className="mb-8">
            <p className="text-[10px] font-bold text-[#555555] tracking-[3px] uppercase mb-4">DATA SYNC</p>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
              {[
                { name: 'sync-ktc-values', type: 'ktc_values' },
                { name: 'sync-league-data', type: 'league_data' },
                { name: 'sync-players', type: 'players' },
                { name: 'sync-nfl-state', type: 'nfl_state' },
              ].map((job) => {
                const config = SYNC_TYPE_CONFIG[job.type];
                const cronJob = cronJobs?.find(c => c.jobname === job.name);
                const Icon = config?.icon || Database;

                return (
                  <div key={job.name} className="bg-[#0a0a0a] rounded-md p-3 sm:p-4 border border-[#151515]">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <Icon className={`w-3.5 h-3.5 ${config?.color || 'text-slate-400'}`} />
                        <span className="font-medium text-white text-xs">{config?.label || job.name}</span>
                      </div>
                      {cronJob?.active && (
                        <span className="px-1.5 py-0.5 text-[9px] bg-emerald-500/20 text-emerald-400 rounded">
                          Active
                        </span>
                      )}
                    </div>

                    <p className="text-[10px] text-[#555555] mb-2 hidden sm:block">
                      {CRON_DESCRIPTIONS[job.name] || cronJob?.schedule}
                    </p>

                    <button
                      onClick={() => triggerSync.mutate(job.name)}
                      disabled={triggeringSync === job.name}
                      className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 bg-accent-500 hover:bg-accent-400 disabled:opacity-50 rounded-md text-xs text-white font-medium transition-colors"
                    >
                      {triggeringSync === job.name ? (
                        <RefreshCw className="w-3 h-3 animate-spin" />
                      ) : (
                        <Play className="w-3 h-3" />
                      )}
                      Run Now
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── RECENT SYNC LOGS ─────────────────────────────────────── */}
          {syncLogs && syncLogs.length > 0 && (
            <section className="mb-8">
              <p className="text-[10px] font-bold text-[#555555] tracking-[3px] uppercase mb-4">RECENT SYNC LOG</p>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#151515]">
                      <th className="px-3 py-2 text-left text-[10px] font-medium text-[#555555]">Type</th>
                      <th className="px-3 py-2 text-left text-[10px] font-medium text-[#555555]">Status</th>
                      <th className="hidden sm:table-cell px-3 py-2 text-left text-[10px] font-medium text-[#555555]">Started</th>
                      <th className="px-3 py-2 text-right text-[10px] font-medium text-[#555555]">Duration</th>
                      <th className="hidden sm:table-cell px-3 py-2 text-right text-[10px] font-medium text-[#555555]">Records</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#111111]">
                    {syncLogs.map((log) => {
                      const config = SYNC_TYPE_CONFIG[log.sync_type];
                      const Icon = config?.icon || Database;

                      return (
                        <tr key={log.id} className="hover:bg-[#0a0a0a] transition-colors">
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              <Icon className={`w-3 h-3 ${config?.color || 'text-slate-400'}`} />
                              <span className="text-white text-xs">{config?.label || log.sync_type}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              {getStatusIcon(log.status)}
                              <span className="text-[#888888] capitalize text-xs hidden sm:inline">{log.status}</span>
                            </div>
                          </td>
                          <td className="hidden sm:table-cell px-3 py-2 text-[#888888] text-xs">
                            {formatTime(log.started_at)}
                          </td>
                          <td className="px-3 py-2 text-right text-[#888888] text-xs">
                            {formatDuration(log.started_at, log.completed_at)}
                          </td>
                          <td className="hidden sm:table-cell px-3 py-2 text-right">
                            <span className="text-accent-400 font-medium text-xs">
                              {log.records_processed ?? '-'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* ── CRON RUNS ─────────────────────────────────────────────── */}
          {cronRuns && cronRuns.length > 0 && (
            <section className="mb-8">
              <p className="text-[10px] font-bold text-[#555555] tracking-[3px] uppercase mb-4">CRON EXECUTIONS</p>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#151515]">
                      <th className="px-3 py-2 text-left text-[10px] font-medium text-[#555555]">Job</th>
                      <th className="px-3 py-2 text-left text-[10px] font-medium text-[#555555]">Status</th>
                      <th className="hidden sm:table-cell px-3 py-2 text-left text-[10px] font-medium text-[#555555]">Started</th>
                      <th className="px-3 py-2 text-right text-[10px] font-medium text-[#555555]">Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#111111]">
                    {cronRuns.map((run) => (
                      <tr key={run.runid} className="hover:bg-[#0a0a0a] transition-colors">
                        <td className="px-3 py-2 text-white text-xs">{run.jobname}</td>
                        <td className="px-3 py-2">
                          <span className={`px-1.5 py-0.5 text-[10px] rounded ${
                            run.status === 'succeeded' ? 'bg-emerald-500/20 text-emerald-400' :
                            run.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                            'bg-blue-500/20 text-blue-400'
                          }`}>
                            {run.status}
                          </span>
                        </td>
                        <td className="hidden sm:table-cell px-3 py-2 text-[#888888] text-xs">
                          {formatTime(run.start_time)}
                        </td>
                        <td className="px-3 py-2 text-right text-[#888888] text-xs">
                          {run.duration_seconds ? `${run.duration_seconds.toFixed(1)}s` : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* ── Divider ──────────────────────────────────────────────── */}
          <div className="border-t border-[#151515] mb-8" />

          {/* ── DATABASE STATISTICS ──────────────────────────────────── */}
          {stats && (
            <section className="mb-8">
              <p className="text-[10px] font-bold text-[#555555] tracking-[3px] uppercase mb-4">DATABASE</p>

              <div className="flex items-center gap-2 mb-4">
                <Database className="h-4 w-4 text-[#555555]" />
                <p className="text-xs text-[#555555]">Records synced from Sleeper API</p>
              </div>

              <div className="grid grid-cols-4 gap-2 sm:gap-3">
                <div className="bg-[#0a0a0a] rounded-md p-2 sm:p-3 text-center border border-[#151515]">
                  <div className="text-lg sm:text-xl font-bold text-white">{stats.users}</div>
                  <div className="text-[10px] text-[#555555] mt-0.5 font-medium">Users</div>
                </div>
                <div className="bg-[#0a0a0a] rounded-md p-2 sm:p-3 text-center border border-[#151515]">
                  <div className="text-lg sm:text-xl font-bold text-white">{stats.rosters}</div>
                  <div className="text-[10px] text-[#555555] mt-0.5 font-medium">Rosters</div>
                </div>
                <div className="bg-[#0a0a0a] rounded-md p-2 sm:p-3 text-center border border-[#151515]">
                  <div className="text-lg sm:text-xl font-bold text-white">{stats.transactions}</div>
                  <div className="text-[10px] text-[#555555] mt-0.5 font-medium">Trans</div>
                </div>
                <div className="bg-[#0a0a0a] rounded-md p-2 sm:p-3 text-center border border-[#151515]">
                  <div className="text-lg sm:text-xl font-bold text-white">{stats.drafts}</div>
                  <div className="text-[10px] text-[#555555] mt-0.5 font-medium">Drafts</div>
                </div>
                <div className="bg-[#0a0a0a] rounded-md p-2 sm:p-3 text-center border border-[#151515]">
                  <div className="text-lg sm:text-xl font-bold text-white">{stats.draftPicks}</div>
                  <div className="text-[10px] text-[#555555] mt-0.5 font-medium">Picks</div>
                </div>
                <div className="bg-[#0a0a0a] rounded-md p-2 sm:p-3 text-center border border-[#151515]">
                  <div className="text-lg sm:text-xl font-bold text-white">{stats.tradedPicks}</div>
                  <div className="text-[10px] text-[#555555] mt-0.5 font-medium">Traded</div>
                </div>
                <div className="col-span-2 bg-emerald-500/10 rounded-md p-2 sm:p-3 text-center border border-emerald-500/30">
                  <div className="text-lg sm:text-xl font-bold text-emerald-400">
                    {stats.users + stats.rosters + stats.transactions + stats.drafts + stats.draftPicks + stats.tradedPicks}
                  </div>
                  <div className="text-[10px] text-emerald-400 mt-0.5 font-medium">Total Records</div>
                </div>
              </div>
            </section>
          )}
        </>
      ) : (
        <div className="bg-amber-500/10 rounded-md border border-amber-500/30 p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-500/20 rounded-md flex items-center justify-center">
              <Database className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <h3 className="font-semibold text-white">No League Data</h3>
              <p className="text-sm text-[#888888] mt-1">
                No league data found in the database. Please contact the administrator to populate the data.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
