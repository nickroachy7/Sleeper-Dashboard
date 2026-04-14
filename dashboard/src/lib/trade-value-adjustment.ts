/**
 * Trade Value Adjustment Algorithm
 * 
 * Implements a sophisticated trade value adjustment system similar to KTC/Sleeper.
 * Trading is more than simple addition - we need to account for:
 * 
 * 1. Stud Factor: Elite players are harder to acquire than their raw value suggests.
 *    A team giving up a top-tier player should receive a premium.
 * 
 * 2. Roster Spot Premium: Consolidating value (getting fewer, better players) is 
 *    typically preferred. The side receiving fewer assets gets a bonus.
 * 
 * 3. Player Count Penalty: The side giving up more pieces pays a "piece penalty"
 *    because more low-value assets don't truly equal a stud.
 * 
 * 4. Diminishing Returns: Multiple mid-tier assets don't linearly add up in real trade value.
 * 
 * 5. Tier Matching: When trading a high-tier asset, you should receive at least one
 *    asset of similar tier. Trading a stud for a bunch of depth pieces is bad value
 *    even if the raw numbers match.
 * 
 * The adjustment is reverse-engineered from what the lesser side would need to add
 * to make the trade even, which is why it updates dynamically as players are added.
 */

export type { TradeAsset } from '../types/domain';
import type { TradeAsset } from '../types/domain';

export interface ValueAdjustmentResult {
  rawTotal: number;           // Simple sum of values
  adjustedTotal: number;      // Value after adjustments
  studBonus: number;          // Bonus from having elite assets
  consolidationBonus: number; // Bonus from fewer, better pieces
  piecesPenalty: number;      // Penalty for too many low-value pieces
  tierMismatchPenalty: number; // Penalty for not getting equivalent tier back
  adjustmentBreakdown: string; // Human-readable explanation
}

export interface TradeAnalysisResult {
  side1: ValueAdjustmentResult;
  side2: ValueAdjustmentResult;
  rawDifference: number;      // Simple value difference
  adjustedDifference: number; // Difference after adjustments
  valueAdjustment: number;    // The "value adjustment" amount added to lesser side
  tierMismatchExplanation: string; // Explanation of tier mismatch if any
  fairness: 'fair' | 'slight' | 'unfair' | 'lopsided';
  winnerIndex: 0 | 1 | null;  // null on exact tie
  explanation: string;
}

// Value thresholds for categorizing players
const ELITE_THRESHOLD = 7000;    // Top-tier studs (e.g., elite young QBs, top RBs)
const STAR_THRESHOLD = 4500;     // Stars
const STARTER_THRESHOLD = 2500;  // Solid starters
const DEPTH_THRESHOLD = 1000;    // Depth pieces

// Tier levels for matching
type AssetTier = 'elite' | 'star' | 'starter' | 'depth' | 'flier';

/**
 * Get the tier of an asset based on its value.
 */
function getAssetTier(value: number): AssetTier {
  if (value >= ELITE_THRESHOLD) return 'elite';
  if (value >= STAR_THRESHOLD) return 'star';
  if (value >= STARTER_THRESHOLD) return 'starter';
  if (value >= DEPTH_THRESHOLD) return 'depth';
  return 'flier';
}

/**
 * Calculate tier mismatch penalty.
 * When one side has a higher tier top asset than the other side,
 * there's a penalty because you're not getting equivalent tier value back.
 * 
 * Example: Trading an elite (7000+) and getting back only starters (2500-4500)
 * is bad even if total values match - you should get at least one star back.
 */
