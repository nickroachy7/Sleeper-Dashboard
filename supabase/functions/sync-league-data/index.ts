/**
 * Edge Function: sync-league-data
 *
 * Syncs rosters, league users, transactions, traded picks, matchups, and drafts
 * from Sleeper API for EVERY tracked league (each dynasty's current + historical
 * seasons, linked via previous_league_id).
 *
 * The set of leagues to sync lives in `tracked_leagues` — visitors add leagues
 * via the `add-league` function, and this cron keeps them all fresh.
 *
 * Scheduled to run every 6 hours.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createServiceClient } from "../_shared/supabase-client.ts";
import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { startSyncLog } from "../_shared/sync-logger.ts";
import { syncLeagueChain, getCurrentWeek, type SyncResult } from "../_shared/sync-league.ts";

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const startTime = Date.now();
    const supabase = createServiceClient();

    // Which leagues to sync? Every tracked root league. Fall back to the
    // most-recent league row for backward compatibility if the registry is
    // empty (e.g. immediately after this migration, before backfill).
    const { data: tracked } = await supabase
      .from("tracked_leagues")
      .select("root_league_id")
      .order("added_at", { ascending: true });

    let rootLeagueIds = (tracked ?? []).map((t) => t.root_league_id as string);

    if (rootLeagueIds.length === 0) {
      const { data: fallback } = await supabase
        .from("leagues")
        .select("league_id")
        .order("season", { ascending: false })
        .limit(1)
        .single();
      if (fallback?.league_id) rootLeagueIds = [fallback.league_id];
    }

    if (rootLeagueIds.length === 0) {
      throw new Error("No tracked leagues and no league rows to sync");
    }

    const syncLog = await startSyncLog(supabase, "league_data", rootLeagueIds[0]);
    const currentWeek = await getCurrentWeek();

    const totals: SyncResult = {
      rosters: 0, leagueUsers: 0, transactions: 0, tradedPicks: 0, matchups: 0, drafts: 0, draftPicks: 0,
    };
    const perLeague: Array<{ rootLeagueId: string; seasonsProcessed: number; ok: boolean; error?: string }> = [];

    for (const rootLeagueId of rootLeagueIds) {
      try {
        const outcome = await syncLeagueChain(supabase, rootLeagueId, currentWeek);
        totals.rosters += outcome.result.rosters;
        totals.leagueUsers += outcome.result.leagueUsers;
        totals.transactions += outcome.result.transactions;
        totals.tradedPicks += outcome.result.tradedPicks;
        totals.matchups += outcome.result.matchups;
        totals.drafts += outcome.result.drafts;
        totals.draftPicks += outcome.result.draftPicks;
        perLeague.push({ rootLeagueId, seasonsProcessed: outcome.seasonsProcessed, ok: true });

        // Best-effort bookkeeping — never let a tracked_leagues update fail the run.
        await supabase
          .from("tracked_leagues")
          .update({ last_synced_at: new Date().toISOString(), last_sync_status: "ok", sync_error: null })
          .eq("root_league_id", rootLeagueId);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`Failed syncing league ${rootLeagueId}:`, msg);
        perLeague.push({ rootLeagueId, seasonsProcessed: 0, ok: false, error: msg });
        await supabase
          .from("tracked_leagues")
          .update({ last_synced_at: new Date().toISOString(), last_sync_status: "error", sync_error: msg })
          .eq("root_league_id", rootLeagueId);
      }
    }

    const totalRecords =
      totals.rosters + totals.leagueUsers + totals.transactions + totals.tradedPicks +
      totals.matchups + totals.drafts + totals.draftPicks;

    await syncLog.complete(totalRecords);

    return jsonResponse({
      success: true,
      leaguesProcessed: rootLeagueIds.length,
      perLeague,
      ...totals,
      totalRecords,
      durationMs: Date.now() - startTime,
    });
  } catch (error) {
    console.error("Error syncing league data:", error);
    return errorResponse(error);
  }
});
