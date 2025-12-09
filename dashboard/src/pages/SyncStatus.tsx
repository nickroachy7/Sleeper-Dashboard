import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { 
  RefreshCw, 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  Play,
  Calendar,
  Database,
  Users,
  Crown,
  Activity
} from 'lucide-react';

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

async function fetchSyncLogs(): Promise<SyncLog[]> {
  const { data, error } = await supabase
    .from('sync_log')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(50);

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
    .limit(20);

  if (error) {
    console.warn('Could not fetch cron runs:', error.message);
    return [];
  }
  return data || [];
}

export function SyncStatus() {
  const queryClient = useQueryClient();
  const [triggeringSync, setTriggeringSync] = useState<string | null>(null);

  const { data: syncLogs, isLoading: logsLoading } = useQuery({
    queryKey: ['syncLogs'],
    queryFn: fetchSyncLogs,
    refetchInterval: 30000, // Refresh every 30 seconds
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
        return <CheckCircle className="w-5 h-5 text-green-400" />;
      case 'completed_with_errors':
        return <AlertCircle className="w-5 h-5 text-yellow-400" />;
      case 'running':
        return <RefreshCw className="w-5 h-5 text-blue-400 animate-spin" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-400" />;
      default:
        return <Clock className="w-5 h-5 text-slate-400" />;
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

  if (logsLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12 border-b-2 border-accent-500"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-4 sm:mb-6 flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2 sm:gap-3">
            <RefreshCw className="w-6 h-6 sm:w-7 sm:h-7 text-blue-500" />
            Sync Status
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-xs sm:text-sm">
            Monitor automated data sync operations
          </p>
        </div>
      </div>

      {/* Scheduled Jobs */}
      <div className="mb-4 sm:mb-6 bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-700 p-3 sm:p-5 shadow-sm dark:shadow-none">
        <h2 className="text-sm sm:text-lg font-semibold text-slate-900 dark:text-white mb-3 sm:mb-4 flex items-center gap-2">
          <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-purple-500 dark:text-purple-400" />
          Scheduled Sync Jobs
        </h2>
        
        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
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
              <div 
                key={job.name}
                className="bg-slate-50 dark:bg-zinc-800 rounded-lg p-2.5 sm:p-4 border border-slate-200 dark:border-zinc-700"
              >
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <Icon className={`w-4 h-4 sm:w-5 sm:h-5 ${config?.color || 'text-slate-400'}`} />
                    <span className="font-medium text-slate-900 dark:text-white text-xs sm:text-sm">{config?.label || job.name}</span>
                  </div>
                  {cronJob?.active && (
                    <span className="px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-xs bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 rounded">
                      Active
                    </span>
                  )}
                </div>
                
                <p className="text-[10px] sm:text-sm text-slate-500 dark:text-slate-400 mb-2 sm:mb-3 hidden sm:block">
                  {CRON_DESCRIPTIONS[job.name] || cronJob?.schedule}
                </p>
                
                <button
                  onClick={() => triggerSync.mutate(job.name)}
                  disabled={triggeringSync === job.name}
                  className="w-full flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 bg-accent-600 hover:bg-accent-700 disabled:opacity-50 rounded-lg text-xs sm:text-sm text-white font-medium transition-colors"
                >
                  {triggeringSync === job.name ? (
                    <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
                  ) : (
                    <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  )}
                  <span className="hidden sm:inline">Run Now</span>
                  <span className="sm:hidden">Run</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent Sync Operations */}
      <div className="mt-4 sm:mt-6 bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-700 shadow-sm dark:shadow-none overflow-hidden">
        <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-zinc-700">
          <h2 className="text-sm sm:text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500 dark:text-blue-400" />
            Recent Sync Operations
          </h2>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 dark:border-zinc-700">
                <th className="px-2 sm:px-5 py-2 sm:py-4 text-left text-[10px] sm:text-sm font-medium text-slate-500 dark:text-slate-400">Type</th>
                <th className="px-2 sm:px-5 py-2 sm:py-4 text-left text-[10px] sm:text-sm font-medium text-slate-500 dark:text-slate-400">Status</th>
                <th className="hidden sm:table-cell px-5 py-4 text-left text-sm font-medium text-slate-500 dark:text-slate-400">Started</th>
                <th className="px-2 sm:px-5 py-2 sm:py-4 text-right text-[10px] sm:text-sm font-medium text-slate-500 dark:text-slate-400">Duration</th>
                <th className="hidden sm:table-cell px-5 py-4 text-right text-sm font-medium text-slate-500 dark:text-slate-400">Records</th>
                <th className="hidden sm:table-cell px-5 py-4 text-left text-sm font-medium text-slate-500 dark:text-slate-400">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
              {syncLogs && syncLogs.length > 0 ? (
                syncLogs.map((log) => {
                  const config = SYNC_TYPE_CONFIG[log.sync_type];
                  const Icon = config?.icon || Database;
                  
                  return (
                    <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors">
                      <td className="px-2 sm:px-4 py-2 sm:py-3">
                        <div className="flex items-center gap-1.5 sm:gap-2">
                          <Icon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${config?.color || 'text-slate-400'}`} />
                          <span className="text-slate-900 dark:text-white text-[10px] sm:text-sm">{config?.label || log.sync_type}</span>
                        </div>
                      </td>
                      <td className="px-2 sm:px-4 py-2 sm:py-3">
                        <div className="flex items-center gap-1.5 sm:gap-2">
                          {getStatusIcon(log.status)}
                          <span className="text-slate-600 dark:text-slate-300 capitalize text-[10px] sm:text-sm hidden sm:inline">{log.status}</span>
                        </div>
                      </td>
                      <td className="hidden sm:table-cell px-4 py-3 text-slate-600 dark:text-slate-300 text-sm">
                        {formatTime(log.started_at)}
                      </td>
                      <td className="px-2 sm:px-4 py-2 sm:py-3 text-right text-slate-600 dark:text-slate-300 text-[10px] sm:text-sm">
                        {formatDuration(log.started_at, log.completed_at)}
                      </td>
                      <td className="hidden sm:table-cell px-4 py-3 text-right">
                        <span className="text-accent-600 dark:text-accent-400 font-medium text-sm">
                          {log.records_processed ?? '-'}
                        </span>
                      </td>
                      <td className="hidden sm:table-cell px-4 py-3">
                        {log.error_message && (
                          <span className="text-sm text-red-600 dark:text-red-400">{log.error_message}</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400 dark:text-slate-500">
                    No sync operations recorded yet. Click "Run Now" on any job above to start.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cron Job Runs (if available) */}
      {cronRuns && cronRuns.length > 0 && (
        <div className="mt-4 sm:mt-6 bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-700 shadow-sm dark:shadow-none overflow-hidden">
          <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-zinc-700">
            <h2 className="text-sm sm:text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Activity className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-500 dark:text-emerald-400" />
              Cron Job Executions
            </h2>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 dark:border-zinc-700">
                  <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-[10px] sm:text-sm font-medium text-slate-500 dark:text-slate-400">Job</th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-[10px] sm:text-sm font-medium text-slate-500 dark:text-slate-400">Status</th>
                  <th className="hidden sm:table-cell px-4 py-3 text-left text-sm font-medium text-slate-500 dark:text-slate-400">Started</th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-[10px] sm:text-sm font-medium text-slate-500 dark:text-slate-400">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                {cronRuns.map((run) => (
                  <tr key={run.runid} className="hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors">
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-slate-900 dark:text-white text-[10px] sm:text-sm">{run.jobname}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3">
                      <span className={`px-1.5 sm:px-2 py-0.5 sm:py-1 text-[10px] sm:text-xs rounded ${
                        run.status === 'succeeded' ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400' :
                        run.status === 'failed' ? 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400' :
                        'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400'
                      }`}>
                        {run.status}
                      </span>
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3 text-slate-600 dark:text-slate-300 text-sm">
                      {formatTime(run.start_time)}
                    </td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-right text-slate-600 dark:text-slate-300 text-[10px] sm:text-sm">
                      {run.duration_seconds ? `${run.duration_seconds.toFixed(1)}s` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Info Box */}
      <div className="mt-4 sm:mt-6 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-lg p-3 sm:p-5">
        <h3 className="font-medium text-blue-700 dark:text-blue-400 mb-2 text-sm sm:text-base">About Automated Syncs</h3>
        <ul className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 space-y-1">
          <li>• <strong>KTC Values:</strong> Dynasty player values from KeepTradeCut (daily at 6 AM ET)</li>
          <li>• <strong>League Data:</strong> Rosters, transactions, matchups from Sleeper (every 6 hours)</li>
          <li>• <strong>Players:</strong> Full player database refresh from Sleeper (Mondays 8 AM ET)</li>
          <li>• <strong>NFL State:</strong> Current week/season info from Sleeper (daily at 10 AM ET)</li>
        </ul>
      </div>
    </div>
  );
}