function calculateTierMismatchPenalty(
  giveAssets: TradeAsset[],
  getAssets: TradeAsset[]
): { givePenalty: number; getPenalty: number; explanation: string } {
  const giveHighest = Math.max(...giveAssets.map(a => a.value), 0);
  const getHighest = Math.max(...getAssets.map(a => a.value), 0);
  
  const giveHighestTier = getAssetTier(giveHighest);
  const getHighestTier = getAssetTier(getHighest);
  
  let givePenalty = 0;
  let getPenalty = 0;
  const explanations: string[] = [];

  // Check if giving side has elite but not receiving any elite/star
  if (giveHighestTier === 'elite' && getHighestTier !== 'elite' && getHighestTier !== 'star') {
    // Significant penalty - trading elite for no comparable return
    const eliteAssets = giveAssets.filter(a => a.value >= ELITE_THRESHOLD);
    const totalEliteValue = eliteAssets.reduce((sum, a) => sum + a.value, 0);
    getPenalty = Math.round(totalEliteValue * 0.15); // 15% penalty on elite value
    explanations.push('Side 1 gives elite without getting elite/star back');
  } else if (giveHighestTier === 'elite' && getHighestTier === 'star') {
    // Smaller penalty - getting star but not elite
    const eliteAssets = giveAssets.filter(a => a.value >= ELITE_THRESHOLD);
    const totalEliteValue = eliteAssets.reduce((sum, a) => sum + a.value, 0);
    getPenalty = Math.round(totalEliteValue * 0.06); // 6% penalty
    explanations.push('Side 1 gives elite, only gets a star back');
  } else if (giveHighestTier === 'star' && getHighestTier !== 'elite' && getHighestTier !== 'star') {
    // Penalty for trading star without star/elite return
    const starAssets = giveAssets.filter(a => a.value >= STAR_THRESHOLD);
    const totalStarValue = starAssets.reduce((sum, a) => sum + a.value, 0);
    getPenalty = Math.round(totalStarValue * 0.10); // 10% penalty
    explanations.push('Side 1 gives a star without getting star/elite back');
  }

  // Apply same logic in reverse for the other side
  if (getHighestTier === 'elite' && giveHighestTier !== 'elite' && giveHighestTier !== 'star') {
    const eliteAssets = getAssets.filter(a => a.value >= ELITE_THRESHOLD);
    const totalEliteValue = eliteAssets.reduce((sum, a) => sum + a.value, 0);
    givePenalty = Math.round(totalEliteValue * 0.15);
    explanations.push('Side 2 gives elite without getting elite/star back');
  } else if (getHighestTier === 'elite' && giveHighestTier === 'star') {
    const eliteAssets = getAssets.filter(a => a.value >= ELITE_THRESHOLD);
    const totalEliteValue = eliteAssets.reduce((sum, a) => sum + a.value, 0);
    givePenalty = Math.round(totalEliteValue * 0.06);
    explanations.push('Side 2 gives elite, only gets a star back');
  } else if (getHighestTier === 'star' && giveHighestTier !== 'elite' && giveHighestTier !== 'star') {
    const starAssets = getAssets.filter(a => a.value >= STAR_THRESHOLD);
    const totalStarValue = starAssets.reduce((sum, a) => sum + a.value, 0);
    givePenalty = Math.round(totalStarValue * 0.10);
    explanations.push('Side 2 gives a star without getting star/elite back');
  }

  return { givePenalty, getPenalty, explanation: explanations.join(' · ') };
}

/**
 * Calculate a smooth stud bonus percentage for a given value.
 * Uses linear interpolation between tier thresholds instead of hard cutoffs,
 * so a player at 6900 gets ~11.4% instead of jumping from 6% to 12% at 7000.
 *
 * Gradient:
 *   0–1000        → 0%
 *   1000–2500     → 0%–2.5%
 *   2500–4500     → 2.5%–6%
 *   4500–7000     → 6%–12%
 *   7000+         → 12% (capped)
 */
function getStudBonusRate(value: number): number {
  if (value >= ELITE_THRESHOLD) return 0.12;
  if (value >= STAR_THRESHOLD) {
    // Interpolate 6% → 12% across 4500–7000
    return 0.06 + (0.06 * (value - STAR_THRESHOLD) / (ELITE_THRESHOLD - STAR_THRESHOLD));
  }
  if (value >= STARTER_THRESHOLD) {
    // Interpolate 2.5% → 6% across 2500–4500
    return 0.025 + (0.035 * (value - STARTER_THRESHOLD) / (STAR_THRESHOLD - STARTER_THRESHOLD));
  }
  if (value >= DEPTH_THRESHOLD) {
    // Interpolate 0% → 2.5% across 1000–2500
    return 0.025 * (value - DEPTH_THRESHOLD) / (STARTER_THRESHOLD - DEPTH_THRESHOLD);
  }
  return 0;
}

/**
 * Calculate the "stud factor" bonus for a set of assets.
 * Elite players are harder to acquire, so the side giving them up deserves extra value.
 * Uses a smooth gradient so there are no cliff effects at tier boundaries.
 */
function calculateStudBonus(assets: TradeAsset[]): number {
  let studBonus = 0;

  for (const asset of assets) {
    const rate = getStudBonusRate(asset.value);
    if (rate > 0) {
      studBonus += asset.value * rate;
    }
  }

  return Math.round(studBonus);
}

/**
 * Calculate consolidation bonus.
 * Getting value in fewer pieces is preferred - it saves roster spots
 * and is easier to start quality players.
 */
