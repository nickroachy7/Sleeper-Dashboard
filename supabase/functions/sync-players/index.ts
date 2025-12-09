/**
 * Edge Function: sync-players
 * 
 * Syncs all NFL players from Sleeper API to the database.
 * Scheduled to run weekly on Mondays at 8 AM ET (12:00 UTC)
 * 
 * This is a heavier operation so we only run it weekly.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SLEEPER_API = "https://api.sleeper.app/v1";

// Positions we care about for fantasy
const FANTASY_POSITIONS = ["QB", "RB", "WR", "TE", "K", "DEF"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const startTime = Date.now();

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Log sync start
    const { data: syncLog } = await supabase
      .from("sync_log")
      .insert({
        sync_type: "players",
        status: "running",
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    // Fetch all players from Sleeper
    console.log("Fetching all players from Sleeper API...");
    const response = await fetch(`${SLEEPER_API}/players/nfl`);
    if (!response.ok) {
      throw new Error(`Failed to fetch players: ${response.status}`);
    }

    const allPlayers = await response.json();
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
    transactions?.forEach((tx: any) => {
      if (tx.adds) {
        Object.keys(tx.adds).forEach((id: string) => transactionPlayerIds.add(id));
      }
      if (tx.drops) {
        Object.keys(tx.drops).forEach((id: string) => transactionPlayerIds.add(id));
      }
    });
    console.log(`Found ${transactionPlayerIds.size} unique players in transactions`);

    // Get player IDs from draft picks
    const { data: draftPicks } = await supabase.from("draft_picks").select("player_id");
    const draftPlayerIds = new Set<string>();
    draftPicks?.forEach((pick: any) => {
      if (pick.player_id) draftPlayerIds.add(pick.player_id);
    });
    console.log(`Found ${draftPlayerIds.size} unique players in draft picks`);

    // Filter to relevant players (rostered + active fantasy + transaction history + draft picks)
    const relevantPlayers = playerIds.filter((id) => {
      const player = allPlayers[id];
      const isRostered = rosteredPlayerIds.has(id);
      const isInTransaction = transactionPlayerIds.has(id);
      const isInDraft = draftPlayerIds.has(id);
      const isFantasyPosition = FANTASY_POSITIONS.includes(player.position);
      const isActive = player.status === "Active" || player.status === "Inactive";
      const hasTeam = !!player.team;

      return isRostered || isInTransaction || isInDraft || (isFantasyPosition && isActive && hasTeam);
    });

    console.log(`Filtering to ${relevantPlayers.length} relevant players`);

    // Prepare player records
    const playerRecords = relevantPlayers.map((id) => {
      const p = allPlayers[id];
      return {
        player_id: id,
        first_name: p.first_name || null,
        last_name: p.last_name || null,
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

    // Upsert in batches
    const batchSize = 100;
    let upserted = 0;
    let errors = 0;

    for (let i = 0; i < playerRecords.length; i += batchSize) {
      const batch = playerRecords.slice(i, i + batchSize);
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

    const duration = Date.now() - startTime;

    // Update sync log
    if (syncLog) {
      await supabase
        .from("sync_log")
        .update({
          status: errors > 0 ? "completed_with_errors" : "completed",
          records_processed: upserted,
          error_message: errors > 0 ? `${errors} batch errors` : null,
          completed_at: new Date().toISOString(),
        })
        .eq("id", syncLog.id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        totalFromApi: playerIds.length,
        relevantPlayers: relevantPlayers.length,
        upserted,
        errors,
        durationMs: duration,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error syncing players:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
