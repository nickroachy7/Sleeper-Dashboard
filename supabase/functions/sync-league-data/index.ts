/**
 * Edge Function: sync-league-data
 *
 * Syncs rosters, transactions, traded picks, matchups, and drafts from Sleeper API.
 * Scheduled to run every 6 hours.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createServiceClient } from "../_shared/supabase-client.ts";
import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { fetchWithRetry } from "../_shared/fetch-with-retry.ts";
import { startSyncLog } from "../_shared/sync-logger.ts";

const SLEEPER_API = "https://api.sleeper.app/v1";

interface SyncResult {
  rosters: number;
  transactions: number;
  tradedPicks: number;
  matchups: number;
  drafts: number;
  draftPicks: number;
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const startTime = Date.now();
    const supabase = createServiceClient();

    // Get the most recent league
    const { data: leagues, error: leagueError } = await supabase
      .from("leagues")
      .select("league_id")
      .order("season", { ascending: false })
      .limit(1)
      .single();

    if (leagueError || !leagues) {
      throw new Error("No league found in database");
    }

    const leagueId = leagues.league_id;
    const syncLog = await startSyncLog(supabase, "league_data", leagueId);

    const result: SyncResult = {
      rosters: 0,
      transactions: 0,
      tradedPicks: 0,
      matchups: 0,
      drafts: 0,
      draftPicks: 0,
    };

    // 1. Sync Rosters — delete old season rosters, batch upsert current
    try {
      await supabase.from("rosters").delete().neq("league_id", leagueId);
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
        const { error } = await supabase.from("rosters").upsert(rosterRows, {
          onConflict: "league_id,roster_id",
          ignoreDuplicates: false,
        });
        if (!error) result.rosters = rosterRows.length;
      }
    } catch (e) {
      console.error("Error syncing rosters:", e);
    }

    // 2. Get NFL state for current week
    const nflState = await fetchWithRetry(`${SLEEPER_API}/state/nfl`);
    const currentWeek = nflState?.week || 1;

    // 3. Traverse league history to get all league IDs
    const allLeagueIds: string[] = [];
    let traverseLeagueId: string | null = leagueId;

    while (traverseLeagueId) {
      allLeagueIds.push(traverseLeagueId);
      const leagueData = await fetchWithRetry(`${SLEEPER_API}/league/${traverseLeagueId}`);

      if (leagueData && traverseLeagueId !== leagueId) {
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

    // 4. Sync Transactions — batch per week per league
    try {
      for (const lid of allLeagueIds) {
        const isCurrentLeague = lid === leagueId;
        const startWeek = isCurrentLeague ? Math.max(0, currentWeek - 4) : 0;
        const endWeek = isCurrentLeague ? currentWeek : 18;

        for (let week = startWeek; week <= endWeek; week++) {
          const transactions = await fetchWithRetry(
            `${SLEEPER_API}/league/${lid}/transactions/${week}`
          );

          if (transactions?.length) {
            const txRows = transactions.map((tx: any) => ({
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
            }));
            const { error } = await supabase.from("transactions").upsert(txRows, {
              onConflict: "transaction_id",
              ignoreDuplicates: false,
            });
            if (!error) result.transactions += txRows.length;
          }
        }
      }
    } catch (e) {
      console.error("Error syncing transactions:", e);
    }

    // 5. Sync Traded Picks — batch insert
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
        const { error } = await supabase.from("traded_picks").insert(picksToInsert);
        if (!error) result.tradedPicks = picksToInsert.length;
      }
    } catch (e) {
      console.error("Error syncing traded picks:", e);
    }

    // 6. Sync Current Week Matchups — batch upsert
    try {
      const matchups = await fetchWithRetry(
        `${SLEEPER_API}/league/${leagueId}/matchups/${currentWeek}`
      );
      if (matchups?.length) {
        const matchupRows = matchups.map((matchup: any) => ({
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
        }));
        const { error } = await supabase.from("matchups").upsert(matchupRows, {
          onConflict: "league_id,week,roster_id",
          ignoreDuplicates: false,
        });
        if (!error) result.matchups = matchupRows.length;
      }
    } catch (e) {
      console.error("Error syncing matchups:", e);
    }

    // 7. Sync All Drafts — batch upsert picks per draft
    try {
      for (const lid of allLeagueIds) {
        const drafts = await fetchWithRetry(`${SLEEPER_API}/league/${lid}/drafts`);
        if (!drafts?.length) continue;

        for (const draft of drafts) {
          const { error: draftError } = await supabase.from("drafts").upsert(
            {
              draft_id: draft.draft_id,
              league_id: lid,
              type: draft.type,
              status: draft.status,
              season: draft.season,
              settings: draft.settings,
              start_time: draft.start_time || null,
              slot_to_roster_id: draft.slot_to_roster_id,
              draft_order: draft.draft_order,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "draft_id", ignoreDuplicates: false }
          );
          if (draftError) {
            console.error(`Draft upsert error: ${JSON.stringify(draftError)}`);
            continue;
          }
          result.drafts++;

          // Batch upsert draft picks
          const draftPicks = await fetchWithRetry(`${SLEEPER_API}/draft/${draft.draft_id}/picks`);
          if (draftPicks?.length) {
            const pickRows = draftPicks.map((pick: any) => ({
              draft_id: draft.draft_id,
              round: pick.round,
              pick_no: pick.pick_no,
              draft_slot: pick.draft_slot,
              roster_id: pick.roster_id,
              player_id: pick.player_id,
              picked_by: pick.picked_by,
              is_keeper: pick.is_keeper || false,
              metadata: pick.metadata,
            }));
            const { error: pickError } = await supabase.from("draft_picks").upsert(pickRows, {
              onConflict: "draft_id,pick_no",
              ignoreDuplicates: false,
            });
            if (!pickError) result.draftPicks += pickRows.length;
            else console.error(`Draft picks batch error: ${JSON.stringify(pickError)}`);
          }
        }
      }
    } catch (e) {
      console.error("Error syncing drafts:", e);
    }

    const totalRecords =
      result.rosters + result.transactions + result.tradedPicks +
      result.matchups + result.drafts + result.draftPicks;

    await syncLog.complete(totalRecords);

    return jsonResponse({
      success: true,
      leagueId,
      ...result,
      totalRecords,
      durationMs: Date.now() - startTime,
    });
  } catch (error) {
    console.error("Error syncing league data:", error);
    return errorResponse(error);
  }
});
