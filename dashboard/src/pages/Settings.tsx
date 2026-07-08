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
  ChevronDown,
  ChevronRight,
  Settings2,
  Shield,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { StatCard } from '../components/StatCard';
import { PositionBadge } from '../components/PositionBadge';

// ─── Sync Types ─────────────────────────────────────────────────────

interface SyncLog {
  id: string;
  sync_type: string;
  league_id: string | null;
  status: string;
  records_processed: number | null;
  error_message: string | null;
  started_at: string | null;
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

const SYNC_TYPE_CONFIG: Record<string, { icon: typeof Database; label: string; color: string; syncType: string }> = {
  ktc_values: { icon: Crown, label: 'KTC Values', color: 'text-yellow-400', syncType: 'ktc_values' },
  league_data: { icon: Users, label: 'League Data', color: 'text-blue-400', syncType: 'league_data' },
  transactions_live: { icon: Zap, label: 'Live Transactions', color: 'text-orange-400', syncType: 'transactions_live' },
  players: { icon: Database, label: 'Players', color: 'text-green-400', syncType: 'players' },
  nfl_state: { icon: Activity, label: 'NFL State', color: 'text-purple-400', syncType: 'nfl_state' },
};

const CRON_DESCRIPTIONS: Record<string, string> = {
  'sync-ktc-values': 'Daily at 6 AM ET',
  'sync-league-data': 'Every 6 hours',
  'sync-transactions-live': 'Every 5 minutes',
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

// The sync.* views aren't in the generated public-schema types, so these two
// queries cast the response shape explicitly.
async function fetchCronJobs(): Promise<CronJob[]> {
  const { data, error } = (await supabase
    .from('sync.cron_jobs' as never)
    .select('*')) as { data: CronJob[] | null; error: { message: string } | null };
  if (error) {
    console.warn('Could not fetch cron jobs:', error.message);
    return [];
  }
  return data || [];
}

async function fetchCronRuns(): Promise<CronRun[]> {
  const { data, error } = (await supabase
    .from('sync.recent_runs' as never)
    .select('*')
    .limit(10)) as { data: CronRun[] | null; error: { message: string } | null };
  if (error) {
    console.warn('Could not fetch cron runs:', error.message);
    return [];
  }
  return data || [];
}

// ─── Helpers ────────────────────────────────────────────────────────

function getStatusIcon(status: string) {
  switch (status) {
    case 'completed':
      return <CheckCircle className="w-3.5 h-3.5 text-green-400" />;
    case 'completed_with_errors':
      return <AlertCircle className="w-3.5 h-3.5 text-yellow-400" />;
    case 'running':
      return <RefreshCw className="w-3.5 h-3.5 text-blue-400 animate-spin" />;
    case 'failed':
      return <XCircle className="w-3.5 h-3.5 text-red-400" />;
    default:
      return <Clock className="w-3.5 h-3.5 text-slate-400" />;
  }
}

function formatDuration(started: string, completed: string | null) {
  if (!completed) return 'In progress...';
  const duration = new Date(completed).getTime() - new Date(started).getTime();
  if (duration < 1000) return `${duration}ms`;
  if (duration < 60000) return `${(duration / 1000).toFixed(1)}s`;
  return `${(duration / 60000).toFixed(1)}m`;
}

function formatTime(timestamp: string) {
  return new Date(timestamp).toLocaleString();
}

function formatRelativeTime(timestamp: string) {
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ─── Component ──────────────────────────────────────────────────────

export default function Settings() {
  const queryClient = useQueryClient();
  const [triggeringSync, setTriggeringSync] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // League data
  const { data: league, isLoading } = useQuery({
    queryKey: ['league'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leagues')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1);
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
        users: users.count || 0,
        rosters: rosters.count || 0,
        transactions: transactions.count || 0,
        drafts: drafts.count || 0,
        draftPicks: draftPicks.count || 0,
        tradedPicks: tradedPicks.count || 0,
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

  // Get last successful sync per type from sync logs
  const getLastSync = (syncType: string) => {
    if (!syncLogs) return null;
    return syncLogs.find(
      (log) => log.sync_type === syncType && (log.status === 'completed' || log.status === 'completed_with_errors')
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen">
        <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <div className="flex items-center gap-3 text-[#888888]">
              <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 animate-spin" />
              <span className="text-sm">Loading settings...</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
        <PageHeader
          sectionLabel="System"
          title="Settings"
          subtitle="League connection and system configuration"
        />

        {league ? (
          <>
            {/* ══════════════════════════════════════════════════════════════ */}
            {/* LEAGUE SECTION                                               */}
            {/* ══════════════════════════════════════════════════════════════ */}

            <div className="flex items-center gap-2 mb-5">
              <Settings2 className="h-4 w-4 text-[#555555]" />
              <p className="text-[10px] font-bold text-[#555555] tracking-[3px] uppercase">LEAGUE</p>
            </div>

            {/* ── League Connection ──────────────────────────────────────── */}
            <section className="mb-6">
              <div className="bg-gradient-to-br from-emerald-500/10 to-teal-500/10 rounded-xl border border-emerald-500/30 p-5">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-emerald-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
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

            {/* ── League Settings ────────────────────────────────────────── */}
            <section className="mb-8">
              <div className="rounded-xl bg-[#0a0a0a] p-5">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div>
                    <h4 className="text-xs font-medium text-[#888888] uppercase tracking-wide mb-3">Roster Positions</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {league.roster_positions?.map((pos: string, i: number) => (
                        pos === 'BN' ? (
                          <span key={i} className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#111111] text-[#888888]">
                            Bench
                          </span>
                        ) : (
                          <PositionBadge key={i} position={pos} size="sm" />
                        )
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-medium text-[#888888] uppercase tracking-wide mb-3">Key Settings</h4>
                    <div className="space-y-0">
                      {(() => {
                        // Sleeper's league settings JSON blob
                        const settings = (league.settings ?? {}) as {
                          playoff_teams?: number;
                          trade_deadline?: number;
                          waiver_budget?: number;
                          taxi_slots?: number;
                        };
                        return [
                          { label: 'Playoff Teams', value: settings.playoff_teams || 6 },
                          { label: 'Trade Deadline', value: `Week ${settings.trade_deadline || 'N/A'}` },
                          { label: 'Waiver Budget', value: `$${settings.waiver_budget || 100}` },
                          { label: 'Taxi Slots', value: settings.taxi_slots || 0 },
                        ];
                      })().map(({ label, value }, i, arr) => (
                        <div
                          key={label}
                          className={`flex justify-between items-center py-2 ${i < arr.length - 1 ? 'border-b border-[#151515]' : ''}`}
                        >
                          <span className="text-sm text-[#666666]">{label}</span>
                          <span className="text-sm text-white font-semibold">{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* ADMIN SECTION (Collapsible)                                  */}
            {/* ══════════════════════════════════════════════════════════════ */}

            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 mb-5 group cursor-pointer"
            >
              <Shield className="h-4 w-4 text-[#555555] group-hover:text-[#888888] transition-colors" />
              <span className="text-[10px] font-bold text-[#555555] tracking-[3px] uppercase group-hover:text-[#888888] transition-colors">
                ADMIN
              </span>
              {showAdvanced ? (
                <ChevronDown className="h-3.5 w-3.5 text-[#555555] group-hover:text-[#888888] transition-colors" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-[#555555] group-hover:text-[#888888] transition-colors" />
              )}
            </button>

            {showAdvanced && (
              <div className="animate-smooth">
                {/* ── Sync Operations ──────────────────────────────────── */}
                <section className="mb-8">
                  <p className="text-[10px] font-bold text-[#444444] tracking-[2px] uppercase mb-4">DATA SYNC</p>

                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
                    {[
                      { name: 'sync-ktc-values', type: 'ktc_values' },
                      { name: 'sync-league-data', type: 'league_data' },
                      { name: 'sync-transactions-live', type: 'transactions_live' },
                      { name: 'sync-players', type: 'players' },
                      { name: 'sync-nfl-state', type: 'nfl_state' },
                    ].map((job) => {
                      const config = SYNC_TYPE_CONFIG[job.type];
                      const cronJob = cronJobs?.find(c => c.jobname === job.name);
                      const lastSync = getLastSync(job.type);
                      const Icon = config?.icon || Database;

                      return (
                        <div key={job.name} className="bg-[#0a0a0a] rounded-xl p-3 sm:p-4 transition-colors">
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-1.5">
                              <Icon className={`w-3.5 h-3.5 ${config?.color || 'text-slate-400'}`} />
                              <span className="font-medium text-white text-xs">{config?.label || job.name}</span>
                            </div>
                            {cronJob?.active && (
                              <span className="px-1.5 py-0.5 text-[9px] bg-emerald-500/20 text-emerald-400 rounded font-medium">
                                Active
                              </span>
                            )}
                          </div>

                          <p className="text-[10px] text-[#555555] mb-1 hidden sm:block">
                            {CRON_DESCRIPTIONS[job.name] || cronJob?.schedule}
                          </p>

                          {/* Last sync timestamp */}
                          <div className="flex items-center gap-1 mb-3">
                            {lastSync ? (
                              <>
                                {getStatusIcon(lastSync.status)}
                                <span className="text-[10px] text-[#666666]">
                                  {lastSync.completed_at ? formatRelativeTime(lastSync.completed_at) : 'running...'}
                                </span>
                              </>
                            ) : (
                              <>
                                <Clock className="w-3 h-3 text-[#333333]" />
                                <span className="text-[10px] text-[#444444]">No runs yet</span>
                              </>
                            )}
                          </div>

                          <button
                            onClick={() => triggerSync.mutate(job.name)}
                            disabled={triggeringSync === job.name}
                            className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 bg-accent-500 hover:bg-accent-400 disabled:opacity-50 rounded-lg text-xs text-white font-medium transition-colors cursor-pointer"
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

                {/* ── Recent Sync Logs ─────────────────────────────────── */}
                {syncLogs && syncLogs.length > 0 && (
                  <section className="mb-8">
                    <p className="text-[10px] font-bold text-[#444444] tracking-[2px] uppercase mb-4">RECENT SYNC LOG</p>

                    <div className="rounded-xl bg-[#0a0a0a] overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="bg-[#0a0a0a]">
                              <th className="px-3 py-2.5 text-left text-[10px] font-medium text-[#555555]">Type</th>
                              <th className="px-3 py-2.5 text-left text-[10px] font-medium text-[#555555]">Status</th>
                              <th className="hidden sm:table-cell px-3 py-2.5 text-left text-[10px] font-medium text-[#555555]">Started</th>
                              <th className="px-3 py-2.5 text-right text-[10px] font-medium text-[#555555]">Duration</th>
                              <th className="hidden sm:table-cell px-3 py-2.5 text-right text-[10px] font-medium text-[#555555]">Records</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#111111]">
                            {syncLogs.map((log) => {
                              const config = SYNC_TYPE_CONFIG[log.sync_type];
                              const LogIcon = config?.icon || Database;

                              return (
                                <tr key={log.id} className="hover:bg-[#0a0a0a] transition-colors">
                                  <td className="px-3 py-2">
                                    <div className="flex items-center gap-1.5">
                                      <LogIcon className={`w-3 h-3 ${config?.color || 'text-slate-400'}`} />
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
                                    {log.started_at ? formatTime(log.started_at) : '-'}
                                  </td>
                                  <td className="px-3 py-2 text-right text-[#888888] text-xs">
                                    {log.started_at ? formatDuration(log.started_at, log.completed_at) : '-'}
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
                    </div>
                  </section>
                )}

                {/* ── Cron Runs ─────────────────────────────────────────── */}
                {cronRuns && cronRuns.length > 0 && (
                  <section className="mb-8">
                    <p className="text-[10px] font-bold text-[#444444] tracking-[2px] uppercase mb-4">CRON EXECUTIONS</p>

                    <div className="rounded-xl bg-[#0a0a0a] overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="bg-[#0a0a0a]">
                              <th className="px-3 py-2.5 text-left text-[10px] font-medium text-[#555555]">Job</th>
                              <th className="px-3 py-2.5 text-left text-[10px] font-medium text-[#555555]">Status</th>
                              <th className="hidden sm:table-cell px-3 py-2.5 text-left text-[10px] font-medium text-[#555555]">Started</th>
                              <th className="px-3 py-2.5 text-right text-[10px] font-medium text-[#555555]">Duration</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#111111]">
                            {cronRuns.map((run) => (
                              <tr key={run.runid} className="hover:bg-[#0a0a0a] transition-colors">
                                <td className="px-3 py-2 text-white text-xs">{run.jobname}</td>
                                <td className="px-3 py-2">
                                  <span className={`px-1.5 py-0.5 text-[10px] rounded font-medium ${
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
                    </div>
                  </section>
                )}

                {/* ── Database Statistics ────────────────────────────────── */}
                {stats && (
                  <section className="mb-8">
                    <p className="text-[10px] font-bold text-[#444444] tracking-[2px] uppercase mb-4">DATABASE</p>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
                      <StatCard label="Users" value={stats.users} icon={Users} accentColor="purple" />
                      <StatCard label="Rosters" value={stats.rosters} icon={Users} accentColor="blue" />
                      <StatCard label="Transactions" value={stats.transactions} icon={Activity} accentColor="green" />
                      <StatCard label="Drafts" value={stats.drafts} icon={Trophy} accentColor="gold" />
                      <StatCard label="Draft Picks" value={stats.draftPicks} icon={Database} accentColor="default" />
                      <StatCard label="Traded Picks" value={stats.tradedPicks} icon={RefreshCw} accentColor="default" />
                    </div>

                    <div className="mt-3 bg-emerald-500/10 rounded-xl border border-emerald-500/30 p-4 text-center">
                      <div className="text-2xl font-extrabold text-emerald-400">
                        {(stats.users + stats.rosters + stats.transactions + stats.drafts + stats.draftPicks + stats.tradedPicks).toLocaleString()}
                      </div>
                      <div className="text-[10px] text-emerald-400/80 mt-1 font-bold tracking-[2px] uppercase">Total Records</div>
                    </div>
                  </section>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="bg-amber-500/10 rounded-xl border border-amber-500/30 p-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-500/20 rounded-lg flex items-center justify-center">
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
    </div>
  );
}