function calculateConsolidationBonus(assets: TradeAsset[], totalValue: number): number {
  if (assets.length === 0 || totalValue === 0) return 0;
  
  // Calculate average value per piece
  const avgValue = totalValue / assets.length;
  
  // Count how many pieces are "meaningful" (above depth threshold)
  const meaningfulPieces = assets.filter(a => a.value >= DEPTH_THRESHOLD).length;
  
  // Bonus scales with concentration of value
  // Fewer pieces with high avg value = bigger bonus
  let bonus = 0;
  
  if (meaningfulPieces <= 1 && totalValue >= STAR_THRESHOLD) {
    // Single stud - maximum consolidation
    bonus = totalValue * 0.05;
  } else if (meaningfulPieces <= 2 && totalValue >= STARTER_THRESHOLD * 2) {
    // Two good pieces - solid consolidation
    bonus = totalValue * 0.03;
  } else if (avgValue >= STARTER_THRESHOLD) {
    // Good average value
    bonus = totalValue * 0.015;
  }
  
  return Math.round(bonus);
}

/**
 * Calculate pieces penalty.
 * Trading 5 depth pieces for a stud rarely works in practice.
 * The side with more pieces pays a tax.
 */
function calculatePiecesPenalty(assets: TradeAsset[], totalValue: number): number {
  if (assets.length <= 2) return 0; // No penalty for 1-2 pieces
  
  // Count low-value pieces (depth or below)
  const lowValuePieces = assets.filter(a => a.value < STARTER_THRESHOLD).length;
  
  // Penalty increases with more low-value pieces
  let penalty = 0;
  
  if (lowValuePieces >= 4) {
    // Lots of fliers/depth - significant penalty
    penalty = totalValue * 0.08;
  } else if (lowValuePieces >= 3) {
    // Several depth pieces
    penalty = totalValue * 0.05;
  } else if (assets.length >= 4) {
    // 4+ pieces even if some are good
    penalty = totalValue * 0.03;
  } else if (assets.length === 3) {
    // 3 pieces - minor penalty
    penalty = totalValue * 0.015;
  }
  
  return Math.round(penalty);
}

/**
 * Calculate the full value adjustment for one side of a trade.
 * Note: tierMismatchPenalty is calculated in analyzeTrade since it requires both sides.
 */
export function calculateSideValue(assets: TradeAsset[]): ValueAdjustmentResult {
  const rawTotal = assets.reduce((sum, a) => sum + a.value, 0);
  
  if (assets.length === 0) {
    return {
      rawTotal: 0,
      adjustedTotal: 0,
      studBonus: 0,
      consolidationBonus: 0,
      piecesPenalty: 0,
      tierMismatchPenalty: 0,
      adjustmentBreakdown: 'No assets',
    };
  }
  
  const studBonus = calculateStudBonus(assets);
  const consolidationBonus = calculateConsolidationBonus(assets, rawTotal);
  const piecesPenalty = calculatePiecesPenalty(assets, rawTotal);
  
  const adjustedTotal = rawTotal + studBonus + consolidationBonus - piecesPenalty;
  
  // Build explanation
  const parts: string[] = [];
  if (studBonus > 0) parts.push(`+${studBonus.toLocaleString()} stud bonus`);
  if (consolidationBonus > 0) parts.push(`+${consolidationBonus.toLocaleString()} consolidation`);
  if (piecesPenalty > 0) parts.push(`-${piecesPenalty.toLocaleString()} pieces penalty`);
  
  return {
    rawTotal,
    adjustedTotal,
    studBonus,
    consolidationBonus,
    piecesPenalty,
    tierMismatchPenalty: 0, // Calculated in analyzeTrade
    adjustmentBreakdown: parts.length > 0 ? parts.join(', ') : 'No adjustment',
  };
}

/**
 * Analyze a complete trade between two sides.
 * Returns detailed analysis including the "value adjustment" that would be
 * needed to even the trade.
 */
