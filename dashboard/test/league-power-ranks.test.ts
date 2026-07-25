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
  return await import('../src/lib/league-power-ranks');
}

describe('league power ranks store', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', freshLocalStorage());
    vi.stubGlobal('window', { addEventListener: () => {} } as unknown as Window & typeof globalThis);
  });

  it('returns null for an unranked league', async () => {
    const { leaguePowerRanks } = await load();
    expect(leaguePowerRanks.get('L1')).toBeNull();
    expect(leaguePowerRanks.get(null)).toBeNull();
  });

  it('saves and reads a per-league order', async () => {
    const { leaguePowerRanks } = await load();
    leaguePowerRanks.set('L1', [3, 1, 2]);
    leaguePowerRanks.set('L2', [9, 8]);
    expect(leaguePowerRanks.get('L1')).toEqual([3, 1, 2]);
    expect(leaguePowerRanks.get('L2')).toEqual([9, 8]);
  });

  it('clear reverts a league to unranked without touching others', async () => {
    const { leaguePowerRanks } = await load();
    leaguePowerRanks.set('L1', [3, 1, 2]);
    leaguePowerRanks.set('L2', [9, 8]);
    leaguePowerRanks.clear('L1');
    expect(leaguePowerRanks.get('L1')).toBeNull();
    expect(leaguePowerRanks.get('L2')).toEqual([9, 8]);
  });

  it('persists across a reload', async () => {
    const ls = freshLocalStorage();
    vi.stubGlobal('localStorage', ls);
    const first = await load();
    first.leaguePowerRanks.set('L1', [2, 1, 3]);
    const second = await load();
    expect(second.leaguePowerRanks.get('L1')).toEqual([2, 1, 3]);
  });

  it('ignores malformed stored data', async () => {
    const ls = freshLocalStorage();
    ls.setItem('yap.leaguePowerRanks', '{"L1":"nope","L2":[1,2]}');
    vi.stubGlobal('localStorage', ls);
    const { leaguePowerRanks } = await load();
    expect(leaguePowerRanks.get('L1')).toBeNull();
    expect(leaguePowerRanks.get('L2')).toEqual([1, 2]);
  });
});
