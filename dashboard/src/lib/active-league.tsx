import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { createLocalStorageLeagueStore, type LeagueStore, type TrackedLeague } from './league-store';
import { supabase } from './supabase';

// ── Active-league context ─────────────────────────────────────────
// Single source of truth for "which league am I viewing." Resolution
// priority: `?league=` URL param (shareable / sample preview) → stored active
// id → null. A null active id means the visitor has NO league — a fresh public
// visitor — and the app shows the onboarding funnel rather than defaulting to
// someone else's data.

// Swap this for a Supabase-Auth-backed store when accounts land (hybrid plan).
const store: LeagueStore = createLocalStorageLeagueStore();

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

  // Subscribe to the store so the whole tree re-renders on add/remove/switch.
  const leagues = useSyncExternalStore(store.subscribe, store.list, store.list);
  const storedActiveId = useSyncExternalStore(store.subscribe, store.getActiveId, store.getActiveId);

  // A `?league=` param is a live, top-priority override for the session (shareable
  // links) but is NOT persisted — only an explicit switch/add writes to storage.
  // Unresolvable ids fall back to the DB default downstream (see useLeagueIds),
  // so an invalid shared link degrades gracefully instead of poisoning storage.
  const activeLeagueId = urlLeagueId ?? storedActiveId ?? null;

  // Onboarding vs. dashboard: a visitor "has a league" if they've added one or
  // are previewing via a shareable link. A preview is a `?league=` league they
  // haven't added themselves.
  const isPreview = !!urlLeagueId && !leagues.some((l) => l.rootLeagueId === urlLeagueId);
  const hasLeague = leagues.length > 0 || !!urlLeagueId;

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
    [searchParams, setSearchParams]
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
    [leagues, activeLeagueId, hasLeague, isPreview, setActiveLeague]
  );

  return <ActiveLeagueContext.Provider value={value}>{children}</ActiveLeagueContext.Provider>;
}

export function useActiveLeague(): ActiveLeagueValue {
  const ctx = useContext(ActiveLeagueContext);
  if (!ctx) throw new Error('useActiveLeague must be used within <ActiveLeagueProvider>');
  return ctx;
}
