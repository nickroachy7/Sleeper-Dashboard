/**
 * Edge Function: sync-nfl-state
 * 
 * Syncs current NFL season/week state from Sleeper API.
 * Scheduled to run daily at 10 AM ET (14:00 UTC)
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SLEEPER_API = "https://api.sleeper.app/v1";

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

    // Fetch NFL state from Sleeper
    const response = await fetch(`${SLEEPER_API}/state/nfl`);
    if (!response.ok) {
      throw new Error(`Failed to fetch NFL state: ${response.status}`);
    }

    const nflState = await response.json();

    // Upsert NFL state (we maintain a single row)
    const { error } = await supabase.from("nfl_state").upsert(
      {
        id: "00000000-0000-0000-0000-000000000001", // Fixed UUID for single row
        season: nflState.season?.toString() || nflState.league_season?.toString(),
        season_type: nflState.season_type,
        week: nflState.week || nflState.display_week,
        leg: nflState.leg,
        display_week: nflState.display_week,
        season_start_date: nflState.season_start_date,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

    if (error) throw error;

    const duration = Date.now() - startTime;

    return new Response(
      JSON.stringify({
        success: true,
        nflState: {
          season: nflState.season,
          week: nflState.week,
          seasonType: nflState.season_type,
          displayWeek: nflState.display_week,
        },
        durationMs: duration,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error syncing NFL state:", error);

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
