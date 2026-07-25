import { describe, it, expect } from 'vitest';
import {
  pickAssetId,
  isPickAsset,
  parsePickAsset,
  pickEventKey,
  pickLabel,
} from '../src/lib/vote-assets';

// Draft picks share one id space with players across the personal board and
// value_events. A round-trip bug here silently misroutes a pick vote (or drops
// it), so these pin the sentinel format and the board↔event↔label conversions.

describe('pick asset id round-trips', () => {
  it('builds the PICK: sentinel', () => {
    expect(pickAssetId('2027', 1)).toBe('PICK:2027-1');
  });
  it('recognises pick vs player ids', () => {
    expect(isPickAsset('PICK:2027-1')).toBe(true);
    expect(isPickAsset('11560')).toBe(false); // a real player id
  });
  it('parses back to year+round', () => {
    expect(parsePickAsset('PICK:2027-1')).toEqual({ year: '2027', round: 1 });
    expect(parsePickAsset('PICK:2030-4')).toEqual({ year: '2030', round: 4 });
  });
  it('returns null for a player id', () => {
    expect(parsePickAsset('11560')).toBeNull();
    expect(pickEventKey('11560')).toBeNull();
  });
  it('maps to the value_events side key (prefix stripped)', () => {
    // This is the exact key the community engine rates picks by (k:{year}-{round}).
    expect(pickEventKey('PICK:2027-1')).toBe('2027-1');
    expect(pickEventKey('PICK:2028-3')).toBe('2028-3');
  });
  it('id → event-key → matches engine pick_key format YYYY-R', () => {
    const id = pickAssetId('2029', 2);
    expect(pickEventKey(id)).toMatch(/^\d{4}-\d+$/);
  });
});

describe('pickLabel', () => {
  it('renders human ordinals', () => {
    expect(pickLabel('PICK:2027-1')).toBe('2027 1st');
    expect(pickLabel('PICK:2027-2')).toBe('2027 2nd');
    expect(pickLabel('PICK:2027-3')).toBe('2027 3rd');
    expect(pickLabel('PICK:2027-4')).toBe('2027 4th');
  });
  it('falls back to R# beyond the ordinal table', () => {
    expect(pickLabel('PICK:2027-9')).toBe('2027 R9');
  });
  it('returns the input unchanged for a non-pick id', () => {
    expect(pickLabel('11560')).toBe('11560');
  });
});
