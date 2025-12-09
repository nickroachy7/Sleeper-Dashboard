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
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    // TEP (Tight End Premium) values - TEs get 1.0 PPR instead of 0.5 PPR
    tep?: TEPValues;
    // TEPP (1.5 PPR for TEs)
    tepp?: TEPValues;
    // TEPPP (2.0 PPR for TEs)
    teppp?: TEPValues;
  };
}

interface PickValue {
  pick_type: string;
  pick_year: string;
  pick_round: number;
  pick_tier: string | null;
  value: number;
  rank: number | null;
  superflex: boolean;
}

// Parse pick name from KTC to extract year, round, and tier
function parsePickName(name: string): { year: string; round: number; tier: string | null } | null {
  // Examples: "2025 1st", "2025 Early 1st", "2025 Mid 2nd", "2025 Late 3rd", "2026 1st"
  const match = name.match(/(\d{4})\s+(Early|Mid|Late)?\s*(1st|2nd|3rd|4th)/i);
  if (!match) return null;
  
  const year = match[1];
  const tier = match[2] || null;
  const roundStr = match[3].toLowerCase();
  
  const roundMap: Record<string, number> = { '1st': 1, '2nd': 2, '3rd': 3, '4th': 4 };
  const round = roundMap[roundStr] || 1;
  
  return { year, round, tier };
}

interface SleeperPlayer {
  player_id: string;
  full_name: string;
  position: string;
  team: string;
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
  const response = await fetch("https://keeptradecut.com/dynasty-rankings");
  const html = await response.text();

  const match = html.match(/var\s+playersArray\s*=\s*(\[[\s\S]*?\]);/);
  if (!match) {
    throw new Error("Could not find playersArray in KTC page");
  }

  return JSON.parse(match[1]) as KTCPlayer[];
}

Deno.serve(async (req) => {
  // Handle CORS preflight
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
        sync_type: "ktc_values",
        status: "running",
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    // Fetch data from both sources
    const [ktcPlayers, { data: sleeperPlayers, error: playersError }] = await Promise.all([
      fetchKTCData(),
      supabase.from("players").select("player_id, full_name, position, team"),
    ]);

    if (playersError) throw playersError;

    // Clear existing player values and pick values
    await Promise.all([
      supabase.from("player_values").delete().neq("player_id", ""),
      supabase.from("pick_values").delete().neq("pick_type", ""),
    ]);

    // Match and prepare values
    const playerValues: any[] = [];
    const pickValues: PickValue[] = [];
    let unmatched = 0;

    for (const ktcPlayer of ktcPlayers) {
      if (ktcPlayer.position === "PICK" || ktcPlayer.position === "RDP") {
        // Process draft picks - also use TEP values for consistency
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

      const match = findMatch(ktcPlayer, sleeperPlayers || []);

      if (match) {
        // Use TEP (Tight End Premium) values for Superflex + Half PPR leagues
        // TEP = TEs get 1.0 PPR instead of 0.5 PPR (standard TE Premium setting)
        const tepValues = ktcPlayer.superflexValues?.tep;
        
        playerValues.push({
          player_id: match.player_id,
          value: tepValues?.value || ktcPlayer.superflexValues?.value || 0,
          rank: tepValues?.rank || ktcPlayer.superflexValues?.rank || null,
          position_rank: tepValues?.positionalRank || ktcPlayer.superflexValues?.positionalRank || null,
          tier: tepValues?.overallTier || ktcPlayer.superflexValues?.overallTier || null,
          trend: ktcPlayer.superflexValues?.overallTrend || 0,
          superflex: true,
          source: "keeptradecut",
          fetched_at: new Date().toISOString(),
        });
      } else {
        unmatched++;
      }
    }

    // Insert player values in batches
    const batchSize = 100;
    let insertedPlayers = 0;

    for (let i = 0; i < playerValues.length; i += batchSize) {
      const batch = playerValues.slice(i, i + batchSize);
      const { error: insertError } = await supabase.from("player_values").insert(batch);
      if (!insertError) {
        insertedPlayers += batch.length;
      }
    }

    // Insert pick values
    let insertedPicks = 0;
    if (pickValues.length > 0) {
      const { error: pickError } = await supabase.from("pick_values").insert(pickValues);
      if (!pickError) {
        insertedPicks = pickValues.length;
      }
    }

    const duration = Date.now() - startTime;

    // Update sync log
    if (syncLog) {
      await supabase
        .from("sync_log")
        .update({
          status: "completed",
          records_processed: insertedPlayers + insertedPicks,
          completed_at: new Date().toISOString(),
        })
        .eq("id", syncLog.id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        matchedPlayers: insertedPlayers,
        insertedPicks,
        unmatched,
        ktcTotal: ktcPlayers.length,
        durationMs: duration,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error syncing KTC values:", error);

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
