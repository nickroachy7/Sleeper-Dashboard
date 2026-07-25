import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { valueForRank } from '../scripts/lib/prior';

// The rank→value curve is defined TWICE — once in scripts/lib/prior.ts (the
// seed) and once, byte-for-byte, in the edge function
// supabase/functions/compute-community-values/index.ts (the live engine). If
// the two ever drift, seeded history and live values sit on different scales
// and every value in the app is subtly wrong. These tests pin the shape and
// guard the duplication.

const here = dirname(fileURLToPath(import.meta.url));
const engineSrc = readFileSync(
  resolve(here, '../../supabase/functions/compute-community-values/index.ts'),
  'utf8',
);

// Re-implement the engine's curve from the SAME constants, read out of the
// engine source, so this test fails loudly if the engine's numbers change
// without the seed's copy (prior.ts, imported above) changing too.
function readConst(name: string): number {
  const m = engineSrc.match(new RegExp(`const ${name}\\s*=\\s*(-?[0-9.]+)`));
  if (!m) throw new Error(`engine constant ${name} not found`);
  return Number(m[1]);
}

describe('value curve — seed vs engine parity', () => {
  const CURVE_TOP = readConst('CURVE_TOP');
  const CURVE_KNEE = readConst('CURVE_KNEE');
  const CURVE_FLOOR = readConst('CURVE_FLOOR');
  const CURVE_TOTAL = readConst('CURVE_TOTAL');
  const CURVE_K_HEAD = readConst('CURVE_K_HEAD');
  const CURVE_TAIL_POW = readConst('CURVE_TAIL_POW');

  function engineValueForRank(rankIdx: number): number {
    const kneeVal = CURVE_TOP * Math.exp((-CURVE_K_HEAD * (CURVE_KNEE - 1)) / CURVE_TOTAL);
    if (rankIdx < CURVE_KNEE) {
      return Math.max(1, Math.round(CURVE_TOP * Math.exp((-CURVE_K_HEAD * rankIdx) / CURVE_TOTAL)));
    }
    const t = Math.min(1, (rankIdx - CURVE_KNEE) / (CURVE_TOTAL - CURVE_KNEE));
    return Math.max(1, Math.round(CURVE_FLOOR + (kneeVal - CURVE_FLOOR) * Math.pow(1 - t, CURVE_TAIL_POW)));
  }

  it('engine constants match the seed constants documented in prior.ts', () => {
    // Byte-identity of the constants that shape the curve.
    expect({ CURVE_TOP, CURVE_KNEE, CURVE_FLOOR, CURVE_TOTAL, CURVE_K_HEAD, CURVE_TAIL_POW }).toEqual({
      CURVE_TOP: 9999,
      CURVE_KNEE: 60,
      CURVE_FLOOR: 200,
      CURVE_TOTAL: 1000,
      CURVE_K_HEAD: 22,
      CURVE_TAIL_POW: 2.2,
    });
  });

  it('seed valueForRank == engine valueForRank for every rank 0..2000', () => {
    for (let i = 0; i <= 2000; i++) {
      expect(valueForRank(i)).toBe(engineValueForRank(i));
    }
  });

  it('#1 overall is the top of the curve', () => {
    expect(valueForRank(0)).toBe(9999);
  });

  it('value is monotonically non-increasing with rank', () => {
    let prev = Infinity;
    for (let i = 0; i <= 2000; i++) {
      const v = valueForRank(i);
      expect(v).toBeLessThanOrEqual(prev);
      prev = v;
    }
  });

  it('never returns NaN or < 1, even past the reference board size', () => {
    for (const i of [0, 59, 60, 999, 1000, 1001, 5000, 10000]) {
      const v = valueForRank(i);
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(1);
    }
  });

  it('the tail floors out at/above CURVE_FLOOR-ish and never explodes', () => {
    expect(valueForRank(10000)).toBeGreaterThanOrEqual(1);
    expect(valueForRank(10000)).toBeLessThan(valueForRank(60));
  });
});
