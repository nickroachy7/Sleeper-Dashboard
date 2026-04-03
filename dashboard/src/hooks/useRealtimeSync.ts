/**
 * useRealtimeSync — Subscribes to Supabase Realtime changes on key tables
 * and automatically invalidates React Query caches so the UI stays current.
 *
 * Tables monitored:
 * - transactions: trades, waivers, roster moves
 * - rosters: roster composition changes (post-trade)
 * - traded_picks: draft pick ownership changes
 *
 * Mount this once at the app root (e.g., in App.tsx or Layout.tsx).
 */

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useRealtimeSync() {
  const queryClient = useQueryClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    const channel = supabase
      .channel('db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions' },
        () => {
          // Invalidate transaction-related queries
          queryClient.invalidateQueries({ queryKey: ['transactions'] });
          queryClient.invalidateQueries({ queryKey: ['home-recent-trades'] });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rosters' },
        () => {
          // Invalidate roster-related queries (power rankings, trade finder, etc.)
          queryClient.invalidateQueries({ queryKey: ['rosters'] });
          queryClient.invalidateQueries({ queryKey: ['home-rosters'] });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'traded_picks' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['tradedPicks'] });
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [queryClient]);
}
