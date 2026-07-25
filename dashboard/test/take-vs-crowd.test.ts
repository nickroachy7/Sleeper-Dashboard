import { describe, it, expect, vi } from 'vitest';

// The take-vs-crowd hook pulls in the supabase client transitively (via the
// query hooks it composes), which reads Vite env at import time. Stub it so the
// module imports under vitest's node environment; we only exercise the pure
// positionRanks helper, not the React hook.
vi.stubEnv('VITE_SUPABASE_URL', 'https://stub.supabase.co');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'stub-anon-key');

const { positionRanks } = await import('../src/hooks/useTakeVsCrowd');

describe('positionRanks — the unit behind "your take vs the crowd"', () => {
  const players: Record<string, { pos: string; v: number }> = {
    qb1: { pos: 'QB', v: 9000 },
    qb2: { pos: 'QB', v: 7000 },
    qb3: { pos: 'QB', v: 5000 },
    wr1: { pos: 'WR', v: 8500 },
    wr2: { pos: 'WR', v: 8000 },
    pickish: { pos: 'PICK', v: 3000 }, // still ranked within its own bucket
  };
  const ids = Object.keys(players);
  const posOf = (id: string) => players[id]?.pos ?? null;
  const valOf = (id: string) => players[id]?.v ?? 0;

  it('ranks each position independently, top value = rank 1', () => {
    const r = positionRanks(ids, posOf, valOf);
    expect(r.get('qb1')).toBe(1);
    expect(r.get('qb2')).toBe(2);
    expect(r.get('qb3')).toBe(3);
    expect(r.get('wr1')).toBe(1);
    expect(r.get('wr2')).toBe(2);
  });

  it('is independent across positions (a QB and WR can both be #1)', () => {
    const r = positionRanks(ids, posOf, valOf);
    expect(r.get('qb1')).toBe(1);
    expect(r.get('wr1')).toBe(1);
  });

  it('skips players with no position', () => {
    const withNull = [...ids, 'ghost'];
    const r = positionRanks(withNull, (id) => (id === 'ghost' ? null : posOf(id)), valOf);
    expect(r.has('ghost')).toBe(false);
    expect(r.size).toBe(ids.length);
  });

  it('models a real delta: user ranks qb3 over qb2 → higher-than-crowd', () => {
    // Crowd order by value: qb1 > qb2 > qb3  →  qb3 is QB3.
    const crowd = positionRanks(ids, posOf, valOf);
    // User's board bumps qb3 above qb2 (their blended values):
    const userVal: Record<string, number> = { qb1: 9000, qb2: 5000, qb3: 7000, wr1: 8500, wr2: 8000, pickish: 3000 };
    const you = positionRanks(ids, posOf, (id) => userVal[id] ?? 0);
    expect(crowd.get('qb3')).toBe(3);
    expect(you.get('qb3')).toBe(2);
    // posRankDelta = crowd − you = 3 − 2 = +1 ⇒ you're one spot higher.
    expect((crowd.get('qb3')! - you.get('qb3')!)).toBe(1);
  });
});
