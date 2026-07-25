import { describe, it, expect, vi } from 'vitest';

// fetchAllRows is the guard against PostgREST's hard 1000-row response cap. A
// single .select() silently truncates at 1000, which is exactly how the Players
// ranking board lost every player past rank ~1000. This test pins the paging
// contract: keep requesting 1000-row windows until a short (or empty) page.

// queries.ts pulls in the supabase client, which reads Vite env at import time.
// Stub those so the module imports cleanly under vitest's node environment.
vi.stubEnv('VITE_SUPABASE_URL', 'https://stub.supabase.co');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'stub-anon-key');

const { fetchAllRows } = await import('../src/hooks/queries');

function pagedSource(total: number) {
  const calls: Array<[number, number]> = [];
  const fetchPage = (from: number, to: number) => {
    calls.push([from, to]);
    const rows: number[] = [];
    for (let i = from; i <= to && i < total; i++) rows.push(i);
    return Promise.resolve({ data: rows });
  };
  return { fetchPage, calls };
}

describe('fetchAllRows — PostgREST 1000-row cap paging', () => {
  it('returns every row when the total exceeds one page (the truncation bug)', async () => {
    const { fetchPage, calls } = pagedSource(2534); // the live community board size
    const rows = await fetchAllRows<number>(fetchPage);
    expect(rows.length).toBe(2534);
    // Windows are [0-999], [1000-1999], [2000-2999]; last page is short → stop.
    expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it('exactly 1000 rows still probes a second page (a full page is ambiguous)', async () => {
    const { fetchPage, calls } = pagedSource(1000);
    const rows = await fetchAllRows<number>(fetchPage);
    expect(rows.length).toBe(1000);
    // First page is full (1000) so it must fetch again; the 2nd page is empty → stop.
    expect(calls).toEqual([[0, 999], [1000, 1999]]);
  });

  it('stops immediately on an empty first page', async () => {
    const { fetchPage, calls } = pagedSource(0);
    const rows = await fetchAllRows<number>(fetchPage);
    expect(rows).toEqual([]);
    expect(calls).toEqual([[0, 999]]);
  });

  it('handles a partial single page without a second request', async () => {
    const { fetchPage, calls } = pagedSource(42);
    const rows = await fetchAllRows<number>(fetchPage);
    expect(rows.length).toBe(42);
    expect(calls).toEqual([[0, 999]]);
  });

  it('tolerates a null data page (treats it as end-of-data)', async () => {
    const calls: number[] = [];
    const rows = await fetchAllRows<number>((from) => {
      calls.push(from);
      return Promise.resolve({ data: null });
    });
    expect(rows).toEqual([]);
    expect(calls).toEqual([0]);
  });
});
