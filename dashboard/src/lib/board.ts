// ── Personal-board math (shared) ─────────────────────────────────────────────
// A user's board is stored as Elo-style deviations around 1500 on top of a
// community value frozen at seed time (baseline_value). The VISIBLE ranking is
// the blend below, NOT the raw rating — so any surface that wants "this user's
// own ranking order" (the profile board, catered vote matchups) must blend the
// same way. This module is the single definition both share.
//
// baseline_value is insulated from other users' votes (migration 20260721), so
// the blended order only moves when THIS user votes or edits.

/** One vote moves a player ±~16 Elo; ×8 ≈ ±128 board points — enough to hop a
 *  few spots among the stars, less further down. Must match everywhere. */
export const ELO_SCALE = 8;

/** The neutral Elo a player sits at with no opinion expressed. */
export const ELO_BASE = 1500;

export interface RatingRow {
  player_id: string;
  rating: number;
  baseline_value: number | null;
}

/**
 * Blended board value for one row: frozen community anchor + the user's Elo
 * deviation. `liveFallback` (the current community value) is used only when a
 * row somehow lacks a baseline, so a player never sinks to 0.
 */
export function blendedValue(row: RatingRow, liveFallback?: number): number {
  const anchor = row.baseline_value ?? liveFallback ?? 0;
  return anchor + (row.rating - ELO_BASE) * ELO_SCALE;
}

/** Inverse of the blend: the rating that lands a player at a target blended
 *  value given its anchor. Used by manual rank edits. */
export function ratingForBlended(targetBlended: number, anchor: number): number {
  return ELO_BASE + (targetBlended - anchor) / ELO_SCALE;
}
