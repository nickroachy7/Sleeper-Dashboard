// ── Debate hooks ─────────────────────────────────────────────────────────────
// Bind the vote store + rating engine to React. Everything recomputes when the
// store changes (a tap anywhere updates every leaderboard live). These are the
// seam to Supabase: when the backend tables ship, only the internals change —
// the returned shapes stay identical, so no component is touched.

import { useSyncExternalStore, useMemo, useEffect } from 'react';
import { useAuth } from '../lib/auth';
import { DEBATES, debateBySlug } from '../lib/debates/catalog';
import { rateDebate, rankSubjects } from '../lib/debates/engine';
import {
  subscribe,
  getSnapshot,
  votesForDebate,
  userVotesForDebate,
  ensureSeedCrowd,
  recordDebateVote,
} from '../lib/debates/vote-store';
import type { Debate, LeaderboardRow } from '../lib/debates/types';

/** Subscribe a component to the vote log; returns the raw votes array. Reused by
 *  every hook below so one store change fans out to all of them. */
function useVotes() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Seed the synthetic crowd once, at app start. Idempotent. */
export function useSeedCrowd() {
  useEffect(() => {
    ensureSeedCrowd(DEBATES);
  }, []);
}

export function useDebateList() {
  return DEBATES;
}

export function useDebate(slug: string | undefined): Debate | undefined {
  return useMemo(() => (slug ? debateBySlug(slug) : undefined), [slug]);
}

/**
 * The full leaderboard for a debate: crowd rank + rating for every subject,
 * plus the viewer's own rank and vs-crowd delta once they've formed a take.
 * This is the payload that makes "your take vs the crowd" real for any topic.
 */
export function useDebateLeaderboard(debate: Debate | undefined): LeaderboardRow[] {
  const votes = useVotes(); // subscription — recompute on any tap
  const { user } = useAuth();
  void votes;

  return useMemo(() => {
    if (!debate) return [];
    const crowdVotes = votesForDebate(debate.id);
    const crowdRatings = rateDebate(debate.subjects, crowdVotes);
    const crowdRanked = rankSubjects(debate.subjects, crowdRatings);

    // The viewer's personal board: the same engine over only THEIR votes. Only
    // meaningful once they've cast a few — below that we don't claim a rank.
    const myVotes = userVotesForDebate(debate.id, user?.id ?? null);
    const hasBoard = myVotes.length >= 3;
    const myRankById = new Map<string, number>();
    if (hasBoard) {
      const myRanked = rankSubjects(debate.subjects, rateDebate(debate.subjects, myVotes));
      myRanked.forEach((r, i) => myRankById.set(r.subject.id, i + 1));
    }

    return crowdRanked.map((r, i) => {
      const crowdRank = i + 1;
      const yourRank = hasBoard ? myRankById.get(r.subject.id) ?? null : null;
      return {
        subject: r.subject,
        crowdRank,
        crowdRating: r.rating.rating,
        crowdMatches: r.rating.matches,
        yourRank,
        delta: yourRank != null ? yourRank - crowdRank : null,
      } satisfies LeaderboardRow;
    });
    // `votes` is the store subscription: not referenced in the body (the engine
    // re-reads the store) but IS the trigger to recompute on any tap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debate, user?.id, votes]);
}

/** How many votes the viewer has cast in this debate (drives the "your board"
 *  unlock + progress affordances). */
export function useMyDebateVoteCount(debate: Debate | undefined): number {
  const votes = useVotes();
  const { user } = useAuth();
  void votes;
  return useMemo(
    () => (debate ? userVotesForDebate(debate.id, user?.id ?? null).length : 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [debate, user?.id, votes]
  );
}

/** Record a pairwise pick within a debate. Attributes to the signed-in user so
 *  it feeds their personal board; anonymous taps still move the crowd. */
export function useCastDebateVote(debate: Debate | undefined) {
  const { user } = useAuth();
  return useMemo(() => {
    return (winnerId: string, loserId: string) => {
      if (!debate) return;
      recordDebateVote({ debateId: debate.id, winnerId, loserId, userId: user?.id ?? null });
    };
  }, [debate, user?.id]);
}
