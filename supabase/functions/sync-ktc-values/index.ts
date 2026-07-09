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

// KTC uses different team abbreviations than Sleeper for several teams. Without
// mapping these, the position+team fuzzy fallback can never fire for players on
// these teams whose names don't match exactly (e.g. KTC "Kenneth Gainwell" TBB
// vs Sleeper "Kenny Gainwell" TB), silently dropping real, valued players.
const KTC_TEAM_TO_SLEEPER: Record<string, string> = {
  GBP: "GB", JAC: "JAX", KCC: "KC", LVR: "LV",
  NEP: "NE", NOS: "NO", SFO: "SF", TBB: "TB",
};

function normalizeTeam(team: string | null | undefined): string {
  const t = (team || "").toUpperCase();
  return KTC_TEAM_TO_SLEEPER[t] || t;
}

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

  // Match with same position and team (fuzzy) — teams normalized across sources
  const ktcTeam = normalizeTeam(ktcPlayer.team);
  for (const sp of sleeperPlayers) {
    const spNormalized = normalizeName(sp.full_name);
    if (sp.position === ktcPlayer.position && normalizeTeam(sp.team) === ktcTeam) {
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

// KTC's /dynasty-rankings playersArray is hard-capped at 500 entries, so players
// ranked below that (e.g. Odell Beckham, rank ~679) are absent and get no value.
// They ARE published on individual pages, and the dynasty sitemap lists every
// ranked player's slug (`name-ktcID`). This second pass recovers the tail.

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
const DEEP_FETCH_CONCURRENCY = 5;

async function fetchDynastySitemapSlugs(): Promise<string[]> {
  try {
    const resp = await fetch("https://keeptradecut.com/sitemap-dynasty.xml", {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!resp.ok) return [];
    const xml = await resp.text();
    const slugs = [...xml.matchAll(/\/dynasty-rankings\/players\/([a-z0-9-]+)/g)].map((m) => m[1]);
    return [...new Set(slugs)];
  } catch (e) {
    console.warn("Sitemap fetch failed:", (e as Error).message);
    return [];
  }
}

// Fetch one KTC player page and pull the embedded `var player = {...}` object.
async function fetchKTCPlayerPage(
  slug: string
): Promise<{ playerName: string; position: string; team: string; tepValue: number; baseValue: number } | null> {
  try {
    const resp = await fetch(`https://keeptradecut.com/dynasty-rankings/players/${slug}`, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!resp.ok) return null;
    const html = await resp.text();
    const m = html.match(/var\s+player\s*=\s*(\{[\s\S]*?\});/);
    if (!m) return null;
    const player = JSON.parse(m[1]);
    const sf = player.superflexValues ?? {};
    return {
      playerName: player.playerName,
      position: player.position,
      team: player.team,
      tepValue: sf.tep?.value ?? sf.value ?? 0,
      baseValue: sf.value ?? sf.tep?.value ?? 0,
    };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const startTime = Date.now();
    const supabase = createServiceClient();
    const syncLog = await startSyncLog(supabase, "ktc_values");

    // Fetch data from both sources. The players table is fetched with paging —
    // PostgREST caps a single select at 1000 rows, and the table has more, so an
    // unpaged fetch hid ~15% of players from the matcher.
    const fetchAllPlayers = async (): Promise<SleeperPlayer[]> => {
      const pageSize = 1000;
      const all: SleeperPlayer[] = [];
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
          .from("players")
          .select("player_id, full_name, position, team")
          .range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data?.length) break;
        all.push(...(data as SleeperPlayer[]));
        if (data.length < pageSize) break;
      }
      return all;
    };

    const [ktcPlayers, sleeperPlayers] = await Promise.all([
      fetchKTCData(),
      fetchAllPlayers(),
    ]);

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

    // ── Second pass: recover players ranked below KTC's top-500 bulk list ──
    // Pull the dynasty sitemap, find Sleeper players NOT already matched above,
    // and fetch their individual pages for a real value (e.g. Odell Beckham).
    let deepRecovered = 0;
    try {
      const matchedIds = new Set(playerValues.map((p) => p.player_id));
      // Index still-unmatched Sleeper players by normalized name.
      const unmatchedByName = new Map<string, SleeperPlayer[]>();
      for (const sp of sleeperPlayers) {
        if (!sp.full_name || matchedIds.has(sp.player_id)) continue;
        const key = normalizeName(sp.full_name);
        const arr = unmatchedByName.get(key) ?? [];
        arr.push(sp);
        unmatchedByName.set(key, arr);
      }

      const slugs = await fetchDynastySitemapSlugs();
      const deslug = (s: string) => normalizeName(s.replace(/-\d+$/, "").replace(/-/g, " "));
      // Only fetch pages for slugs that map to a still-unmatched Sleeper player.
      const candidates = slugs.filter((s) => unmatchedByName.has(deslug(s)));

      for (let i = 0; i < candidates.length; i += DEEP_FETCH_CONCURRENCY) {
        const batch = candidates.slice(i, i + DEEP_FETCH_CONCURRENCY);
        const pages = await Promise.all(
          batch.map((slug) => fetchKTCPlayerPage(slug).then((v) => ({ slug, v })))
        );
        for (const { slug, v } of pages) {
          if (!v || v.tepValue <= 0) continue; // KTC lists some fringe players at 0 → skip
          const cands = unmatchedByName.get(deslug(slug)) ?? [];
          // Verify position to avoid name-collision false matches.
          const match = cands.find((p) => p.position === v.position) ?? (cands.length === 1 ? cands[0] : null);
          if (!match || matchedIds.has(match.player_id)) continue;
          matchedIds.add(match.player_id);
          deepRecovered++;
          playerValues.push({
            player_id: match.player_id,
            value: v.tepValue,
            rank: null,
            position_rank: null,
            tier: null,
            trend: 0,
            superflex: true,
            source: "keeptradecut",
            fetched_at: new Date().toISOString(),
          });
          historyRows.push({
            player_id: match.player_id,
            value: v.baseValue,
            rank: null,
            date: today,
            source: "keeptradecut",
          });
        }
      }
      console.log(`Deep pass recovered ${deepRecovered} sub-500 players from ${candidates.length} candidate pages`);
    } catch (e) {
      // Never let the deep pass break the primary sync.
      console.warn("Deep-value pass failed (non-fatal):", (e as Error).message);
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
      deepRecovered,
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
