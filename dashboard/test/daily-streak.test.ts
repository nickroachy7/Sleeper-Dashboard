import { describe, it, expect, beforeEach, vi } from 'vitest';

// daily-streak persists to localStorage and reads it at module load, so give it
// a fresh in-memory localStorage per test and re-import the module each time.
function freshLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  } as Storage;
}

async function loadModule() {
  vi.resetModules();
  return await import('../src/lib/daily-streak');
}

describe('daily streak', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', freshLocalStorage());
    // window with a no-op addEventListener so the module's storage listener binds.
    vi.stubGlobal('window', { addEventListener: () => {} } as unknown as Window & typeof globalThis);
  });

  const day = (s: string) => new Date(`${s}T12:00:00`);

  it('starts empty and counts up within a day', async () => {
    const { dailyStreak, DAILY_GOAL } = await loadModule();
    const d = day('2026-07-25');
    expect(dailyStreak.get(d).today).toBe(0);
    expect(dailyStreak.get(d).remaining).toBe(DAILY_GOAL);
    dailyStreak.record(d);
    dailyStreak.record(d);
    expect(dailyStreak.get(d).today).toBe(2);
    expect(dailyStreak.get(d).completeToday).toBe(false);
  });

  it('completing the goal advances the streak exactly once', async () => {
    const { dailyStreak, DAILY_GOAL } = await loadModule();
    const d = day('2026-07-25');
    for (let i = 0; i < DAILY_GOAL; i++) dailyStreak.record(d);
    let s = dailyStreak.get(d);
    expect(s.completeToday).toBe(true);
    expect(s.streak).toBe(1);
    // Extra calls same day don't double-count the streak.
    dailyStreak.record(d);
    s = dailyStreak.get(d);
    expect(s.streak).toBe(1);
    expect(s.today).toBe(DAILY_GOAL + 1);
  });

  it('a consecutive completed day extends the streak', async () => {
    const { dailyStreak, DAILY_GOAL } = await loadModule();
    for (let i = 0; i < DAILY_GOAL; i++) dailyStreak.record(day('2026-07-25'));
    expect(dailyStreak.get(day('2026-07-25')).streak).toBe(1);
    // Next calendar day: counter rolls to 0 but streak stays alive on rollover.
    const next = day('2026-07-26');
    expect(dailyStreak.get(next).today).toBe(0);
    for (let i = 0; i < DAILY_GOAL; i++) dailyStreak.record(next);
    expect(dailyStreak.get(next).streak).toBe(2);
  });

  it('skipping a day resets the streak to that day only', async () => {
    const { dailyStreak, DAILY_GOAL } = await loadModule();
    for (let i = 0; i < DAILY_GOAL; i++) dailyStreak.record(day('2026-07-25'));
    expect(dailyStreak.get(day('2026-07-25')).streak).toBe(1);
    // Jump two days ahead (skipped the 26th) → streak restarts at 0, then this
    // day's completion makes it 1 (not 2).
    const skip = day('2026-07-27');
    expect(dailyStreak.get(skip).streak).toBe(0);
    for (let i = 0; i < DAILY_GOAL; i++) dailyStreak.record(skip);
    expect(dailyStreak.get(skip).streak).toBe(1);
  });
});
