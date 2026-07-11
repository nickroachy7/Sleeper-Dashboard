/**
 * Shared per-league sync.
 *
 * Given a root (current-season) league_id, traverse the `previous_league_id`
 * chain and sync rosters, league users, transactions, traded picks, matchups,
 * drafts, and draft picks for every season. Used by both `sync-league-data`
 * (loops over all tracked leagues on a cron) and `add-league` (one-shot ingest
 * when a visitor adds a new league).
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { fetchWithRetry } from "./fetch-with-retry.ts";

const SLEEPER_API = "https://api.sleeper.app/v1";

export interface SyncResult {
  rosters: number;
  leagueUsers: number;
  transactions: number;
  tradedPicks: number;
  matchups: number;
  drafts: number;
  draftPicks: number;
}

export interface SyncLeagueOutcome {
  result: SyncResult;
  seasonsProcessed: number;
  /** All league_ids in the chain, current season first. */
  allLeagueIds: string[];
  /** Root league metadata (from Sleeper), for tracked_leagues bookkeeping. */
  root: { league_id: string; name: string; season: string } | null;
}

function emptyResult(): SyncResult {
  return { rosters: 0, leagueUsers: 0, transactions: 0, tradedPicks: 0, matchups: 0, drafts: 0, draftPicks: 0 };
}

/** Sync one dynasty (a root league_id + its full previous_league_id chain). */
export async function syncLeagueChain(
  supabase: SupabaseClient,
  rootLeagueId: string,
  currentWeek: number
): Promise<SyncLeagueOutcome> {
  const result = emptyResult();
  const currentLeagueId = rootLeagueId;

  // 1. Traverse league history to discover all season league IDs, upserting
  //    league metadata for each season as we go.
  const allLeagueIds: string[] = [];
  let rootMeta: { league_id: string; name: string; season: string } | null = null;
  let traverseLeagueId: string | null = currentLeagueId;

  while (traverseLeagueId) {
    allLeagueIds.push(traverseLeagueId);
    const leagueData = await fetchWithRetry(`${SLEEPER_API}/league/${traverseLeagueId}`);

    if (leagueData) {
      if (traverseLeagueId === currentLeagueId) {
        rootMeta = { league_id: leagueData.league_id, name: leagueData.name, season: leagueData.season };
      }
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

  console.log(`[${rootLeagueId}] Syncing ${allLeagueIds.length} league seasons`);

  // 2. FIRST PASS: sync users + league_users for EVERY season before any
  // FK-dependent data. Transactions reference creators who may have left
  // the league mid-season — they only appear in an OLDER season's users
  // endpoint, so the full multi-season user set must exist up front or
  // whole transaction batches fail on the creator FK.
  for (const leagueId of allLeagueIds) {
    try {
      const leagueUsers = await fetchWithRetry(`${SLEEPER_API}/league/${leagueId}/users`);
      if (leagueUsers?.length) {
        const userRows = leagueUsers.map((u: any) => ({
          user_id: u.user_id,
          username: u.display_name || u.user_id,
          display_name: u.display_name || u.user_id,
          avatar: u.avatar || null,
          metadata: u.metadata || null,
          updated_at: new Date().toISOString(),
        }));
        await supabase.from("users").upsert(userRows, { onConflict: "user_id", ignoreDuplicates: false });

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
        else console.error(`League users upsert error for ${leagueId}: ${JSON.stringify(error)}`);
      }
    } catch (e) {
      console.error(`Error syncing league users for ${leagueId}:`, e);
    }
  }

  // 3. SECOND PASS: per-season data
  for (const leagueId of allLeagueIds) {
    const isCurrentSeason = leagueId === currentLeagueId;

    // 3a. Rosters
    try {
      const rosters = await fetchWithRetry(`${SLEEPER_API}/league/${leagueId}/rosters`);
      if (rosters?.length) {
        // Backfill any roster owner_ids missing from the users table (former
        // members who left and don't appear in /league/{id}/users). The FK on
        // rosters.owner_id -> users.user_id fails the whole batch otherwise.
        const ownerIds = [...new Set(rosters.map((r: any) => r.owner_id).filter(Boolean))] as string[];
        if (ownerIds.length) {
          const { data: existingUsers } = await supabase.from("users").select("user_id").in("user_id", ownerIds);
          const existingSet = new Set((existingUsers || []).map((u: any) => u.user_id));
          const missingOwnerIds = ownerIds.filter((id) => !existingSet.has(id));
          if (missingOwnerIds.length) {
            console.log(`[${rootLeagueId}] Backfilling ${missingOwnerIds.length} missing users for ${leagueId}`);
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
            await supabase.from("users").upsert(backfillRows, { onConflict: "user_id", ignoreDuplicates: true });
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

    // 3b. Transactions — current season: last 4 weeks, historical: all 18 weeks
    try {
      const startWeek = isCurrentSeason ? Math.max(0, currentWeek - 4) : 0;
      const endWeek = isCurrentSeason ? currentWeek : 18;
      for (let week = startWeek; week <= endWeek; week++) {
        const transactions = await fetchWithRetry(`${SLEEPER_API}/league/${leagueId}/transactions/${week}`);
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
          else console.error(`Transactions upsert error for ${leagueId} week ${week}: ${JSON.stringify(error)}`);
        }
      }
    } catch (e) {
      console.error(`Error syncing transactions for ${leagueId}:`, e);
    }

    // 3c. Traded Picks
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

    // 3d. Matchups — current season: current week, historical: all 18 weeks
    try {
      const matchupStartWeek = isCurrentSeason ? currentWeek : 1;
      const matchupEndWeek = isCurrentSeason ? currentWeek : 18;
      for (let week = matchupStartWeek; week <= matchupEndWeek; week++) {
        const matchups = await fetchWithRetry(`${SLEEPER_API}/league/${leagueId}/matchups/${week}`);
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

    // 3e. Drafts and Draft Picks
    try {
      const draftList = await fetchWithRetry(`${SLEEPER_API}/league/${leagueId}/drafts`);
      if (!draftList?.length) continue;
      for (const summary of draftList) {
        // The list endpoint omits slot_to_roster_id and returns only a partial
        // draft_order; the per-draft endpoint has the complete maps we need.
        const detail = await fetchWithRetry(`${SLEEPER_API}/draft/${summary.draft_id}`);
        const draft = detail || summary;
        const { error: draftError } = await supabase.from("drafts").upsert(
          {
            draft_id: draft.draft_id,
            league_id: leagueId,
            type: draft.type,
            status: draft.status,
            season: draft.season,
            settings: draft.settings,
            start_time: draft.start_time || null,
            slot_to_roster_id: draft.slot_to_roster_id ?? summary.slot_to_roster_id ?? null,
            draft_order: draft.draft_order ?? summary.draft_order ?? null,
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

  return { result, seasonsProcessed: allLeagueIds.length, allLeagueIds, root: rootMeta };
}

/** Fetch the current NFL week (defaults to 1 on failure). */
export async function getCurrentWeek(): Promise<number> {
  try {
    const nflState = await fetchWithRetry(`${SLEEPER_API}/state/nfl`);
    return nflState?.week || 1;
  } catch {
    return 1;
  }
}
