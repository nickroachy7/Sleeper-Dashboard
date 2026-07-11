// ── Add-league service ────────────────────────────────────────────
// Client-side onboarding: resolve a Sleeper username to their leagues (pure
// Sleeper API, CORS-open), then ask our edge function to ingest the chosen one.

import { supabase } from './supabase';
import { sleeperApi } from './sleeper-api';

export interface DiscoveredLeague {
  league_id: string;
  name: string;
  season: string;
  total_rosters: number;
  avatar: string | null;
}

/** Resolve a Sleeper username (or numeric user_id) to the leagues they're in for a season. */
export async function findLeaguesForUsername(usernameOrId: string, season?: string): Promise<{
  userId: string;
  displayName: string;
  season: string;
  leagues: DiscoveredLeague[];
}> {
  const handle = usernameOrId.trim();
  if (!handle) throw new Error('Enter a Sleeper username');

  // Numeric input is already a user_id; otherwise resolve username → user_id.
  const user = /^\d+$/.test(handle) ? { user_id: handle, display_name: handle } : await sleeperApi.getUser(handle);
  if (!user?.user_id) throw new Error(`No Sleeper user "${handle}"`);

  const resolvedSeason = season ?? (await sleeperApi.getNflState().then((s) => s.season).catch(() => `${new Date().getFullYear()}`));
  const raw = await sleeperApi.getLeagues(user.user_id, resolvedSeason);

  const leagues: DiscoveredLeague[] = (raw || []).map((l) => ({
    league_id: l.league_id,
    name: l.name,
    season: l.season,
    total_rosters: l.total_rosters,
    avatar: (l as { avatar?: string | null }).avatar ?? null,
  }));

  return {
    userId: user.user_id,
    displayName: (user as { display_name?: string }).display_name || handle,
    season: resolvedSeason,
    leagues,
  };
}

export interface AddLeagueResult {
  rootLeagueId: string;
  name: string;
  season: string;
  seasonsProcessed: number;
}

/**
 * Ask the edge function to ingest a league and register it for ongoing sync.
 * Runs the initial multi-season sync server-side, so this can take a while.
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
    seasonsProcessed: data.seasonsProcessed ?? 0,
  };
}