export function analyzeTrade(
  side1Assets: TradeAsset[],
  side2Assets: TradeAsset[]
): TradeAnalysisResult {
  const side1 = calculateSideValue(side1Assets);
  const side2 = calculateSideValue(side2Assets);
  
  // Calculate tier mismatch penalty
  const tierMismatch = calculateTierMismatchPenalty(side1Assets, side2Assets);
  
  // Apply tier mismatch penalties to the adjusted totals
  // The penalty reduces the value of the side that's not getting equivalent tier back
  const side1FinalAdjusted = side1.adjustedTotal - tierMismatch.givePenalty;
  const side2FinalAdjusted = side2.adjustedTotal - tierMismatch.getPenalty;
  
  // Update the side results with tier mismatch penalty
  side1.tierMismatchPenalty = tierMismatch.givePenalty;
  side2.tierMismatchPenalty = tierMismatch.getPenalty;
  
  // Update adjustment breakdowns to include tier mismatch
  if (tierMismatch.givePenalty > 0) {
    side1.adjustmentBreakdown += (side1.adjustmentBreakdown !== 'No adjustment' ? ', ' : '') + 
      `-${tierMismatch.givePenalty.toLocaleString()} tier mismatch`;
    side1.adjustedTotal = side1FinalAdjusted;
  }
  if (tierMismatch.getPenalty > 0) {
    side2.adjustmentBreakdown += (side2.adjustmentBreakdown !== 'No adjustment' ? ', ' : '') + 
      `-${tierMismatch.getPenalty.toLocaleString()} tier mismatch`;
    side2.adjustedTotal = side2FinalAdjusted;
  }
  
  const rawDifference = Math.abs(side1.rawTotal - side2.rawTotal);
  const adjustedDifference = Math.abs(side1.adjustedTotal - side2.adjustedTotal);
  
  // The "value adjustment" is the amount the lesser side would need to add
  // This is calculated as the difference between adjusted totals
  const valueAdjustment = adjustedDifference;

  // Each side's assets represent what THAT side is giving up in the trade.
  // The side giving up LESS value comes out ahead. Null on exact tie.
  const winnerIndex: 0 | 1 | null = side1.adjustedTotal === side2.adjustedTotal
    ? null
    : side1.adjustedTotal < side2.adjustedTotal ? 0 : 1;

  // Determine fairness based on adjusted difference
  let fairness: 'fair' | 'slight' | 'unfair' | 'lopsided';
  const percentDiff = side1.adjustedTotal > 0 
    ? (adjustedDifference / Math.max(side1.adjustedTotal, side2.adjustedTotal)) * 100
    : 0;
    
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
  let explanation = '';
  if (winnerIndex === null) {
    explanation = 'Perfectly balanced trade';
  } else {
    const winner = winnerIndex === 0 ? 'Side 1' : 'Side 2';

    if (rawDifference !== adjustedDifference) {
      const adjustmentDirection = adjustedDifference > rawDifference ? 'widened' : 'narrowed';
      explanation = `${winner} wins by ${adjustedDifference.toLocaleString()} adjusted value. ` +
        `Value adjustments ${adjustmentDirection} the gap from ${rawDifference.toLocaleString()} raw difference.`;
    } else {
      explanation = `${winner} wins by ${adjustedDifference.toLocaleString()} value.`;
    }
  }
  
  return {
    side1,
    side2,
    rawDifference,
    adjustedDifference,
    valueAdjustment,
    tierMismatchExplanation: tierMismatch.explanation,
    fairness,
    winnerIndex,
    explanation,
  };
}

// Minimum absolute tolerance so low-value trades still surface
const MIN_TOLERANCE_FLOOR = 300;

/**
 * Calculate adjusted fairness thresholds for the Trade Finder.
 * Uses a hybrid band: percentage-based with an absolute floor so that
 * low-value trades aren't squeezed out by tiny tolerance windows.
 */
export function getAdjustedValueRange(
  assets: TradeAsset[],
  tolerancePercent: number
): { min: number; max: number; adjustedValue: number } {
  const sideValue = calculateSideValue(assets);

  // Use adjusted value for range calculation
  const adjustedValue = sideValue.adjustedTotal;
  const tolerance = Math.max(adjustedValue * (tolerancePercent / 100), MIN_TOLERANCE_FLOOR);

  return {
    min: adjustedValue - tolerance,
    max: adjustedValue + tolerance,
    adjustedValue,
  };
}

/**
 * Check if a potential trade package is a good match.
 * Uses adjusted values and considers trade dynamics.
 */
export function isGoodTradeMatch(
  giveAssets: TradeAsset[],
  getAssets: TradeAsset[],
  tolerancePercent: number
): { isMatch: boolean; analysis: TradeAnalysisResult } {
  const analysis = analyzeTrade(giveAssets, getAssets);
  
  // Check if within tolerance based on adjusted difference (hybrid: % with absolute floor)
  const avgValue = (analysis.side1.adjustedTotal + analysis.side2.adjustedTotal) / 2;
  const toleranceValue = Math.max(avgValue * (tolerancePercent / 100), MIN_TOLERANCE_FLOOR);

  const isMatch = analysis.adjustedDifference <= toleranceValue;
  
  return { isMatch, analysis };
}
