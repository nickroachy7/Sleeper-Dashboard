import { useSyncExternalStore } from 'react';

// ── Daily opinion streak ─────────────────────────────────────────────────────
// The habit ritual that replaces the once-per-session interrupt modal: a small,
// dismissible "make N calls today" surface with a day-streak counter. Habit, not
// interruption — the user opts in each day, and consecutive days build a streak.
//
// All state is localStorage (per device, guest-friendly). No account required —
// like the vote signal itself, this is low-friction by design.

const KEY = 'yap.dailyStreak';
/** How many calls make a completed day. */
export const DAILY_GOAL = 5;

interface StreakState {
  /** Local date (YYYY-MM-DD) the counts below belong to. */
  day: string;
  /** Calls made today. */
  today: number;
  /** Consecutive completed days ending on `lastCompletedDay`. */
  streak: number;
  /** The last day the goal was hit (YYYY-MM-DD), or '' if never. */
  lastCompletedDay: string;
}

const EMPTY: StreakState = { day: '', today: 0, streak: 0, lastCompletedDay: '' };

/** Local calendar date as YYYY-MM-DD (not UTC — the streak should roll over at
 *  the user's midnight, matching how they think about "today"). */
function localDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function read(): StreakState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const p = JSON.parse(raw);
    if (!p || typeof p !== 'object') return EMPTY;
    return {
      day: typeof p.day === 'string' ? p.day : '',
      today: Number.isFinite(p.today) ? p.today : 0,
      streak: Number.isFinite(p.streak) ? p.streak : 0,
      lastCompletedDay: typeof p.lastCompletedDay === 'string' ? p.lastCompletedDay : '',
    };
  } catch {
    return EMPTY;
  }
}

function write(s: StreakState) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* quota */ }
}

const listeners = new Set<() => void>();
let cache = read();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => { if (e.key === KEY) { cache = read(); emit(); } });
}

/** Normalize state to `now`: if the stored day isn't today, roll the counter
 *  over (and reset the streak if a full day was skipped). Returns the fresh
 *  state; also writes it if anything changed. */
function normalized(now: Date): StreakState {
  const today = localDay(now);
  const s = cache;
  if (s.day === today) return s;

  // A new day. Was yesterday completed? If the last completed day was literally
  // yesterday, the streak continues from today; if we skipped a day, it resets.
  const yesterday = localDay(new Date(now.getTime() - 86_400_000));
  const streakAlive = s.lastCompletedDay === today || s.lastCompletedDay === yesterday;
  const next: StreakState = {
    day: today,
    today: 0,
    streak: streakAlive ? s.streak : 0,
    lastCompletedDay: s.lastCompletedDay,
  };
  cache = next;
  write(next);
  return next;
}

export interface DailyStreak extends StreakState {
  /** Calls remaining to complete today's goal. */
  remaining: number;
  /** True once today's goal is met. */
  completeToday: boolean;
}

function snapshot(now: Date): DailyStreak {
  const s = normalized(now);
  const completeToday = s.today >= DAILY_GOAL;
  return { ...s, remaining: Math.max(0, DAILY_GOAL - s.today), completeToday };
}

export const dailyStreak = {
  /** Current state, rolled over to `now`. Pass the caller's Date (render-pure). */
  get(now: Date): DailyStreak {
    return snapshot(now);
  },

  /** Record one completed call. Increments today's count; on hitting the goal,
   *  bumps the streak if today wasn't already counted. */
  record(now: Date): void {
    const s = normalized(now);
    const today = localDay(now);
    const nextToday = s.today + 1;
    let streak = s.streak;
    let lastCompletedDay = s.lastCompletedDay;
    // Completing the goal exactly now (crossing the threshold) advances the
    // streak once for today.
    if (s.today < DAILY_GOAL && nextToday >= DAILY_GOAL && lastCompletedDay !== today) {
      streak = streak + 1;
      lastCompletedDay = today;
    }
    cache = { day: today, today: nextToday, streak, lastCompletedDay };
    write(cache);
    emit();
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

/** React binding. Callers pass `now` for the render-pure rollover; the store
 *  itself is the reactive source (re-renders on record / cross-tab writes). */
export function useDailyStreak(now: Date): DailyStreak {
  useSyncExternalStore(dailyStreak.subscribe, () => cache, () => cache);
  return snapshot(now);
}
