/**
 * Client helper for recording community value signals.
 *
 * Every vote becomes one row in `value_events`, normalized to "side A was
 * preferred over side B". The compute-community-values edge function later
 * consumes these and moves the Glicko ratings. RLS restricts the browser to
 * low-trust kinds only (see migration 20260710).
 */
import { supabase } from './supabase';
import { isPickAsset, pickEventKey } from './vote-assets';

/** A vote side's JSON shape: a player, or a draft pick (year-round key). An id
 *  prefixed 'PICK:' becomes a { pick } side; anything else a { player_id }. */
function assetSide(assetId: string): { player_id: string } | { pick: string } {
  if (isPickAsset(assetId)) {
    const key = pickEventKey(assetId);
    if (key) return { pick: key };
  }
  return { player_id: assetId };
}

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

/** Signed-in user id, or null for guests. Attributed votes feed the user's
 *  personal ranking board (user_player_ratings, via DB trigger) on top of the
 *  community engine; RLS only accepts the caller's own id. */
async function userId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

export interface PairwiseVoteArgs {
  /** The asset kept / preferred — a player id, or a 'PICK:YYYY-R' sentinel. */
  winnerId: string;
  /** The asset passed on — a player id, or a 'PICK:YYYY-R' sentinel. */
  loserId: string;
  /** Superflex context (default true — the league is SF). */
  superflex?: boolean;
}

/** Record a "who'd you rather keep?" tap. Fire-and-forget from the UI. Each
 *  side may be a player or a draft pick; picks feed the same community engine
 *  (which already rates picks) and the voter's personal board. */
export async function recordPairwiseVote(args: PairwiseVoteArgs): Promise<void> {
  const { error } = await supabase.from('value_events').insert({
    kind: 'pairwise',
    side_a: [assetSide(args.winnerId)],
    side_b: [assetSide(args.loserId)],
    outcome: 1.0,
    weight: 1.0,
    voter_id: voterId(),
    user_id: await userId(),
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
    user_id: await userId(),
    format_sf: args.superflex ?? true,
  });
  if (error) throw new Error(error.message);
}
