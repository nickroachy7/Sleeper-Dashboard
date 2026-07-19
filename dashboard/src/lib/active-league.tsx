import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { createLocalStorageLeagueStore, type LeagueStore, type TrackedLeague } from './league-store';
import { createAccountLeagueStore } from './account-league-store';
import { useAuth } from './auth';
import { supabase } from './supabase';

// ── Active-league context ─────────────────────────────────────────
// Single source of truth for "which league am I viewing." Resolution
// priority: `?league=` URL param (shareable / sample preview) → stored active
// id → null. A null active id means the visitor has NO league — a fresh public
// visitor — and the app shows the onboarding funnel rather than defaulting to
// someone else's data.

// Guests persist in localStorage; signed-in users in the user_leagues table
// (the hybrid plan). One guest-store instance for the app's lifetime — it's
// also the fallback while auth is still resolving.
const guestStore: LeagueStore = createLocalStorageLeagueStore();

interface ActiveLeagueValue {
  /** Leagues the visitor has added (empty until they add one). */
  leagues: TrackedLeague[];
  /**
   * Active root league_id, or null when the visitor has no league at all.
   * Downstream (useLeagueIds) resolves null to "no current league" — no data —
   * rather than defaulting to a demo league.
   */
  activeLeagueId: string | null;
  /**
   * True when there's a league to show: the visitor has added one, or is
   * previewing via a `?league=` link. False = fresh visitor → onboarding.
   */
  hasLeague: boolean;
  /**
   * True when viewing a league via `?league=` that the visitor hasn't added —
   * i.e. a sample/shared preview. Drives the "this is a sample, add your own" UI.
   */
  isPreview: boolean;
  setActiveLeague: (rootLeagueId: string | null) => void;
  addLeague: (league: TrackedLeague) => void;
  removeLeague: (rootLeagueId: string) => void;
}

const ActiveLeagueContext = createContext<ActiveLeagueValue | null>(null);

export function ActiveLeagueProvider({ children }: { children: ReactNode }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlLeagueId = searchParams.get('league');
  const { user } = useAuth();
  const userId = user?.id ?? null;

  // Pick the store for the current auth state. The account store loads its
  // rows (and folds in any guest leftovers) asynchronously after creation.
  // Keyed on the user id, not the user object — token refreshes swap the
  // object identity and must not rebuild the store.
  const store = useMemo<LeagueStore>(
    () => (userId ? createAccountLeagueStore(userId) : guestStore),
    [userId]
  );

  // Dispose the previous account store when auth state swaps it out, so its
  // my-team mirror subscription doesn't keep writing for a stale user.
  const prevStore = useRef<LeagueStore | null>(null);
  useEffect(() => {
    const prev = prevStore.current;
    if (prev && prev !== store) prev.dispose?.();
    prevStore.current = store;
  }, [store]);

  // Subscribe to the store so the whole tree re-renders on add/remove/switch.
  const leagues = useSyncExternalStore(store.subscribe, store.list, store.list);
  const storedActiveId = useSyncExternalStore(store.subscribe, store.getActiveId, store.getActiveId);

  // A `?league=` param is a live, top-priority override for the session (shareable
  // links) but is NOT persisted — only an explicit switch/add writes to storage.
  // Unresolvable ids fall back to the DB default downstream (see useLeagueIds),
  // so an invalid shared link degrades gracefully instead of poisoning storage.
  // The stored active id is a per-device pointer. Trust it while SIGNED IN (the
  // account list may still be loading — showing the dashboard beats an
  // onboarding flash). For a SIGNED-OUT visitor, only honor it if it names one
  // of their own guest leagues; otherwise it's a stale pointer to an account
  // league they can no longer see (session expired, signed out in another tab),
  // and it must not keep the app in a "you have a league" state.
  const storedActiveValid =
    !!storedActiveId && (!!userId || leagues.some((l) => l.rootLeagueId === storedActiveId));
  const activeLeagueId = urlLeagueId ?? (storedActiveValid ? storedActiveId : null);

  // Onboarding vs. dashboard: a visitor "has a league" if they've added one,
  // are previewing via a shareable link, or hold a valid active pointer.
  const isPreview = !!urlLeagueId && !leagues.some((l) => l.rootLeagueId === urlLeagueId);
  const hasLeague = leagues.length > 0 || !!urlLeagueId || storedActiveValid;

  // Keep the tracked league's last_viewed_at fresh so the TTL cleanup only
  // prunes genuinely abandoned leagues. Fire once per active id per session;
  // best-effort (ignore errors — the seed league isn't tracked-writable path).
  const touched = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!activeLeagueId || touched.current.has(activeLeagueId)) return;
    touched.current.add(activeLeagueId);
    // Best-effort — ignore errors (e.g. the DB-default demo league isn't tracked).
    supabase.rpc('touch_tracked_league', { p_root: activeLeagueId }).then(() => {}, () => {});
  }, [activeLeagueId]);

  const setActiveLeague = useCallback(
    (rootLeagueId: string | null) => {
      store.setActiveId(rootLeagueId);
      // Clear the URL param so it doesn't override a later in-app switch.
      if (searchParams.has('league')) {
        const next = new URLSearchParams(searchParams);
        next.delete('league');
        setSearchParams(next, { replace: true });
      }
    },
    [store, searchParams, setSearchParams]
  );

  const value = useMemo<ActiveLeagueValue>(
    () => ({
      leagues,
      activeLeagueId,
      hasLeague,
      isPreview,
      setActiveLeague,
      addLeague: store.add,
      removeLeague: store.remove,
    }),
    [leagues, activeLeagueId, hasLeague, isPreview, setActiveLeague, store]
  );

  return <ActiveLeagueContext.Provider value={value}>{children}</ActiveLeagueContext.Provider>;
}

export function useActiveLeague(): ActiveLeagueValue {
  const ctx = useContext(ActiveLeagueContext);
  if (!ctx) throw new Error('useActiveLeague must be used within <ActiveLeagueProvider>');
  return ctx;
}
