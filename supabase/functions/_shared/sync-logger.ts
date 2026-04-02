import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export interface SyncLogger {
  id: string | null;
  complete(recordsProcessed: number): Promise<void>;
  fail(errorMessage: string): Promise<void>;
}

export async function startSyncLog(
  supabase: SupabaseClient,
  syncType: string,
  leagueId?: string
): Promise<SyncLogger> {
  const { data: syncLog } = await supabase
    .from("sync_log")
    .insert({
      sync_type: syncType,
      league_id: leagueId || null,
      status: "running",
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  const id = syncLog?.id || null;

  return {
    id,
    async complete(recordsProcessed: number) {
      if (!id) return;
      await supabase
        .from("sync_log")
        .update({
          status: "completed",
          records_processed: recordsProcessed,
          completed_at: new Date().toISOString(),
        })
        .eq("id", id);
    },
    async fail(errorMessage: string) {
      if (!id) return;
      await supabase
        .from("sync_log")
        .update({
          status: "failed",
          error_message: errorMessage,
          completed_at: new Date().toISOString(),
        })
        .eq("id", id);
    },
  };
}
