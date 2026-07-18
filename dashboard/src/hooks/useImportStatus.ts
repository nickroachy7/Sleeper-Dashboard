import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useActiveLeague } from '../lib/active-league';

export interface ImportStatus {
  status: 'pending' | 'ok' | 'error' | 'unknown';
  error: string | null;
}

/**
 * Watches the active league's initial import. add-league responds immediately
 * while the multi-season ingest runs in the background, flipping
 * tracked_leagues.last_sync_status 'pending' → 'ok' | 'error'. While pending we
 * poll every few seconds; when it lands 'ok' we invalidate the app's cached
 * queries once so league data appears without a manual refresh.
 */
export function useImportStatus(): ImportStatus {
  const { activeLeagueId } = useActiveLeague();
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['import-status', activeLeagueId],
    enabled: !!activeLeagueId,
    queryFn: async (): Promise<ImportStatus> => {
      const { data: row } = await supabase
        .from('tracked_leagues')
        .select('last_sync_status, sync_error')
        .eq('root_league_id', activeLeagueId!)
        .maybeSingle();
      if (!row) return { status: 'unknown', error: null };
      const s = row.last_sync_status;
      return {
        status: s === 'pending' ? 'pending' : s === 'error' ? 'error' : 'ok',
        error: row.sync_error ?? null,
      };
    },
    refetchInterval: (query) => (query.state.data?.status === 'pending' ? 4000 : false),
  });

  // On the pending → ok transition, refresh everything league-shaped once.
  const prev = useRef<ImportStatus['status'] | null>(null);
  useEffect(() => {
    const cur = data?.status ?? null;
    if (prev.current === 'pending' && cur === 'ok') {
      queryClient.invalidateQueries();
    }
    prev.current = cur;
  }, [data?.status, queryClient]);

  return data ?? { status: 'unknown', error: null };
}
