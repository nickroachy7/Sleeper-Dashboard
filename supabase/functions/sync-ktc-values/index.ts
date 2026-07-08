/**
 * Edge Function: sync-ktc-values
 *
 * Fetches dynasty player values from KeepTradeCut and syncs them to the database.
 * Includes both player values and draft pick values.
 *
 * Uses: Superflex + Half PPR + Tight End Premium (TEP) settings
 * - Superflex: QBs valued for 2QB/SF leagues
 * - Half PPR: 0.5 points per reception
 * - TEP: TEs get 1.0 PPR (0.5 base + 0.5 premium)
 *
 * Scheduled to run daily at 6 AM ET (10:00 UTC)
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createServiceClient } from "../_shared/supabase-client.ts";
import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { fetchWithRetry } from "../_shared/fetch-with-retry.ts";
import { startSyncLog } from "../_shared/sync-logger.ts";

interface TEPValues {
  value: number;
  rank: number;
  positionalRank?: number;
  overallTier: number;
  positionalTier?: number;
}

interface KTCPlayer {
  playerID: number;
  playerName: string;
  slug: string;
  position: string;
  team: string;
  age: number;
  superflexValues: {
    value: number;
    rank: number;
    positionalRank?: number;
    overallTier: number;
    positionalTier?: number;
    overallTrend?: number;
    tep?: TEPValues;
    tepp?: TEPValues;
    teppp?: TEPValues;
  };
}

interface SleeperPlayer {
  player_id: string;
  full_name: string;
  position: string;
  team: string;
}

const BATCH_SIZE = 100;
const MIN_EXPECTED_PLAYERS = 100;
const MAX_EXPECTED_PLAYERS = 800;

// Parse pick name from KTC to extract year, round, and tier
function parsePickName(name: string): { year: string; round: number; tier: string | null } | null {
  const match = name.match(/(\d{4})\s+(Early|Mid|Late)?\s*(1st|2nd|3rd|4th)/i);
  if (!match) return null;

  const year = match[1];
  const tier = match[2] || null;
  const roundStr = match[3].toLowerCase();
  const roundMap: Record<string, number> = { "1st": 1, "2nd": 2, "3rd": 3, "4th": 4 };

  return { year, round: roundMap[roundStr] || 1, tier };
}

// Normalize name for matching
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[''']/g, "")
    .replace(/[.-]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\bjr\b\.?/gi, "")
    .replace(/\bsr\b\.?/gi, "")
    .replace(/\bii\b/gi, "")
    .replace(/\biii\b/gi, "")
    .replace(/\biv\b/gi, "")
    .trim();
}

// Match KTC player to Sleeper player
function findMatch(ktcPlayer: KTCPlayer, sleeperPlayers: SleeperPlayer[]): SleeperPlayer | null {
  const ktcNormalized = normalizeName(ktcPlayer.playerName);

  // Exact name match
  for (const sp of sleeperPlayers) {
    if (normalizeName(sp.full_name) === ktcNormalized) {
      return sp;
    }
  }

  // Match with same position and team (fuzzy)
  for (const sp of sleeperPlayers) {
    const spNormalized = normalizeName(sp.full_name);
    if (sp.position === ktcPlayer.position && sp.team === ktcPlayer.team) {
      const ktcParts = ktcNormalized.split(" ");
      const spParts = spNormalized.split(" ");
      if (ktcParts.length >= 2 && spParts.length >= 2) {
        const ktcLast = ktcParts[ktcParts.length - 1];
        const spLast = spParts[spParts.length - 1];
        const ktcFirst = ktcParts[0];
        const spFirst = spParts[0];
        if (ktcLast === spLast && ktcFirst[0] === spFirst[0]) {
          return sp;
        }
      }
    }
  }

  return null;
}

async function fetchKTCData(): Promise<KTCPlayer[]> {
  let html: string;
  for (let i = 0; i < 3; i++) {
    try {
      const resp = await fetch("https://keeptradecut.com/dynasty-rankings");
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      html = await resp.text();
      break;
    } catch (error) {
      if (i === 2) throw error;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }

  const match = html!.match(/var\s+playersArray\s*=\s*(\[[\s\S]*?\]);/);
  if (!match) {
    throw new Error("Could not find playersArray in KTC page");
  }

  return JSON.parse(match[1]) as KTCPlayer[];
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const startTime = Date.now();
    const supabase = createServiceClient();
    const syncLog = await startSyncLog(supabase, "ktc_values");

    // Fetch data from both sources
    const [ktcPlayers, { data: sleeperPlayers, error: playersError }] = await Promise.all([
      fetchKTCData(),
      supabase.from("players").select("player_id, full_name, position, team"),
    ]);

    if (playersError) throw playersError;

    // Validate parsed data before deleting existing values
    const playerCount = ktcPlayers.filter(
      (p) => p.position !== "PICK" && p.position !== "RDP"
    ).length;

    if (playerCount < MIN_EXPECTED_PLAYERS) {
      const msg = `KTC parse returned only ${playerCount} players (expected ${MIN_EXPECTED_PLAYERS}-${MAX_EXPECTED_PLAYERS}). Aborting to preserve existing data.`;
      console.error(msg);
      await syncLog.fail(msg);
      return jsonResponse({ success: false, error: msg }, 500);
    }

    if (playerCount > MAX_EXPECTED_PLAYERS) {
      console.warn(
        `KTC returned ${playerCount} players, above expected max of ${MAX_EXPECTED_PLAYERS}. Proceeding but this may indicate a parsing issue.`
      );
    }

    // Match and prepare values
    const playerValues: any[] = [];
    const pickValues: any[] = [];
    // History snapshots use BASE superflex value (no TE premium) so they stay
    // on the same basis as the 6-year backfill from KTC player pages. Mixing
    // TEP into history would make every TE look like a riser vs. older base
    // readings. player_values (what the app displays) stays TEP.
    const historyRows: any[] = [];
    const today = new Date().toISOString().split("T")[0];
    let unmatched = 0;

    for (const ktcPlayer of ktcPlayers) {
      if (ktcPlayer.position === "PICK" || ktcPlayer.position === "RDP") {
        const parsed = parsePickName(ktcPlayer.playerName);
        if (parsed) {
          const tepValues = ktcPlayer.superflexValues?.tep;
          pickValues.push({
            pick_type: ktcPlayer.playerName,
            pick_year: parsed.year,
            pick_round: parsed.round,
            pick_tier: parsed.tier,
            value: tepValues?.value || ktcPlayer.superflexValues?.value || 0,
            rank: tepValues?.rank || ktcPlayer.superflexValues?.rank || null,
            superflex: true,
          });
        }
        continue;
      }

      const matched = findMatch(ktcPlayer, sleeperPlayers || []);

      if (matched) {
        const tepValues = ktcPlayer.superflexValues?.tep;
        playerValues.push({
          player_id: matched.player_id,
          value: tepValues?.value || ktcPlayer.superflexValues?.value || 0,
          rank: tepValues?.rank || ktcPlayer.superflexValues?.rank || null,
          position_rank:
            tepValues?.positionalRank || ktcPlayer.superflexValues?.positionalRank || null,
          tier: tepValues?.overallTier || ktcPlayer.superflexValues?.overallTier || null,
          trend: ktcPlayer.superflexValues?.overallTrend || 0,
          superflex: true,
          source: "keeptradecut",
          fetched_at: new Date().toISOString(),
        });
        // BASE superflex value for the history snapshot (see note above).
        historyRows.push({
          player_id: matched.player_id,
          value: ktcPlayer.superflexValues?.value || tepValues?.value || 0,
          rank: ktcPlayer.superflexValues?.rank || null,
          date: today,
          source: "keeptradecut",
        });
      } else {
        unmatched++;
      }
    }

    // Upsert player values in batches (no delete — atomic updates via unique constraint)
    let insertedPlayers = 0;
    for (let i = 0; i < playerValues.length; i += BATCH_SIZE) {
      const batch = playerValues.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.from("player_values").upsert(batch, {
        onConflict: "player_id,source,superflex",
        ignoreDuplicates: false,
      });
      if (!error) insertedPlayers += batch.length;
      else console.error(`Player values batch error at ${i}:`, error.message);
    }

    // Upsert pick values in batches
    let insertedPicks = 0;
    for (let i = 0; i < pickValues.length; i += BATCH_SIZE) {
      const batch = pickValues.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.from("pick_values").upsert(batch, {
        onConflict: "pick_year,pick_round,pick_tier",
        ignoreDuplicates: false,
      });
      if (!error) insertedPicks += batch.length;
      else console.error(`Pick values batch error at ${i}:`, error.message);
    }

    // Record daily snapshot in player_value_history (base superflex values)
    for (let i = 0; i < historyRows.length; i += BATCH_SIZE) {
      const batch = historyRows.slice(i, i + BATCH_SIZE);
      await supabase.from("player_value_history").upsert(batch, {
        onConflict: "player_id,date,source",
        ignoreDuplicates: true, // skip if already recorded today
      });
    }

    console.log(
      `KTC sync: ${insertedPlayers} players, ${insertedPicks} picks, ${unmatched} unmatched`
    );

    await syncLog.complete(insertedPlayers + insertedPicks);

    return jsonResponse({
      success: true,
      matchedPlayers: insertedPlayers,
      insertedPicks,
      unmatched,
      ktcTotal: ktcPlayers.length,
      durationMs: Date.now() - startTime,
    });
  } catch (error) {
    console.error("Error syncing KTC values:", error);
    return errorResponse(error);
  }
});
