import { supabase } from './supabase';
import {
  ACTIVE_KEY,
  clearGuestLeagues,
  readGuestLeagues,
  type LeagueStore,
  type TrackedLeague,
} from './league-store';
import { myTeamStore } from './my-team-store';

// ── Account league store ──────────────────────────────────────────
// LeagueStore backed by the user_leagues table (RLS: own rows only) for
// signed-in users. The in-memory cache is the source of truth for the UI —
// writes update it synchronously and mirror to the server best-effort, so the
// app feels identical to the guest localStorage store.
//
// The ACTIVE league id stays in localStorage (ACTIVE_KEY): it's a per-device
// pointer, not account data — you can be on your phone in one league and your
// laptop in another.
//
// "My team" choices ride along: user_leagues.my_roster_id syncs with the
// local myTeamStore map (server wins on load; local edits push up), so the
// pick follows the account across devices too.

export function createAccountLeagueStore(userId: string): LeagueStore {
  const listeners = new Set<() => void>();

  // Stable snapshot for useSyncExternalStore — reference only swaps on change.
  let cache: TrackedLeague[] = [];
  // Server-known my_roster_id per league, to diff local myTeam edits against.
  const serverRoster = new Map<string, number | null>();

  const emit = () => listeners.forEach((l) => l());

  const warn = (op: string, error: { message: string } | null) => {
    if (error) console.warn(`user_leagues ${op} failed:`, error.message);
  };

  // ── Initial load: pull account rows, merge any guest leftovers ──
  async function load() {
    const { data, error } = await supabase
      .from('user_leagues')
      .select('root_league_id, name, season, my_roster_id')
      .eq('user_id', userId)
      .order('added_at', { ascending: true });
    if (error) {
      warn('select', error);
      return;
    }

    const rows = data ?? [];
    const byId = new Map(rows.map((r) => [r.root_league_id, r]));

    // First sign-in on a device that has guest leagues: fold them into the
    // account, then clear guest storage — they now live server-side. A guest
    // my-team pick fills my_roster_id only where the account has none.
    const guestLeagues = readGuestLeagues();
    const guestTeams = myTeamStore.getAll();
    const toUpsert = guestLeagues
      .filter((g) => !byId.has(g.rootLeagueId))
      .map((g) => ({
        user_id: userId,
        root_league_id: g.rootLeagueId,
        name: g.name,
        season: g.season,
        my_roster_id: guestTeams[g.rootLeagueId] ?? null,
      }));
    let merged = true;
    if (toUpsert.length > 0) {
      const { error: upErr } = await supabase.from('user_leagues').upsert(toUpsert);
      warn('merge-upsert', upErr);
      if (upErr) merged = false;
      else {
        toUpsert.forEach((r) =>
          byId.set(r.root_league_id, {
            root_league_id: r.root_league_id,
            name: r.name,
            season: r.season,
            my_roster_id: r.my_roster_id,
          })
        );
      }
    }
    // Only clear guest storage once the merge actually landed — a failed
    // upsert must not destroy the only copy of the visitor's league list.
    if (merged && guestLeagues.length > 0) clearGuestLeagues();

    cache = [...byId.values()].map((r) => ({
      rootLeagueId: r.root_league_id,
      name: r.name,
      season: r.season,
    }));

    // My-team map: server value wins; keep local entries for leagues outside
    // the account list (e.g. a ?league= preview the visitor picked a team in).
    const mergedTeams: Record<string, number> = { ...myTeamStore.getAll() };
    for (const r of byId.values()) {
      serverRoster.set(r.root_league_id, r.my_roster_id);
      if (r.my_roster_id != null) mergedTeams[r.root_league_id] = r.my_roster_id;
    }
    myTeamStore.replaceAll(mergedTeams);

    // New device with no active league chosen: land in the first saved league
    // instead of the onboarding funnel — that's the point of the account.
    if (!localStorage.getItem(ACTIVE_KEY) && cache.length > 0) {
      localStorage.setItem(ACTIVE_KEY, cache[0].rootLeagueId);
    }
    emit();
  }
  void load();

  // ── Mirror local my-team edits into user_leagues.my_roster_id ──
  const unsubscribeMyTeam = myTeamStore.subscribe(() => {
    const local = myTeamStore.getAll();
    for (const { rootLeagueId } of cache) {
      const localPick = local[rootLeagueId] ?? null;
      if (serverRoster.get(rootLeagueId) === localPick) continue;
      serverRoster.set(rootLeagueId, localPick);
      supabase
        .from('user_leagues')
        .update({ my_roster_id: localPick })
        .eq('user_id', userId)
        .eq('root_league_id', rootLeagueId)
        .then(({ error }) => warn('roster-update', error));
    }
  });

  return {
    list: () => cache,

    getActiveId() {
      return localStorage.getItem(ACTIVE_KEY);
    },

    setActiveId(rootLeagueId) {
      if (rootLeagueId) localStorage.setItem(ACTIVE_KEY, rootLeagueId);
      else localStorage.removeItem(ACTIVE_KEY);
      emit();
    },

    add(league) {
      const idx = cache.findIndex((l) => l.rootLeagueId === league.rootLeagueId);
      const next = [...cache];
      if (idx >= 0) next[idx] = league;
      else next.push(league);
      cache = next;
      localStorage.setItem(ACTIVE_KEY, league.rootLeagueId);
      emit();
      supabase
        .from('user_leagues')
        .upsert({
          user_id: userId,
          root_league_id: league.rootLeagueId,
          name: league.name,
          season: league.season,
          my_roster_id: myTeamStore.get(league.rootLeagueId),
        })
        .then(({ error }) => warn('upsert', error));
    },

    remove(rootLeagueId) {
      cache = cache.filter((l) => l.rootLeagueId !== rootLeagueId);
      serverRoster.delete(rootLeagueId);
      if (localStorage.getItem(ACTIVE_KEY) === rootLeagueId) {
        const next = cache[0]?.rootLeagueId ?? null;
        if (next) localStorage.setItem(ACTIVE_KEY, next);
        else localStorage.removeItem(ACTIVE_KEY);
      }
      emit();
      supabase
        .from('user_leagues')
        .delete()
        .eq('user_id', userId)
        .eq('root_league_id', rootLeagueId)
        .then(({ error }) => warn('delete', error));
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    dispose() {
      unsubscribeMyTeam();
      listeners.clear();
    },
  };
}

/**
 * Reset all guest-visible league state on sign-out. The leagues and team
 * picks were merged into the account; a signed-out browser should look like
 * a fresh visitor, not retain a copy of account data.
 */
export function clearGuestLeagueState(): void {
  clearGuestLeagues();
  myTeamStore.clearAll();
  localStorage.removeItem(ACTIVE_KEY);
}
