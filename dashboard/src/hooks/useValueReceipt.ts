import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { VALUE_SOURCE } from '../lib/value-source';

// ── Value-move receipt ───────────────────────────────────────────────────────
// "Why did this value move?" A KTC-style black box just shows a number; YAP can
// show the receipt — how far the value moved over 7/30 days, which way the rank
// went, and (via a count-only RPC, when available) how many real trades and
// votes drove it. Transparency is the wedge against the incumbents.
//
// The WHAT (deltas, rank move) comes from player_value_history, which is
// publicly readable. The WHY (trade/vote counts) needs value_events, which has
// no public SELECT policy — so it's fetched through an optional SECURITY DEFINER
// RPC (`value_event_counts`) that returns counts only, never row data. If that
// RPC isn't deployed yet, the receipt still renders the WHAT and just omits the
// attribution line. This keeps the feature shippable ahead of the migration.

export interface ValueReceipt {
  valueNow: number;
  /** Signed change over the window; null when there's no comparison point. */
  d7: number | null;
  d30: number | null;
  rankNow: number | null;
  /** Rank ~30d ago (lower number = better); null when unknown. */
  rankPast: number | null;
  /** 'up' | 'down' | 'flat' over 30d (falls back to 7d). */
  direction: 'up' | 'down' | 'flat';
  /** Attribution over the last 7d, when the counts RPC is available. */
  why: { trades: number; votes: number } | null;
}

// Whether the optional value_event_counts RPC is deployed. Starts unknown;
// after the first call we cache the answer so we neither re-probe (a 404 per
// player spams the console) nor permanently give up before it's deployed.
let countsRpcAvailable: boolean | null = null;

/** Nearest history point at or before a target date (rows are date-ascending). */
function valueAsOf(rows: { date: string; value: number; rank: number | null }[], isoDate: string) {
  let hit: { value: number; rank: number | null } | null = null;
  for (const r of rows) {
    if (r.date <= isoDate) hit = { value: r.value, rank: r.rank };
    else break;
  }
  return hit;
}

export function useValueReceipt(playerId: string | undefined) {
  return useQuery({
    queryKey: ['value-receipt', playerId],
    enabled: !!playerId,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<ValueReceipt | null> => {
      const pid = playerId!;
      const { data: histRows } = await supabase
        .from('player_value_history')
        .select('date, value, rank')
        .eq('player_id', pid)
        .eq('source', VALUE_SOURCE)
        .order('date', { ascending: true });
      const hist = (histRows ?? []) as { date: string; value: number; rank: number | null }[];
      if (!hist.length) return null;

      const latest = hist[hist.length - 1];
      const iso = (daysAgo: number) => {
        const d = new Date(latest.date);
        d.setUTCDate(d.getUTCDate() - daysAgo);
        return d.toISOString().slice(0, 10);
      };
      const at7 = valueAsOf(hist, iso(7));
      const at30 = valueAsOf(hist, iso(30));
      const d7 = at7 ? latest.value - at7.value : null;
      const d30 = at30 ? latest.value - at30.value : null;
      const primary = d30 ?? d7 ?? 0;
      const direction = primary > 0 ? 'up' : primary < 0 ? 'down' : 'flat';

      // Optional attribution. The RPC may not exist yet (migration staged, not
      // deployed) and it isn't in the generated Database types, so call it
      // through an untyped client. Once we learn it's absent, stop probing so a
      // 404 doesn't fire for every player.
      let why: { trades: number; votes: number } | null = null;
      if (countsRpcAvailable !== false) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const rpc = (supabase as any).rpc('value_event_counts', { p_player_id: pid, p_since: iso(7) });
          const { data, error } = await rpc;
          if (error) {
            countsRpcAvailable = false;
          } else {
            countsRpcAvailable = true;
            const row = Array.isArray(data) ? data[0] : data;
            if (row && (typeof row.trades === 'number' || typeof row.votes === 'number')) {
              why = { trades: Number(row.trades) || 0, votes: Number(row.votes) || 0 };
            }
          }
        } catch {
          countsRpcAvailable = false; // RPC absent — WHAT still renders
        }
      }

      return {
        valueNow: latest.value,
        d7,
        d30,
        rankNow: latest.rank,
        rankPast: at30?.rank ?? null,
        direction,
        why,
      };
    },
  });
}
