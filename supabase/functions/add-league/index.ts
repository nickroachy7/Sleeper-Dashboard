/**
 * Edge Function: add-league
 *
 * Public endpoint. Given a Sleeper league_id (any season — we normalize to the
 * current-season root), traverse its history and ingest all data, then register
 * it in `tracked_leagues` so the cron keeps it fresh.
 *
 * Rate-limited per IP to keep abuse and Sleeper API load bounded.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createServiceClient } from "../_shared/supabase-client.ts";
import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { fetchWithRetry } from "../_shared/fetch-with-retry.ts";
import { syncLeagueChain, getCurrentWeek } from "../_shared/sync-league.ts";
import { checkRateLimit, clientIp } from "../_shared/rate-limit.ts";

const SLEEPER_API = "https://api.sleeper.app/v1";

// A visitor may add several leagues in one sitting (they're in multiple), so
// keep this generous but bounded.
const ADD_LIMIT = 10;
const ADD_WINDOW_SECONDS = 60 * 60; // 1 hour

/**
 * Normalize any season's league_id to the current-season root by following
 * Sleeper's forward chain. Sleeper doesn't expose "next_league_id", so we walk
 * the tracked/DB chain when possible; otherwise the passed id is treated as the
 * root (the common case — people share their current league).
 */
async function resolveRoot(leagueId: string): Promise<{ league_id: string; name: string; season: string } | null> {
  // Sleeper 404s (or returns null) for an unknown league — treat any failure
  // here as "not found" so the caller can return a clean 404 rather than 500.
  try {
    const league = await fetchWithRetry(`${SLEEPER_API}/league/${leagueId}`);
    if (!league?.league_id) return null;
    return { league_id: league.league_id, name: league.name, season: league.season };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    const supabase = createServiceClient();
    const ip = clientIp(req);

    const rl = await checkRateLimit(supabase, "add-league", ip, ADD_LIMIT, ADD_WINDOW_SECONDS);
    if (!rl.allowed) {
      return jsonResponse(
        { success: false, error: `Rate limit reached — try again later. (max ${rl.limit}/hour)` },
        429
      );
    }

    const body = await req.json().catch(() => ({}));
    const leagueId: string | undefined = body?.leagueId ?? body?.rootLeagueId;
    if (!leagueId || typeof leagueId !== "string" || !/^\d+$/.test(leagueId)) {
      return jsonResponse({ success: false, error: "A numeric Sleeper league_id is required" }, 400);
    }

    const root = await resolveRoot(leagueId);
    if (!root) {
      return jsonResponse({ success: false, error: "League not found on Sleeper" }, 404);
    }

    // Register first with a "pending" status, then run the (potentially
    // minutes-long, multi-season) ingest in the BACKGROUND and respond
    // immediately. A synchronous ingest regularly outlived the browser's/
    // gateway's patience and surfaced as "Failed to send a request to the
    // Edge Function" — even though the sync itself completed server-side.
    // The client polls tracked_leagues.last_sync_status to know when data
    // has landed ('pending' → 'ok' | 'error').
    await supabase.from("tracked_leagues").upsert(
      {
        root_league_id: root.league_id,
        name: root.name,
        season: root.season,
        last_sync_status: "pending",
        last_viewed_at: new Date().toISOString(),
      },
      { onConflict: "root_league_id", ignoreDuplicates: false }
    );

    const ingest = (async () => {
      try {
        const currentWeek = await getCurrentWeek();
        await syncLeagueChain(supabase, root.league_id, currentWeek);
        await supabase
          .from("tracked_leagues")
          .update({ last_synced_at: new Date().toISOString(), last_sync_status: "ok", sync_error: null })
          .eq("root_league_id", root.league_id);

        // Backfill player rows for this league. The curated players table only
        // holds offensive skill players + whatever was rostered in already-synced
        // leagues, so a new league (especially an IDP league) references players
        // with no name row yet. sync-players scans all rosters — including the
        // one we just wrote. Non-fatal (the weekly cron is the backstop).
        try {
          await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/sync-players`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              "Content-Type": "application/json",
            },
          });
        } catch (e) {
          console.error("player backfill (sync-players) failed — cron will catch up:", e);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("add-league background ingest failed:", msg);
        await supabase
          .from("tracked_leagues")
          .update({ last_synced_at: new Date().toISOString(), last_sync_status: "error", sync_error: msg })
          .eq("root_league_id", root.league_id);
      }
    })();

    // Keep the isolate alive until the ingest settles, without blocking the
    // response. Fall back to fire-and-forget if waitUntil is unavailable.
    try {
      // deno-lint-ignore no-explicit-any
      (globalThis as any).EdgeRuntime?.waitUntil?.(ingest) ?? ingest.catch(() => {});
    } catch {
      ingest.catch(() => {});
    }

    return jsonResponse(
      {
        success: true,
        importing: true,
        league: { rootLeagueId: root.league_id, name: root.name, season: root.season },
      },
      202
    );
  } catch (error) {
    console.error("add-league error:", error);
    return errorResponse(error);
  }
});
