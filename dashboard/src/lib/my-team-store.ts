// ── My-team store ─────────────────────────────────────────────────
// Persistence seam for "which roster is the visitor's own" — one choice per
// root league. localStorage-backed in BOTH guest and account modes: for
// signed-in users this map is the fast local replica, and the account league
// store (account-league-store.ts) mirrors it into user_leagues.my_roster_id.
// Keyed by rootLeagueId so each tracked league remembers its own team.
//
// Roster ids are stable across a dynasty's season chain, so a single
// roster_id identifies the visitor's team in every season of that league.

const KEY = 'sleeper_dash.myTeam'; // { [rootLeagueId]: rosterId }

type MyTeamMap = Record<string, number>;

function readMap(): MyTeamMap {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: MyTeamMap = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function writeMap(map: MyTeamMap): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* ignore quota errors */
  }
}

const listeners = new Set<() => void>();

// Stable snapshot cache for useSyncExternalStore (reference only changes on write).
let cache: MyTeamMap = readMap();
const emit = () => listeners.forEach((l) => l());
const refresh = () => { cache = readMap(); emit(); };

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => { if (e.key === KEY) refresh(); });
}

export const myTeamStore = {
  /** Stable snapshot of the whole rootLeagueId → rosterId map. */
  getAll: (): MyTeamMap => cache,

  /** The visitor's roster_id for a league, or null if not chosen. */
  get(rootLeagueId: string | null): number | null {
    if (!rootLeagueId) return null;
    const v = cache[rootLeagueId];
    return typeof v === 'number' ? v : null;
  },

  /** Set (or clear, with null) the visitor's roster for a league. */
  set(rootLeagueId: string, rosterId: number | null): void {
    const map = readMap();
    if (rosterId == null) delete map[rootLeagueId];
    else map[rootLeagueId] = rosterId;
    writeMap(map);
    refresh();
  },

  /** Replace the whole map (account sign-in pulls choices from user_leagues). */
  replaceAll(map: Record<string, number>): void {
    writeMap(map);
    refresh();
  },

  /** Wipe all choices (sign-out — they were merged into the account). */
  clearAll(): void {
    localStorage.removeItem(KEY);
    refresh();
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
