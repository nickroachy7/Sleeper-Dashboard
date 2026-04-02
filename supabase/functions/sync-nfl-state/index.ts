/**
 * Edge Function: sync-nfl-state
 *
 * Syncs current NFL season/week state from Sleeper API.
 * Scheduled to run daily at 10 AM ET (14:00 UTC)
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createServiceClient } from "../_shared/supabase-client.ts";
import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { fetchWithRetry } from "../_shared/fetch-with-retry.ts";

const SLEEPER_API = "https://api.sleeper.app/v1";

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const startTime = Date.now();
    const supabase = createServiceClient();

    const nflState = await fetchWithRetry(`${SLEEPER_API}/state/nfl`);

    const { error } = await supabase.from("nfl_state").upsert(
      {
        id: "00000000-0000-0000-0000-000000000001",
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

    return jsonResponse({
      success: true,
      nflState: {
        season: nflState.season,
        week: nflState.week,
        seasonType: nflState.season_type,
        displayWeek: nflState.display_week,
      },
      durationMs: Date.now() - startTime,
    });
  } catch (error) {
    console.error("Error syncing NFL state:", error);
    return errorResponse(error);
  }
});
