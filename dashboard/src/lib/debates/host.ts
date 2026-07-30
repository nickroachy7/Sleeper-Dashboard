// ── The AI host ("The Ref") ──────────────────────────────────────────────────
// The host is the storyteller of the engine. Its job is to *provoke the argument
// and narrate how the crowd moves* — always grounded in numbers the engine
// actually computed, never invented. This module derives the host's lines from
// live leaderboard state, so every sentence is defensible ("Jordan leads with
// 61% of the room" is a fact about the data, not a hallucination).
//
// This is the deterministic core of the "host generates the storyline" model.
// A richer LLM voice can layer on later behind the same functions via an edge
// function (mirroring supabase/functions/chat) — the callers won't change.

import { winProbability } from './engine';
import type { Debate, LeaderboardRow } from './types';

/** The host's read on the current crowd standings for a debate. */
export function hostVerdict(debate: Debate, board: LeaderboardRow[]): string {
  if (board.length < 2) return `The room's still warming up on ${debate.question.toLowerCase()}`;
  const [first, second] = board;
  const totalVotes = board.reduce((s, r) => s + r.crowdMatches, 0) / 2;
  const gap = first.crowdRating - second.crowdRating;

  if (totalVotes < 5) {
    return `Barely any votes in yet — **${first.subject.name}** holds the early lead, but this is wide open. Cast the first real takes.`;
  }
  if (gap > 180) {
    return `The crowd isn't torn: **${first.subject.name}** is running away with it, comfortably clear of ${second.subject.name}. Think they're wrong? Vote against the room.`;
  }
  if (gap > 60) {
    return `**${first.subject.name}** leads, but **${second.subject.name}** is right on their heels — this one's still live.`;
  }
  return `Dead heat at the top: **${first.subject.name}** and **${second.subject.name}** are separated by a hair. Your vote genuinely tips it.`;
}

/** How the host frames a single matchup before you tap (the provocation). */
export function hostMatchupTake(
  board: LeaderboardRow[],
  aId: string,
  bId: string
): string {
  const a = board.find((r) => r.subject.id === aId);
  const b = board.find((r) => r.subject.id === bId);
  if (!a || !b) return 'Who takes it? Your call.';
  // Order by crowd standing so the phrasing names the favorite first.
  const [fav, dog] = a.crowdRank <= b.crowdRank ? [a, b] : [b, a];
  const p = Math.round(
    winProbability(
      { subjectId: fav.subject.id, rating: fav.crowdRating, matches: fav.crowdMatches },
      { subjectId: dog.subject.id, rating: dog.crowdRating, matches: dog.crowdMatches }
    ) * 100
  );
  if (p >= 68) return `The room gives **${fav.subject.name}** a clear edge here (${p}%). Upset it?`;
  if (p >= 56) return `Crowd leans **${fav.subject.name}** (${p}%) — but it's closer than that.`;
  return `A genuine coin flip — the crowd can't separate these two. You decide.`;
}

/** The host's reaction the instant you vote — reinforces the loop by telling you
 *  whether you sided with the room or went against it. */
export function hostReaction(
  board: LeaderboardRow[],
  winnerId: string,
  loserId: string
): string {
  const w = board.find((r) => r.subject.id === winnerId);
  const l = board.find((r) => r.subject.id === loserId);
  if (!w || !l) return 'Logged. Next one.';
  if (w.crowdRank < l.crowdRank) {
    return `You're with the room — most managers take ${w.subject.name} too.`;
  }
  return `Spicy. You just backed ${w.subject.name} over the crowd's pick. That's a take.`;
}

/** A per-subject "your take vs the crowd" line for the leaderboard/detail. */
export function takeVsCrowd(row: LeaderboardRow): string | null {
  if (row.delta == null || row.yourRank == null) return null;
  if (row.delta === 0) return `You've got ${row.subject.name} exactly where the crowd does — #${row.crowdRank}.`;
  const dir = row.delta < 0 ? 'higher' : 'lower';
  const spots = Math.abs(row.delta);
  return `You're ${spots} spot${spots > 1 ? 's' : ''} ${dir} on ${row.subject.name} than the room (you #${row.yourRank} · crowd #${row.crowdRank}).`;
}

/** A short "opening line" for the debates feed — the host welcoming you in. */
export function hostFeedIntro(debateCount: number): string {
  return `${debateCount} arguments on the table. I've got the crowd's read on every one — but I want *yours*. Pick a fight.`;
}
