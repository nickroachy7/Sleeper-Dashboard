/**
 * Edge Function: sync-league-data
 *
 * Syncs rosters, league users, transactions, traded picks, matchups, and drafts
 * from Sleeper API for ALL seasons (current + historical).
 *
 * Sleeper treats each season as a separate league linked via previous_league_id.
 * This function traverses that chain to ensure complete dynasty history.
 *
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
  leagueUsers: number;
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

    const currentLeagueId = leagues.league_id;
    const syncLog = await startSyncLog(supabase, "league_data", currentLeagueId);

    const result: SyncResult = {
      rosters: 0,
      leagueUsers: 0,
      transactions: 0,
      tradedPicks: 0,
      matchups: 0,
      drafts: 0,
      draftPicks: 0,
    };

    // 1. Get NFL state for current week
    const nflState = await fetchWithRetry(`${SLEEPER_API}/state/nfl`);
    const currentWeek = nflState?.week || 1;

    // 2. Traverse league history to discover all season league IDs
    const allLeagueIds: string[] = [];
    let traverseLeagueId: string | null = currentLeagueId;

    while (traverseLeagueId) {
      allLeagueIds.push(traverseLeagueId);
      const leagueData = await fetchWithRetry(`${SLEEPER_API}/league/${traverseLeagueId}`);

      // Upsert league metadata for all seasons
      if (leagueData) {
        await supabase.from("leagues").upsert(
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
      }

      traverseLeagueId = leagueData?.previous_league_id || null;
    }

    console.log(`Syncing ${allLeagueIds.length} league seasons`);

    // 3. Sync ALL data for each league season
    for (const leagueId of allLeagueIds) {
      const isCurrentSeason = leagueId === currentLeagueId;

      // 3a. Sync League Users for this season (must happen before rosters for FK)
      try {
        const leagueUsers = await fetchWithRetry(`${SLEEPER_API}/league/${leagueId}/users`);
        if (leagueUsers?.length) {
          // Upsert base users first (for FK)
          const userRows = leagueUsers.map((u: any) => ({
            user_id: u.user_id,
            username: u.display_name || u.user_id,
            display_name: u.display_name || u.user_id,
            avatar: u.avatar || null,
            metadata: u.metadata || null,
            updated_at: new Date().toISOString(),
          }));
          await supabase.from("users").upsert(userRows, {
            onConflict: "user_id",
            ignoreDuplicates: false,
          });

          // Upsert league_users with team names
          const leagueUserRows = leagueUsers.map((u: any) => ({
            league_id: leagueId,
            user_id: u.user_id,
            display_name: u.display_name || u.user_id,
            team_name: u.metadata?.team_name || null,
            avatar: u.avatar || null,
            is_owner: u.is_owner || false,
            is_co_owner: u.is_co_owner || false,
            updated_at: new Date().toISOString(),
          }));
          const { error } = await supabase.from("league_users").upsert(leagueUserRows, {
            onConflict: "league_id,user_id",
            ignoreDuplicates: false,
          });
          if (!error) result.leagueUsers += leagueUserRows.length;
        }
      } catch (e) {
        console.error(`Error syncing league users for ${leagueId}:`, e);
      }

      // 3b. Sync Rosters for this season
      try {
        const rosters = await fetchWithRetry(`${SLEEPER_API}/league/${leagueId}/rosters`);
        if (rosters?.length) {
          // Backfill any roster owner_ids missing from the users table.
          // Historical seasons may reference former league members who left and
          // don't appear in the /league/{id}/users endpoint. The FK constraint
          // on rosters.owner_id -> users.user_id would cause the entire batch
          // upsert to fail silently if even one owner_id is missing.
          const ownerIds = [...new Set(
            rosters.map((r: any) => r.owner_id).filter(Boolean)
          )] as string[];

          if (ownerIds.length) {
            const { data: existingUsers } = await supabase
              .from("users")
              .select("user_id")
              .in("user_id", ownerIds);
            const existingSet = new Set((existingUsers || []).map((u: any) => u.user_id));
            const missingOwnerIds = ownerIds.filter((id) => !existingSet.has(id));

            if (missingOwnerIds.length) {
              console.log(`Backfilling ${missingOwnerIds.length} missing users for ${leagueId}`);
              const backfillRows = [];
              for (const userId of missingOwnerIds) {
                try {
                  const userData = await fetchWithRetry(`${SLEEPER_API}/user/${userId}`);
                  backfillRows.push({
                    user_id: userId,
                    username: userData?.display_name || userData?.username || userId,
                    display_name: userData?.display_name || userData?.username || userId,
                    avatar: userData?.avatar || null,
                    metadata: userData?.metadata || null,
                    updated_at: new Date().toISOString(),
                  });
                } catch {
                  // If Sleeper API fails, insert a placeholder so FK doesn't block
                  backfillRows.push({
                    user_id: userId,
                    username: userId,
                    display_name: userId,
                    avatar: null,
                    metadata: null,
                    updated_at: new Date().toISOString(),
                  });
                }
              }
              await supabase.from("users").upsert(backfillRows, {
                onConflict: "user_id",
                ignoreDuplicates: true,
              });
            }
          }

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
          if (!error) result.rosters += rosterRows.length;
          else console.error(`Roster upsert error for ${leagueId}: ${JSON.stringify(error)}`);
        }
      } catch (e) {
        console.error(`Error syncing rosters for ${leagueId}:`, e);
      }

      // 3c. Sync Transactions — current season: last 4 weeks, historical: all 18 weeks
      try {
        const startWeek = isCurrentSeason ? Math.max(0, currentWeek - 4) : 0;
        const endWeek = isCurrentSeason ? currentWeek : 18;

        for (let week = startWeek; week <= endWeek; week++) {
          const transactions = await fetchWithRetry(
            `${SLEEPER_API}/league/${leagueId}/transactions/${week}`
          );

          if (transactions?.length) {
            const txRows = transactions.map((tx: any) => ({
              transaction_id: tx.transaction_id,
              league_id: leagueId,
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
      } catch (e) {
        console.error(`Error syncing transactions for ${leagueId}:`, e);
      }

      // 3d. Sync Traded Picks for this season
      try {
        const tradedPicks = await fetchWithRetry(`${SLEEPER_API}/league/${leagueId}/traded_picks`);
        if (tradedPicks?.length) {
          const picksToUpsert = tradedPicks.map((pick: any) => ({
            league_id: leagueId,
            season: pick.season,
            round: pick.round,
            roster_id: pick.roster_id,
            previous_owner_id: pick.previous_owner_id,
            owner_id: pick.owner_id,
            updated_at: new Date().toISOString(),
          }));
          const { error } = await supabase.from("traded_picks").upsert(picksToUpsert, {
            onConflict: "league_id,season,round,roster_id",
            ignoreDuplicates: false,
          });
          if (!error) result.tradedPicks += picksToUpsert.length;
        }
      } catch (e) {
        console.error(`Error syncing traded picks for ${leagueId}:`, e);
      }

      // 3e. Sync Matchups — current season: current week, historical: all 18 weeks
      try {
        const matchupStartWeek = isCurrentSeason ? currentWeek : 1;
        const matchupEndWeek = isCurrentSeason ? currentWeek : 18;

        for (let week = matchupStartWeek; week <= matchupEndWeek; week++) {
          const matchups = await fetchWithRetry(
            `${SLEEPER_API}/league/${leagueId}/matchups/${week}`
          );
          if (matchups?.length) {
            const matchupRows = matchups.map((matchup: any) => ({
              league_id: leagueId,
              week,
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
            if (!error) result.matchups += matchupRows.length;
          }
        }
      } catch (e) {
        console.error(`Error syncing matchups for ${leagueId}:`, e);
      }

      // 3f. Sync Drafts and Draft Picks for this season
      try {
        const drafts = await fetchWithRetry(`${SLEEPER_API}/league/${leagueId}/drafts`);
        if (!drafts?.length) continue;

        for (const draft of drafts) {
          const { error: draftError } = await supabase.from("drafts").upsert(
            {
              draft_id: draft.draft_id,
              league_id: leagueId,
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
      } catch (e) {
        console.error(`Error syncing drafts for ${leagueId}:`, e);
      }
    }

    const totalRecords =
      result.rosters + result.leagueUsers + result.transactions + result.tradedPicks +
      result.matchups + result.drafts + result.draftPicks;

    await syncLog.complete(totalRecords);

    return jsonResponse({
      success: true,
      leagueId: currentLeagueId,
      seasonsProcessed: allLeagueIds.length,
      ...result,
      totalRecords,
      durationMs: Date.now() - startTime,
    });
  } catch (error) {
    console.error("Error syncing league data:", error);
    return errorResponse(error);
  }
});
