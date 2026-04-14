/**
 * Trade Value Adjustment Algorithm
 *
 * Mirrors KeepTradeCut's approach: compute a single "Value Adjustment"
 * applied to the consolidated / higher-quality side of the trade.
 *
 * Core idea: trading 10 depth pieces for Josh Allen may add up on paper,
 * but in reality nobody accepts that. The consolidated side (fewer,
 * better pieces) deserves a premium because elite assets are scarce
 * and roster spots are limited.
 *
 * The adjustment is computed as a NET number added to ONE side:
 *   - When the raw gap favors the spread side, the adjustment RECOVERS
 *     much of that gap (making the trade fairer).
 *   - When the raw gap already favors the quality side, the adjustment
 *     WIDENS it further (making lopsided trades even more lopsided).
 *
 * Factors: stud premium (elite assets are worth more than raw KTC),
 * piece-count asymmetry, and tier matching.
 */

export type { TradeAsset } from '../types/domain';
import type { TradeAsset } from '../types/domain';

// ── Result Types ─────────────────────────────────────────────────

export interface ValueAdjustmentResult {
  rawTotal: number;
  adjustedTotal: number;
  /** The value adjustment amount on this side (0 if adjustment is on the other side) */
  valueAdjustment: number;
}

export interface TradeAnalysisResult {
  side1: ValueAdjustmentResult;
  side2: ValueAdjustmentResult;
  rawDifference: number;
  adjustedDifference: number;
  /** The single net value adjustment amount */
  valueAdjustment: number;
  /** Which side receives the adjustment (0 or 1), null if no adjustment */
  adjustmentSide: 0 | 1 | null;
  fairness: 'fair' | 'slight' | 'unfair' | 'lopsided';
  winnerIndex: 0 | 1 | null;
  explanation: string;
}

// ── Value Thresholds ─────────────────────────────────────────────

const ELITE_THRESHOLD = 7000;
const STAR_THRESHOLD = 4500;
const STARTER_THRESHOLD = 2500;
const DEPTH_THRESHOLD = 1000;

type AssetTier = 'elite' | 'star' | 'starter' | 'depth' | 'flier';

function getAssetTier(value: number): AssetTier {
  if (value >= ELITE_THRESHOLD) return 'elite';
  if (value >= STAR_THRESHOLD) return 'star';
  if (value >= STARTER_THRESHOLD) return 'starter';
  if (value >= DEPTH_THRESHOLD) return 'depth';
  return 'flier';
}

function tierRank(tier: AssetTier): number {
  switch (tier) {
    case 'elite': return 4;
    case 'star': return 3;
    case 'starter': return 2;
    case 'depth': return 1;
    case 'flier': return 0;
  }
}

// ── Stud Premium Rate ────────────────────────────────────────────
// Per-asset premium rate based on value tier. Used to compute the
// base stud premium for each side before consolidation scaling.

function studRate(value: number): number {
  if (value >= ELITE_THRESHOLD) return 0.20;
  if (value >= STAR_THRESHOLD)
    return 0.08 + 0.12 * (value - STAR_THRESHOLD) / (ELITE_THRESHOLD - STAR_THRESHOLD);
  if (value >= STARTER_THRESHOLD)
    return 0.03 + 0.05 * (value - STARTER_THRESHOLD) / (STAR_THRESHOLD - STARTER_THRESHOLD);
  if (value >= DEPTH_THRESHOLD)
    return 0.01 + 0.02 * (value - DEPTH_THRESHOLD) / (STARTER_THRESHOLD - DEPTH_THRESHOLD);
  return 0;
}

function sumStudPremiums(assets: TradeAsset[]): number {
  return assets.reduce((sum, a) => sum + a.value * studRate(a.value), 0);
}

// ── Gap Recovery Rate ────────────────────────────────────────────
// When the raw gap favors the spread (more-pieces) side, this rate
// determines how much of that gap the quality side recovers.
//
// Factors:
//   - Piece count difference (biggest driver — each extra piece ≈ +0.28)
//   - Top asset quality (elite studs recover more)
//   - Tier mismatch (quality side has higher tier than spread's best)
//
// Capped at 0.95 so trades are never fully "free" for the stud side.

