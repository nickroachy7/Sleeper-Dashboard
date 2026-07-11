/**
 * Edge Function: sync-players
 *
 * Syncs all NFL players from Sleeper API to the database.
 * Scheduled to run weekly on Mondays at 8 AM ET (12:00 UTC)
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createServiceClient } from "../_shared/supabase-client.ts";
import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { fetchWithRetry } from "../_shared/fetch-with-retry.ts";
import { startSyncLog } from "../_shared/sync-logger.ts";

const SLEEPER_API = "https://api.sleeper.app/v1";
// Every rosterable position across offense, kicker, team defense, AND IDP, so
// the shared players table is comprehensive for ALL league types (an IDP league
// rosters DB/LB/DL players that offense-only leagues never referenced). Only
// non-rosterable line/special-teams positions (OL, LS, P long snappers) are
// excluded to keep the table lean.
const ROSTERABLE_POSITIONS = [
  "QB", "RB", "FB", "WR", "TE", "K", "DEF",
  // IDP — Sleeper's defensive position codes
  "DL", "DE", "DT", "NT", "EDGE",
  "LB", "ILB", "OLB", "MLB",
  "DB", "CB", "S", "SS", "FS",
];
const BATCH_SIZE = 100;

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const startTime = Date.now();
    const supabase = createServiceClient();
    const syncLog = await startSyncLog(supabase, "players");

    // Fetch all players from Sleeper
    console.log("Fetching all players from Sleeper API...");
    const allPlayers = await fetchWithRetry(`${SLEEPER_API}/players/nfl`);
    const playerIds = Object.keys(allPlayers);
    console.log(`Fetched ${playerIds.length} total players`);

    // Get existing roster players to prioritize them
    const { data: rosters } = await supabase.from("rosters").select("players");
    const rosteredPlayerIds = new Set<string>();
    rosters?.forEach((roster) => {
      roster.players?.forEach((id: string) => rosteredPlayerIds.add(id));
    });

    // Get player IDs from all transactions (adds and drops)
    const { data: transactions } = await supabase.from("transactions").select("adds, drops");
    const transactionPlayerIds = new Set<string>();
    transactions?.forEach((tx) => {
      if (tx.adds) {
        Object.keys(tx.adds as Record<string, unknown>).forEach((id) => transactionPlayerIds.add(id));
      }
      if (tx.drops) {
        Object.keys(tx.drops as Record<string, unknown>).forEach((id) => transactionPlayerIds.add(id));
      }
    });
    console.log(`Found ${transactionPlayerIds.size} unique players in transactions`);

    // Get player IDs from draft picks
    const { data: draftPicks } = await supabase.from("draft_picks").select("player_id");
    const draftPlayerIds = new Set<string>();
    draftPicks?.forEach((pick) => {
      if (pick.player_id) draftPlayerIds.add(pick.player_id);
    });
    console.log(`Found ${draftPlayerIds.size} unique players in draft picks`);

    // Filter to relevant players
    const relevantPlayers = playerIds.filter((id) => {
      const player = allPlayers[id];
      return (
        rosteredPlayerIds.has(id) ||
        transactionPlayerIds.has(id) ||
        draftPlayerIds.has(id) ||
        (ROSTERABLE_POSITIONS.includes(player.position) && (player.status === "Active" || player.status === "Inactive") && !!player.team)
      );
    });
    console.log(`Filtering to ${relevantPlayers.length} relevant players`);

    // Prepare player records
    const playerRecords = relevantPlayers.map((id) => {
      const p = allPlayers[id];
      return {
        player_id: id,
        first_name: p.first_name || null,
        last_name: p.last_name || null,
        full_name: p.full_name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || null,
        position: p.position || null,
        team: p.team || null,
        age: p.age || null,
        years_exp: p.years_exp || null,
        college: p.college || null,
        height: p.height || null,
        weight: p.weight || null,
        number: p.number || null,
        status: p.status || null,
        injury_status: p.injury_status || null,
        fantasy_positions: p.fantasy_positions || null,
        search_full_name: p.search_full_name || null,
        metadata: {
          depth_chart_position: p.depth_chart_position,
          depth_chart_order: p.depth_chart_order,
          news_updated: p.news_updated,
          sport: p.sport,
        },
        updated_at: new Date().toISOString(),
      };
    });

    // Batch upsert
    let upserted = 0;
    let errors = 0;

    for (let i = 0; i < playerRecords.length; i += BATCH_SIZE) {
      const batch = playerRecords.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.from("players").upsert(batch, {
        onConflict: "player_id",
        ignoreDuplicates: false,
      });

      if (error) {
        console.error(`Batch error at ${i}:`, error.message);
        errors++;
      } else {
        upserted += batch.length;
      }
    }

    await syncLog.complete(upserted);

    return jsonResponse({
      success: true,
      totalFromApi: playerIds.length,
      relevantPlayers: relevantPlayers.length,
      upserted,
      errors,
      durationMs: Date.now() - startTime,
    });
  } catch (error) {
    console.error("Error syncing players:", error);
    return errorResponse(error);
  }
});
