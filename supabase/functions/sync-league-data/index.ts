/**
 * Edge Function: sync-league-data
 * 
 * Syncs rosters, transactions, and traded picks from Sleeper API.
 * Scheduled to run every 6 hours.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SLEEPER_API = "https://api.sleeper.app/v1";

interface SyncResult {
  rosters: number;
  transactions: number;
  tradedPicks: number;
  matchups: number;
  drafts: number;
  draftPicks: number;
}

async function fetchWithRetry(url: string, retries = 3): Promise<any> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

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

    // Get league ID from database
    const { data: leagues, error: leagueError } = await supabase
      .from("leagues")
      .select("league_id")
      .limit(1)
      .single();

    if (leagueError || !leagues) {
      throw new Error("No league found in database");
    }

    const leagueId = leagues.league_id;

    // Log sync start
    const { data: syncLog } = await supabase
      .from("sync_log")
      .insert({
        sync_type: "league_data",
        league_id: leagueId,
        status: "running",
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    const result: SyncResult = {
      rosters: 0,
      transactions: 0,
      tradedPicks: 0,
      matchups: 0,
      drafts: 0,
      draftPicks: 0,
    };

    // 1. Sync Rosters
    const rosters = await fetchWithRetry(`${SLEEPER_API}/league/${leagueId}/rosters`);
    if (rosters?.length) {
      for (const roster of rosters) {
        await supabase.from("rosters").upsert(
          {
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
          },
          { onConflict: "league_id,roster_id", ignoreDuplicates: false }
        );
        result.rosters++;
      }
    }

    // 2. Get NFL state for current week
    const nflState = await fetchWithRetry(`${SLEEPER_API}/state/nfl`);
    const currentWeek = nflState?.week || 1;

    // 3. Traverse league history to get all league IDs first
    const allLeagueIds: string[] = [];
    let traverseLeagueId: string | null = leagueId;
    
    while (traverseLeagueId) {
      allLeagueIds.push(traverseLeagueId);
      const leagueData = await fetchWithRetry(`${SLEEPER_API}/league/${traverseLeagueId}`);
      
      // Upsert historical league data (needed for foreign key constraints)
      if (leagueData && traverseLeagueId !== leagueId) {
        console.log(`Upserting historical league: ${leagueData.league_id} season: ${leagueData.season}`);
        const { error: leagueUpsertError } = await supabase.from("leagues").upsert(
          {
            league_id: leagueData.league_id,
            name: leagueData.name,
            season: leagueData.season,
            status: leagueData.status,
            sport: leagueData.sport,
            total_rosters: leagueData.total_rosters,
            roster_positions: leagueData.roster_positions,
            scoring_settings: leagueData.scoring_settings,
            settings: leagueData.settings,
            avatar: leagueData.avatar,
            draft_id: leagueData.draft_id,
            previous_league_id: leagueData.previous_league_id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "league_id", ignoreDuplicates: false }
        );
        if (leagueUpsertError) {
          console.error(`League upsert error: ${JSON.stringify(leagueUpsertError)}`);
        }
      }
      
      traverseLeagueId = leagueData?.previous_league_id || null;
    }

    // 4. Sync Transactions from all leagues
    for (const lid of allLeagueIds) {
      // For current league, only sync recent weeks; for historical leagues, sync all weeks (1-18)
      const isCurrentLeague = lid === leagueId;
      const startWeek = isCurrentLeague ? Math.max(1, currentWeek - 4) : 1;
      const endWeek = isCurrentLeague ? currentWeek : 18;
      
      for (let week = startWeek; week <= endWeek; week++) {
        const transactions = await fetchWithRetry(
          `${SLEEPER_API}/league/${lid}/transactions/${week}`
        );

        if (transactions?.length) {
          for (const tx of transactions) {
            const { error } = await supabase.from("transactions").upsert(
              {
                transaction_id: tx.transaction_id,
                league_id: lid,
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
              },
              { onConflict: "transaction_id", ignoreDuplicates: false }
            );
            if (!error) result.transactions++;
          }
        }
      }
    }

    // 5. Sync Traded Picks
    const tradedPicks = await fetchWithRetry(`${SLEEPER_API}/league/${leagueId}/traded_picks`);
    if (tradedPicks?.length) {
      // Clear existing traded picks for this league
      await supabase.from("traded_picks").delete().eq("league_id", leagueId);

      const picksToInsert = tradedPicks.map((pick: any) => ({
        league_id: leagueId,
        season: pick.season,
        round: pick.round,
        roster_id: pick.roster_id,
        previous_owner_id: pick.previous_owner_id,
        owner_id: pick.owner_id,
      }));

      const { error } = await supabase.from("traded_picks").insert(picksToInsert);
      if (!error) result.tradedPicks = picksToInsert.length;
    }

    // 6. Sync Current Week Matchups
    const matchups = await fetchWithRetry(
      `${SLEEPER_API}/league/${leagueId}/matchups/${currentWeek}`
    );
    if (matchups?.length) {
      for (const matchup of matchups) {
        await supabase.from("matchups").upsert(
          {
            league_id: leagueId,
            week: currentWeek,
            matchup_id: matchup.matchup_id,
            roster_id: matchup.roster_id,
            points: matchup.points,
            starters: matchup.starters,
            players: matchup.players,
            starters_points: matchup.starters_points,
            players_points: matchup.players_points,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "league_id,week,roster_id", ignoreDuplicates: false }
        );
        result.matchups++;
      }
    }

    // 7. Sync All Drafts from all historical leagues

    // Fetch drafts from all leagues
    for (const lid of allLeagueIds) {
      const drafts = await fetchWithRetry(`${SLEEPER_API}/league/${lid}/drafts`);
      if (drafts?.length) {
        for (const draft of drafts) {
          // Upsert draft metadata
          console.log(`Upserting draft: ${draft.draft_id} for league: ${lid} season: ${draft.season}`);
          const { error: draftError } = await supabase.from("drafts").upsert(
            {
              draft_id: draft.draft_id,
              league_id: lid,
              type: draft.type,
              status: draft.status,
              season: draft.season,
              settings: draft.settings,
              start_time: draft.start_time || null,  // Unix timestamp in ms from Sleeper API
              slot_to_roster_id: draft.slot_to_roster_id,
              draft_order: draft.draft_order,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "draft_id", ignoreDuplicates: false }
          );
          if (draftError) {
            console.error(`Draft upsert error: ${JSON.stringify(draftError)}`);
          } else {
            result.drafts++;
          }

          // Fetch and sync draft picks
          const draftPicks = await fetchWithRetry(`${SLEEPER_API}/draft/${draft.draft_id}/picks`);
          console.log(`Fetched ${draftPicks?.length || 0} picks for draft ${draft.draft_id}`);
          if (draftPicks?.length) {
            for (const pick of draftPicks) {
              const { error: pickError } = await supabase.from("draft_picks").upsert(
                {
                  draft_id: draft.draft_id,
                  round: pick.round,
                  pick_no: pick.pick_no,
                  draft_slot: pick.draft_slot,
                  roster_id: pick.roster_id,
                  player_id: pick.player_id,
                  picked_by: pick.picked_by,
                  is_keeper: pick.is_keeper || false,
                  metadata: pick.metadata,
                },
                { onConflict: "draft_id,pick_no", ignoreDuplicates: false }
              );
              if (pickError) {
                console.error(`Draft pick error for draft ${draft.draft_id}, pick ${pick.pick_no}: ${JSON.stringify(pickError)}`);
              } else {
                result.draftPicks++;
              }
            }
          }
        }
      }
    }

    const duration = Date.now() - startTime;
    const totalRecords =
      result.rosters + result.transactions + result.tradedPicks + result.matchups + result.drafts + result.draftPicks;

    // Update sync log
    if (syncLog) {
      await supabase
        .from("sync_log")
        .update({
          status: "completed",
          records_processed: totalRecords,
          completed_at: new Date().toISOString(),
        })
        .eq("id", syncLog.id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        leagueId,
        ...result,
        totalRecords,
        durationMs: duration,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error syncing league data:", error);

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
