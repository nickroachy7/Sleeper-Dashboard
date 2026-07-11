/**
 * Client helper for recording community value signals.
 *
 * Every vote becomes one row in `value_events`, normalized to "side A was
 * preferred over side B". The compute-community-values edge function later
 * consumes these and moves the Glicko ratings. RLS restricts the browser to
 * low-trust kinds only (see migration 20260710).
 */
import { supabase } from './supabase';

/** Stable-ish anonymous voter id so one browser's taps can be de-weighted
 *  later if needed. Not auth — just a coarse identity for abuse control. */
function voterId(): string {
  const KEY = 'community_voter_id';
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = `v_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    localStorage.setItem(KEY, id);
  }
  return id;
}

export interface PairwiseVoteArgs {
  /** The player kept / preferred. */
  winnerId: string;
  /** The player passed on. */
  loserId: string;
  /** Superflex context (default true — the league is SF). */
  superflex?: boolean;
}

/** Record a "who'd you rather keep?" tap. Fire-and-forget from the UI. */
export async function recordPairwiseVote(args: PairwiseVoteArgs): Promise<void> {
  const { error } = await supabase.from('value_events').insert({
    kind: 'pairwise',
    side_a: [{ player_id: args.winnerId }],
    side_b: [{ player_id: args.loserId }],
    outcome: 1.0,
    weight: 1.0,
    voter_id: voterId(),
    format_sf: args.superflex ?? true,
  });
  if (error) throw new Error(error.message);
}

export interface CalculatorVoteArgs {
  sideA: string[];        // player_ids on side A
  sideB: string[];        // player_ids on side B
  /** 1 = A clearly wins, 0.5 = fair, 0 = B clearly wins. */
  verdict: number;
  superflex?: boolean;
}

/** Record a trade-calculator "was this fair?" submission (weight 1.5). */
export async function recordCalculatorVote(args: CalculatorVoteArgs): Promise<void> {
  const { error } = await supabase.from('value_events').insert({
    kind: 'calculator',
    side_a: args.sideA.map((player_id) => ({ player_id })),
    side_b: args.sideB.map((player_id) => ({ player_id })),
    outcome: args.verdict,
    weight: 1.5,
    voter_id: voterId(),
    format_sf: args.superflex ?? true,
  });
  if (error) throw new Error(error.message);
}
