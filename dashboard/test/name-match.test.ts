import { describe, it, expect } from 'vitest';
import { normalizeName } from '../scripts/lib/nflverse';

// normalizeName is the join key between nflverse production data and Sleeper
// players (name + position). Whatever it can't reconcile becomes a player with
// no facts → no community rating → no value in the app. These tests document
// what it DOES handle and pin the known gap (nickname/short-name mismatches like
// "Josh Palmer" vs "Joshua Palmer") so any future fix is captured as a change.

describe('normalizeName — what it reconciles', () => {
  it('lowercases and trims', () => {
    expect(normalizeName('  Justin  Jefferson ')).toBe('justin jefferson');
  });
  it('strips apostrophes and periods/hyphens', () => {
    expect(normalizeName("De'Von Achane")).toBe('devon achane');
    expect(normalizeName('A.J. Brown')).toBe('a j brown');
    expect(normalizeName('Amon-Ra St. Brown')).toBe('amon ra st brown');
  });
  it('drops generational suffixes so Jr/Sr/II/III/IV match', () => {
    expect(normalizeName('Marvin Harrison Jr.')).toBe('marvin harrison');
    expect(normalizeName('Michael Pittman Jr')).toBe('michael pittman');
    expect(normalizeName('Odell Beckham Jr.')).toBe('odell beckham');
    expect(normalizeName('Ken Walker III')).toBe('ken walker');
  });
});

describe('normalizeName — KNOWN GAP (Finding 1): nickname / short-name mismatch', () => {
  // nflverse display_name uses the short/common name; Sleeper stores the legal
  // first name. normalizeName does not reconcile these, so the join misses and
  // the player gets no value. Documented here as an expected-failure tripwire:
  // if a future fix makes these equal, flip the assertion.
  it('does NOT currently equate Josh vs Joshua (Joshua Palmer is unrated in prod)', () => {
    expect(normalizeName('Josh Palmer')).not.toBe(normalizeName('Joshua Palmer'));
  });
  it('does NOT currently equate Cam vs Cameron, Mike vs Michael', () => {
    expect(normalizeName('Cam Akers')).not.toBe(normalizeName('Cameron Akers'));
    expect(normalizeName('Mike Evans')).not.toBe(normalizeName('Michael Evans'));
  });
});