function computeRecoveryRate(
  qualityAssets: TradeAsset[],
  spreadAssets: TradeAsset[]
): number {
  const pieceDiff = spreadAssets.length - qualityAssets.length;
  const topQuality = Math.max(...qualityAssets.map((a) => a.value), 0);
  const topSpread = Math.max(...spreadAssets.map((a) => a.value), 0);

  let rate = 0.50; // base recovery

  // Piece differential: each extra piece on spread side increases recovery
  rate += Math.min(pieceDiff, 5) * 0.28;

  // Top asset quality boost
  if (topQuality >= ELITE_THRESHOLD) {
    rate += 0.12;
  } else if (topQuality >= STAR_THRESHOLD) {
    rate += 0.08 + 0.04 * (topQuality - STAR_THRESHOLD) / (ELITE_THRESHOLD - STAR_THRESHOLD);
  } else if (topQuality >= STARTER_THRESHOLD) {
    rate += 0.04 + 0.04 * (topQuality - STARTER_THRESHOLD) / (STAR_THRESHOLD - STARTER_THRESHOLD);
  }

  // Tier mismatch: quality side has higher tier than spread side's best
  const qualityTier = getAssetTier(topQuality);
  const spreadTier = getAssetTier(topSpread);
  if (tierRank(qualityTier) > tierRank(spreadTier)) {
    rate += 0.05;
  }

  return Math.min(0.95, rate);
}

// ── Net Value Adjustment ─────────────────────────────────────────

interface NetAdjustment {
  amount: number;
  side: 0 | 1;
}

function computeNetValueAdjustment(
  side1Assets: TradeAsset[],
  side2Assets: TradeAsset[]
): NetAdjustment {
  const raw1 = side1Assets.reduce((s, a) => s + a.value, 0);
  const raw2 = side2Assets.reduce((s, a) => s + a.value, 0);
  const pieces1 = side1Assets.length;
  const pieces2 = side2Assets.length;

  // ── Equal piece counts → small premium from stud value difference ──
  if (pieces1 === pieces2) {
    const prem1 = sumStudPremiums(side1Assets);
    const prem2 = sumStudPremiums(side2Assets);
    const net = prem1 - prem2;
    return {
      amount: Math.abs(Math.round(net)),
      side: net >= 0 ? 0 : 1,
    };
  }

  // ── Unequal pieces → determine quality (fewer) vs spread (more) ──
  const qualitySideIdx: 0 | 1 = pieces1 < pieces2 ? 0 : 1;
  const qualityAssets = qualitySideIdx === 0 ? side1Assets : side2Assets;
  const spreadAssets = qualitySideIdx === 0 ? side2Assets : side1Assets;
  const qualityRaw = qualitySideIdx === 0 ? raw1 : raw2;
  const spreadRaw = qualitySideIdx === 0 ? raw2 : raw1;

  const rawGapFavoringSpread = spreadRaw - qualityRaw;

  if (rawGapFavoringSpread > 0) {
    // ── Scenario A: Spread side has more raw value ──
    // Recover a portion of the gap for the quality side.
    const recoveryRate = computeRecoveryRate(qualityAssets, spreadAssets);
    const adjustment = Math.round(rawGapFavoringSpread * recoveryRate);
    return { amount: adjustment, side: qualitySideIdx };
  } else {
    // ── Scenario B: Quality side already has more raw value ──
    // Add a premium to widen the gap further.
    const pieceDiff = spreadAssets.length - qualityAssets.length;
    const qualityPremium =
      sumStudPremiums(qualityAssets) * Math.min(4.0, 1.0 + pieceDiff * 0.50);
    const spreadPremium =
      sumStudPremiums(spreadAssets) * Math.max(0.3, 1.0 - pieceDiff * 0.15);
    const net = qualityPremium - spreadPremium;

    if (net > 0) {
      return { amount: Math.round(net), side: qualitySideIdx };
    } else {
      return { amount: Math.round(Math.abs(net)), side: (1 - qualitySideIdx) as 0 | 1 };
    }
  }
}

// ── Public API ────────────────────────────────────────────────────

/**
 * Compute a standalone stud-premium estimate for one side.
 * Used by TradeFinder for search-range estimation before the
 * counter-side is known. The full `analyzeTrade` is more accurate.
 */
export function calculateSideValue(assets: TradeAsset[]): ValueAdjustmentResult {
  const rawTotal = assets.reduce((s, a) => s + a.value, 0);
  if (assets.length === 0) {
    return { rawTotal: 0, adjustedTotal: 0, valueAdjustment: 0 };
  }
  const premium = Math.round(sumStudPremiums(assets));
  return {
    rawTotal,
    adjustedTotal: rawTotal + premium,
    valueAdjustment: premium,
  };
}

/**
 * Full trade analysis — the single source of truth for trade fairness.
 *
 * Computes a net Value Adjustment applied to ONE side (the side with
 * fewer / higher-quality pieces). This matches KTC's methodology:
 * the consolidated side gets a premium, the spread side stays at raw.
 */
