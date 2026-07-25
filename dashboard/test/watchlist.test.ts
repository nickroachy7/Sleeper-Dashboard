import { describe, it, expect, beforeEach, vi } from 'vitest';

function freshLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  } as Storage;
}

async function load() {
  vi.resetModules();
  return await import('../src/lib/watchlist');
}

describe('watchlist store', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', freshLocalStorage());
    vi.stubGlobal('window', { addEventListener: () => {} } as unknown as Window & typeof globalThis);
  });

  it('starts empty', async () => {
    const { watchlist } = await load();
    expect(watchlist.all()).toEqual([]);
    expect(watchlist.has('11560')).toBe(false);
  });

  it('adds newest-first and dedupes', async () => {
    const { watchlist } = await load();
    watchlist.add('11560');
    watchlist.add('4984');
    watchlist.add('11560'); // dup — no-op
    expect(watchlist.all()).toEqual(['4984', '11560']);
    expect(watchlist.has('4984')).toBe(true);
  });

  it('toggle adds then removes', async () => {
    const { watchlist } = await load();
    watchlist.toggle('PICK:2027-1');
    expect(watchlist.has('PICK:2027-1')).toBe(true);
    watchlist.toggle('PICK:2027-1');
    expect(watchlist.has('PICK:2027-1')).toBe(false);
  });

  it('persists across a reload (reads from localStorage)', async () => {
    const ls = freshLocalStorage();
    vi.stubGlobal('localStorage', ls);
    const first = await load();
    first.watchlist.add('11560');
    first.watchlist.add('4984');
    // Re-import with the SAME localStorage → state restored.
    const second = await load();
    expect(second.watchlist.all()).toEqual(['4984', '11560']);
  });

  it('remove is a no-op for an absent id', async () => {
    const { watchlist } = await load();
    watchlist.add('11560');
    watchlist.remove('nope');
    expect(watchlist.all()).toEqual(['11560']);
  });
});
