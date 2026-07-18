// ── Add-league service ────────────────────────────────────────────
// Client-side onboarding: resolve a Sleeper username OR a league ID to a set of
// leagues (pure Sleeper API, CORS-open), then ask our edge function to ingest
// the chosen one.

import { supabase } from './supabase';
import { sleeperApi } from './sleeper-api';

export interface DiscoveredLeague {
  league_id: string;
  name: string;
  season: string;
  total_rosters: number;
  avatar: string | null;
}

export interface FindResult {
  /** How the input matched — drives the results header. */
  matchedBy: 'league' | 'user';
  displayName: string;
  season: string;
  leagues: DiscoveredLeague[];
}

function toDiscovered(l: { league_id: string; name: string; season: string; total_rosters: number; avatar?: string | null }): DiscoveredLeague {
  return {
    league_id: l.league_id,
    name: l.name,
    season: l.season,
    total_rosters: l.total_rosters,
    avatar: (l as { avatar?: string | null }).avatar ?? null,
  };
}

/**
 * Resolve input to leagues. Accepts:
 *  - a Sleeper username → their leagues for the current season
 *  - a league ID (the big number in the Sleeper app URL) → that league directly
 *  - a numeric user ID → that user's leagues
 *
 * Sleeper user IDs and league IDs are both numeric snowflakes, so for numeric
 * input we try it as a league first (the common paste), then fall back to a user.
 */
export async function findLeaguesForUsername(input: string, season?: string): Promise<FindResult> {
  const handle = input.trim();
  if (!handle) throw new Error('Enter a Sleeper username or league ID');

  const isNumeric = /^\d+$/.test(handle);

  // Numeric → try as a league ID first.
  if (isNumeric) {
    try {
      const league = await sleeperApi.getLeague(handle);
      if (league?.league_id) {
        return { matchedBy: 'league', displayName: league.name, season: league.season, leagues: [toDiscovered(league)] };
      }
    } catch { /* not a league — fall through to a user lookup */ }
  }

  // Otherwise treat as a username (or numeric user ID) and list their leagues.
  let user: { user_id: string; display_name?: string } | null;
  if (isNumeric) {
    user = { user_id: handle, display_name: handle };
  } else {
    try {
      user = await sleeperApi.getUser(handle);
    } catch {
      throw new Error(`No Sleeper user or league "${handle}"`);
    }
  }
  if (!user?.user_id) throw new Error(`No Sleeper user or league "${handle}"`);

  const resolvedSeason = season ?? (await sleeperApi.getNflState().then((s) => s.season).catch(() => `${new Date().getFullYear()}`));
  const raw = await sleeperApi.getLeagues(user.user_id, resolvedSeason);

  return {
    matchedBy: 'user',
    displayName: user.display_name || handle,
    season: resolvedSeason,
    leagues: (raw || []).map(toDiscovered),
  };
}

export interface AddLeagueResult {
  rootLeagueId: string;
  name: string;
  season: string;
}

/**
 * Ask the edge function to register a league and kick off its ingest. The
 * function responds immediately (202) while the multi-season sync runs in the
 * background — poll `tracked_leagues.last_sync_status` ('pending' → 'ok' |
 * 'error') to know when data has landed (see useImportStatus).
 */
export async function ingestLeague(leagueId: string): Promise<AddLeagueResult> {
  const { data, error } = await supabase.functions.invoke('add-league', {
    body: { leagueId },
  });

  if (error) {
    // Surface the function's JSON error message when present.
    const ctxBody = (error as { context?: { body?: unknown } })?.context?.body;
    let message = error.message;
    if (typeof ctxBody === 'string') {
      try {
        const parsed = JSON.parse(ctxBody);
        if (parsed?.error) message = parsed.error;
      } catch { /* keep default */ }
    }
    throw new Error(message);
  }
  if (!data?.success) {
    throw new Error(data?.error || 'Import failed');
  }

  return {
    rootLeagueId: data.league.rootLeagueId,
    name: data.league.name,
    season: data.league.season,
  };
}
