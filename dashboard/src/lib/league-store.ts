// ── League store ──────────────────────────────────────────────────
// Persistence seam for the set of leagues a visitor has added and which
// one is active. Two implementations behind one interface (the "hybrid"
// plan): this localStorage store for guests, and the account-backed store
// in account-league-store.ts for signed-in users. active-league.tsx picks
// per auth state. The ACTIVE id stays in localStorage for both — it's a
// per-device pointer, not account data.

export interface TrackedLeague {
  /** Current-season (root) league_id — the head of the previous_league_id chain. */
  rootLeagueId: string;
  name: string;
  /** Season of the root league, e.g. "2025". */
  season: string;
}

export interface LeagueStore {
  /** Leagues the visitor has added, in display order. */
  list(): TrackedLeague[];
  /** The active root league_id, or null when the visitor hasn't chosen one. */
  getActiveId(): string | null;
  setActiveId(rootLeagueId: string | null): void;
  /** Add (or update) a league and make it active. No-op dedupe on rootLeagueId. */
  add(league: TrackedLeague): void;
  /** Remove a league; if it was active, active falls back to the first remaining. */
  remove(rootLeagueId: string): void;
  /** Subscribe to changes (also fires on cross-tab `storage` events). Returns an unsubscribe. */
  subscribe(listener: () => void): () => void;
  /** Release internal subscriptions when the store is swapped out (account store only). */
  dispose?(): void;
}

const LIST_KEY = 'sleeper_dash.leagues';
/** Active league id — per-device state shared by BOTH store implementations. */
export const ACTIVE_KEY = 'sleeper_dash.activeLeagueId';

/** Guest league list straight from localStorage (used by the account-store merge). */
export function readGuestLeagues(): TrackedLeague[] {
  return readList();
}

// Live guest-store instances, so clearing guest state (sign-out, or the
// post-merge cleanup) can refresh their caches — same-tab writes don't fire
// `storage` events.
const instanceRefreshers = new Set<() => void>();

/** Wipe the guest league list (keeps the active-id device pointer). */
export function clearGuestLeagues(): void {
  localStorage.removeItem(LIST_KEY);
  instanceRefreshers.forEach((r) => r());
}

function readList(): TrackedLeague[] {
  try {
    const raw = localStorage.getItem(LIST_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (l): l is TrackedLeague =>
        !!l && typeof l.rootLeagueId === 'string' && typeof l.name === 'string' && typeof l.season === 'string'
    );
  } catch {
    return [];
  }
}

function writeList(list: TrackedLeague[]): void {
  localStorage.setItem(LIST_KEY, JSON.stringify(list));
}

/** localStorage-backed store. In-tab changes notify synchronously; other tabs via `storage`. */
export function createLocalStorageLeagueStore(): LeagueStore {
  const listeners = new Set<() => void>();

  // useSyncExternalStore requires a *stable* snapshot reference between renders,
  // so cache the parsed list and only swap the reference when it actually changes.
  let cache: TrackedLeague[] = readList();
  const emit = () => listeners.forEach((l) => l());
  const refreshList = () => {
    cache = readList();
    emit();
  };

  // Cross-tab sync: another tab writing our keys should refresh this one.
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key === LIST_KEY) refreshList();
      else if (e.key === ACTIVE_KEY) emit();
    });
  }
  instanceRefreshers.add(refreshList);

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
      const list = readList();
      const idx = list.findIndex((l) => l.rootLeagueId === league.rootLeagueId);
      if (idx >= 0) list[idx] = league;
      else list.push(league);
      writeList(list);
      localStorage.setItem(ACTIVE_KEY, league.rootLeagueId);
      refreshList();
    },

    remove(rootLeagueId) {
      const list = readList().filter((l) => l.rootLeagueId !== rootLeagueId);
      writeList(list);
      if (localStorage.getItem(ACTIVE_KEY) === rootLeagueId) {
        const next = list[0]?.rootLeagueId ?? null;
        if (next) localStorage.setItem(ACTIVE_KEY, next);
        else localStorage.removeItem(ACTIVE_KEY);
      }
      refreshList();
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
