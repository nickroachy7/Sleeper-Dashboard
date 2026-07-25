import { describe, it, expect } from 'vitest';
import {
  isIdp,
  isVisiblePosition,
  matchesPositionFilter,
  SKILL_POSITIONS,
  IDP_POSITIONS,
} from '../src/lib/positions';

// Position gating is the single filter the ranking board, all three vote pools,
// the feed movers, and the profile boards share. It also has to stay in lockstep
// with the backend IDP list (compute-community-values + seed-idp-prior), because
// the engine ranks IDP on a separate curve keyed off exactly this set.

describe('isIdp', () => {
  it('treats every canonical IDP code as IDP', () => {
    for (const p of IDP_POSITIONS) expect(isIdp(p)).toBe(true);
  });
  it('treats skill positions as non-IDP', () => {
    for (const p of SKILL_POSITIONS) expect(isIdp(p)).toBe(false);
  });
  it('is false for null/empty/unknown', () => {
    expect(isIdp(null)).toBe(false);
    expect(isIdp(undefined)).toBe(false);
    expect(isIdp('')).toBe(false);
    expect(isIdp('K')).toBe(false);
  });
});

describe('isVisiblePosition', () => {
  it('always shows offense regardless of the IDP toggle', () => {
    for (const p of SKILL_POSITIONS) {
      expect(isVisiblePosition(p, false)).toBe(true);
      expect(isVisiblePosition(p, true)).toBe(true);
    }
  });
  it('hides IDP unless opted in', () => {
    expect(isVisiblePosition('LB', false)).toBe(false);
    expect(isVisiblePosition('LB', true)).toBe(true);
  });
  it('hides players with no position', () => {
    expect(isVisiblePosition(null, true)).toBe(false);
  });
});

describe('matchesPositionFilter', () => {
  it('ALL matches everything', () => {
    expect(matchesPositionFilter('QB', 'ALL')).toBe(true);
    expect(matchesPositionFilter(null, 'ALL')).toBe(true);
  });
  it('skill pills are exact matches', () => {
    expect(matchesPositionFilter('QB', 'QB')).toBe(true);
    expect(matchesPositionFilter('RB', 'QB')).toBe(false);
  });
  it('IDP family pills catch their whole family', () => {
    expect(matchesPositionFilter('EDGE', 'DL')).toBe(true);
    expect(matchesPositionFilter('DT', 'DL')).toBe(true);
    expect(matchesPositionFilter('CB', 'DB')).toBe(true);
    expect(matchesPositionFilter('MLB', 'LB')).toBe(true);
    expect(matchesPositionFilter('CB', 'LB')).toBe(false);
  });
  it('is false for null position against a specific filter', () => {
    expect(matchesPositionFilter(null, 'QB')).toBe(false);
  });
});

describe('frontend IDP set matches the backend canonical list', () => {
  // Mirror of compute-community-values IDP_POSITIONS / seed-idp-prior. If the
  // backend list changes, update both — this test is the tripwire.
  const BACKEND_IDP = [
    'DL', 'DE', 'DT', 'NT', 'EDGE',
    'LB', 'ILB', 'OLB', 'MLB',
    'DB', 'CB', 'S', 'SS', 'FS',
  ];
  it('has the same members', () => {
    expect([...IDP_POSITIONS].sort()).toEqual([...BACKEND_IDP].sort());
  });
});
