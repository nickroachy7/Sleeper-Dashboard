/**
 * Edge Function: sync-transactions-live
 *
 * Lightweight transaction poller — fetches only the current week's transactions
 * from the Sleeper API and upserts new ones into the database.
 *
 * Designed to run every 5 minutes via pg_cron for near-real-time trade detection.
 * Much faster than the full sync-league-data function since it skips rosters,
 * matchups, drafts, and historical leagues.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createServiceClient } from "../_shared/supabase-client.ts";
import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { fetchWithRetry } from "../_shared/fetch-with-retry.ts";
import { startSyncLog } from "../_shared/sync-logger.ts";

const SLEEPER_API = "https://api.sleeper.app/v1";

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const startTime = Date.now();
    const supabase = createServiceClient();

    // 1. Get the most recent league
    const { data: league, error: leagueError } = await supabase
      .from("leagues")
      .select("league_id")
      .order("season", { ascending: false })
      .limit(1)
      .single();

    if (leagueError || !league) {
      throw new Error("No league found in database");
    }

    const leagueId = league.league_id;
    const syncLog = await startSyncLog(supabase, "transactions_live", leagueId);

    // 2. Get current NFL week
    const nflState = await fetchWithRetry(`${SLEEPER_API}/state/nfl`);
    const currentWeek = nflState?.week || 1;

    // 3. Fetch transactions for current week and the week before (catches stragglers)
    let totalUpserted = 0;
    const weeksToCheck = [currentWeek, Math.max(0, currentWeek - 1)];

    for (const week of weeksToCheck) {
      const transactions = await fetchWithRetry(
        `${SLEEPER_API}/league/${leagueId}/transactions/${week}`
      );

      if (transactions?.length) {
        const txRows = transactions.map((tx: any) => ({
          transaction_id: tx.transaction_id,
          league_id: leagueId,
          type: tx.type,
          status: tx.status,
          week: tx.leg || week,
          roster_ids: tx.roster_ids,
          adds: tx.adds,
          drops: tx.drops,
          draft_picks: tx.draft_picks,
          waiver_budget: tx.waiver_budget,
          settings: tx.settings,
          metadata: tx.metadata,
          creator: tx.creator,
          consenter_ids: tx.consenter_ids,
          status_updated: tx.status_updated,
          created: tx.created,
        }));

        const { error } = await supabase.from("transactions").upsert(txRows, {
          onConflict: "transaction_id",
          ignoreDuplicates: false,
        });

        if (!error) totalUpserted += txRows.length;
        else console.error(`Transaction upsert error (week ${week}):`, error);
      }
    }

    // 4. Also refresh rosters (lightweight — single API call) so trade impacts show immediately
    try {
      const rosters = await fetchWithRetry(`${SLEEPER_API}/league/${leagueId}/rosters`);
      if (rosters?.length) {
        const rosterRows = rosters.map((roster: any) => ({
          roster_id: roster.roster_id,
          league_id: leagueId,
          owner_id: roster.owner_id,
          players: roster.players || [],
          starters: roster.starters || [],
          reserve: roster.reserve || [],
          wins: roster.settings?.wins || 0,
          losses: roster.settings?.losses || 0,
          ties: roster.settings?.ties || 0,
          fpts: roster.settings?.fpts || 0,
          fpts_decimal: roster.settings?.fpts_decimal || 0,
          fpts_against: roster.settings?.fpts_against || 0,
          fpts_against_decimal: roster.settings?.fpts_against_decimal || 0,
          total_moves: roster.settings?.total_moves || 0,
          waiver_position: roster.settings?.waiver_position,
          waiver_budget_used: roster.settings?.waiver_budget_used || 0,
          settings: roster.settings,
          updated_at: new Date().toISOString(),
        }));
        await supabase.from("rosters").upsert(rosterRows, {
          onConflict: "league_id,roster_id",
          ignoreDuplicates: false,
        });
      }
    } catch (e) {
      // Non-fatal — transactions are the priority
      console.error("Error refreshing rosters:", e);
    }

    // 5. Also refresh traded picks so trade finder stays current
    try {
      const tradedPicks = await fetchWithRetry(`${SLEEPER_API}/league/${leagueId}/traded_picks`);
      if (tradedPicks?.length) {
        await supabase.from("traded_picks").delete().eq("league_id", leagueId);
        const picksToInsert = tradedPicks.map((pick: any) => ({
          league_id: leagueId,
          season: pick.season,
          round: pick.round,
          roster_id: pick.roster_id,
          previous_owner_id: pick.previous_owner_id,
          owner_id: pick.owner_id,
        }));
        await supabase.from("traded_picks").insert(picksToInsert);
      }
    } catch (e) {
      console.error("Error refreshing traded picks:", e);
    }

    await syncLog.complete(totalUpserted);

    return jsonResponse({
      success: true,
      leagueId,
      week: currentWeek,
      transactionsProcessed: totalUpserted,
      durationMs: Date.now() - startTime,
    });
  } catch (error) {
    console.error("Error in live transaction sync:", error);
    return errorResponse(error);
  }
});