export function analyzeTrade(
  side1Assets: TradeAsset[],
  side2Assets: TradeAsset[]
): TradeAnalysisResult {
  const raw1 = side1Assets.reduce((s, a) => s + a.value, 0);
  const raw2 = side2Assets.reduce((s, a) => s + a.value, 0);
  const rawDifference = Math.abs(raw1 - raw2);

  // Handle empty sides
  if (side1Assets.length === 0 && side2Assets.length === 0) {
    return {
      side1: { rawTotal: 0, adjustedTotal: 0, valueAdjustment: 0 },
      side2: { rawTotal: 0, adjustedTotal: 0, valueAdjustment: 0 },
      rawDifference: 0,
      adjustedDifference: 0,
      valueAdjustment: 0,
      adjustmentSide: null,
      fairness: 'fair',
      winnerIndex: null,
      explanation: 'No assets',
    };
  }

  // Compute the single net adjustment
  const adj = (side1Assets.length > 0 && side2Assets.length > 0)
    ? computeNetValueAdjustment(side1Assets, side2Assets)
    : { amount: 0, side: 0 as 0 | 1 };

  // Build per-side results
  const side1Adj = adj.side === 0 ? adj.amount : 0;
  const side2Adj = adj.side === 1 ? adj.amount : 0;

  const side1: ValueAdjustmentResult = {
    rawTotal: raw1,
    adjustedTotal: raw1 + side1Adj,
    valueAdjustment: side1Adj,
  };
  const side2: ValueAdjustmentResult = {
    rawTotal: raw2,
    adjustedTotal: raw2 + side2Adj,
    valueAdjustment: side2Adj,
  };

  const adjustedDifference = Math.abs(side1.adjustedTotal - side2.adjustedTotal);

  // Winner: the side giving up LESS adjusted value comes out ahead
  const winnerIndex: 0 | 1 | null =
    side1.adjustedTotal === side2.adjustedTotal
      ? null
      : side1.adjustedTotal < side2.adjustedTotal ? 0 : 1;

  // Fairness classification
  const largerSide = Math.max(side1.adjustedTotal, side2.adjustedTotal);
  const percentDiff = largerSide > 0 ? (adjustedDifference / largerSide) * 100 : 0;

  let fairness: 'fair' | 'slight' | 'unfair' | 'lopsided';
  if (adjustedDifference < 300 || percentDiff < 3) {
    fairness = 'fair';
  } else if (adjustedDifference < 800 || percentDiff < 8) {
    fairness = 'slight';
  } else if (adjustedDifference < 1800 || percentDiff < 15) {
    fairness = 'unfair';
  } else {
    fairness = 'lopsided';
  }

  // Build explanation
  let explanation: string;
  if (winnerIndex === null) {
    explanation = 'Perfectly balanced trade';
  } else {
    const winner = winnerIndex === 0 ? 'Side 1' : 'Side 2';
    if (rawDifference !== adjustedDifference) {
      const direction = adjustedDifference > rawDifference ? 'widened' : 'narrowed';
      explanation =
        `${winner} wins by ${adjustedDifference.toLocaleString()} adjusted value. ` +
        `Value adjustment ${direction} the gap from ${rawDifference.toLocaleString()}.`;
    } else {
      explanation = `${winner} wins by ${adjustedDifference.toLocaleString()} value.`;
    }
  }

  return {
    side1,
    side2,
    rawDifference,
    adjustedDifference,
    valueAdjustment: adj.amount,
    adjustmentSide: adj.amount > 0 ? adj.side : null,
    fairness,
    winnerIndex,
    explanation,
  };
}

// ── TradeFinder Helpers ──────────────────────────────────────────

const MIN_TOLERANCE_FLOOR = 300;

export function getAdjustedValueRange(
  assets: TradeAsset[],
  tolerancePercent: number
): { min: number; max: number; adjustedValue: number } {
  const sideValue = calculateSideValue(assets);
  const adjustedValue = sideValue.adjustedTotal;
  const tolerance = Math.max(adjustedValue * (tolerancePercent / 100), MIN_TOLERANCE_FLOOR);
  return { min: adjustedValue - tolerance, max: adjustedValue + tolerance, adjustedValue };
}

export function isGoodTradeMatch(
  giveAssets: TradeAsset[],
  getAssets: TradeAsset[],
  tolerancePercent: number
): { isMatch: boolean; analysis: TradeAnalysisResult } {
  const analysis = analyzeTrade(giveAssets, getAssets);
  const avgValue = (analysis.side1.adjustedTotal + analysis.side2.adjustedTotal) / 2;
  const toleranceValue = Math.max(avgValue * (tolerancePercent / 100), MIN_TOLERANCE_FLOOR);
  const isMatch = analysis.adjustedDifference <= toleranceValue;
  return { isMatch, analysis };
}
