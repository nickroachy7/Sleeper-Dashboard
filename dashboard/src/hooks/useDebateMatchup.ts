// ── Debate matchup picker ────────────────────────────────────────────────────
// Serves the next "who's better?" pair for a debate. Same principle as the
// dynasty Rank 'Em picker: a genuine coin-flip (two subjects of nearby rating)
// teaches the engine more than a blowout, and biases toward the top of the
// board so the marquee names come up often. Advances deterministically per tap
// via a caller-held nonce, so no Math.random at render (keeps it hydration-safe
// and lets the pair change only when the caller asks).

import { useMemo } from 'react';
import { rateDebate, rankSubjects } from '../lib/debates/engine';
import { votesForDebate } from '../lib/debates/vote-store';
import type { Debate, Subject } from '../lib/debates/types';

export interface DebateMatchup {
  a: Subject;
  b: Subject;
}

/**
 * @param debate the debate to draw from.
 * @param nonce  bump to advance to a fresh pair (e.g. a vote counter).
 */
export function useDebateMatchup(debate: Debate | undefined, nonce: number): DebateMatchup | null {
  return useMemo(() => {
    if (!debate || debate.subjects.length < 2) return null;
    // Order by current crowd rating so "nearby" means nearby-in-standing.
    const ratings = rateDebate(debate.subjects, votesForDebate(debate.id));
    const ranked = rankSubjects(debate.subjects, ratings).map((r) => r.subject);
    const n = ranked.length;

    // Top-weighted anchor: a hash of the nonce mapped through a squaring curve
    // pulls picks toward the top of the board (the recognizable names) while
    // still reaching the tail. Deterministic per nonce.
    const h = (Math.sin(nonce * 12.9898) * 43758.5453) % 1;
    const frac = Math.abs(h);
    const anchor = Math.min(n - 1, Math.floor(frac * frac * n));

    // Opponent: nearest neighbor by standing, side chosen by nonce parity so we
    // don't always compare downward.
    const wantUp = nonce % 2 === 0;
    let opp = wantUp ? anchor - 1 : anchor + 1;
    if (opp < 0) opp = anchor + 1;
    if (opp > n - 1) opp = anchor - 1;
    if (opp === anchor) opp = anchor === 0 ? 1 : anchor - 1;

    return { a: ranked[anchor], b: ranked[opp] };
  }, [debate, nonce]);
}
