// ── The crowd-rating engine (client-side) ────────────────────────────────────
// A compact Elo pass over the pairwise vote log. This is the local stand-in for
// the server's Glicko-2 engine (supabase/functions/compute-community-values):
// same job — turn a stream of "A beat B" preferences into one rating per subject
// — small enough to run live in the browser so the leaderboard moves the instant
// you vote. When the Supabase `debate_events` table + compute function ship, the
// hooks swap their source and this file can retire; the UI never changes.
//
// Seed priors: each subject starts from an editorial rating derived from its
// `seed` (1 = favorite) so day-one boards are sensible and ordered before the
// crowd arrives. Votes move subjects off their seed from there — exactly the
// "editorial prior, crowd corrects it" model the dynasty engine already uses.

import type { DebateVote, Subject, SubjectRating } from './types';

const BASE = 1500;
/** Spread of the editorial seed prior around BASE (seed 1 ≈ +200, mid ≈ 0). */
const SEED_SPREAD = 420;
/** Elo K-factor. Higher = the board reacts faster to each vote (good for a live
 *  feel on modest vote volume); the RD-style damping below tames early swings. */
const K = 32;

/** Editorial starting rating for a subject from its seed rank (1 = strongest).
 *  Maps seed 1..N onto a gentle descending band around BASE. */
export function seedRating(seed: number, rosterSize: number): number {
  if (rosterSize <= 1) return BASE;
  // 0 (best) → +SEED_SPREAD/2, 1 (worst) → -SEED_SPREAD/2.
  const t = (seed - 1) / (rosterSize - 1);
  return BASE + SEED_SPREAD / 2 - t * SEED_SPREAD;
}

/** Expected score of A vs B under the logistic Elo curve. */
function expected(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/**
 * Compute per-subject ratings for a debate from its seed priors + a vote log.
 * Deterministic: same subjects + same votes → same ratings.
 *
 * @param subjects the debate's roster (provides seeds).
 * @param votes    the preference log for THIS debate (winner beat loser).
 */
export function rateDebate(subjects: Subject[], votes: DebateVote[]): Map<string, SubjectRating> {
  const ratings = new Map<string, SubjectRating>();
  for (const s of subjects) {
    ratings.set(s.id, { subjectId: s.id, rating: seedRating(s.seed, subjects.length), matches: 0 });
  }

  // Chronological replay so recency is implicit (later votes move a more-settled
  // rating less, matching how the real engine decays confidence).
  const ordered = [...votes].sort((a, b) => a.ts - b.ts);
  for (const v of ordered) {
    const w = ratings.get(v.winnerId);
    const l = ratings.get(v.loserId);
    if (!w || !l) continue; // vote references a subject no longer in the roster
    const ew = expected(w.rating, l.rating);
    // Damp K as a subject accrues matches → early votes move fast, the board
    // settles as evidence builds. Floor keeps it responsive forever.
    const kw = K * (1 + 8 / (w.matches + 8));
    const kl = K * (1 + 8 / (l.matches + 8));
    w.rating += kw * (1 - ew);
    l.rating += kl * (0 - (1 - ew));
    w.matches += 1;
    l.matches += 1;
  }
  return ratings;
}

/** Sort subjects into a ranked leaderboard by rating (desc). Ties broken by
 *  seed so the order is stable before any votes land. */
export function rankSubjects(
  subjects: Subject[],
  ratings: Map<string, SubjectRating>
): { subject: Subject; rating: SubjectRating }[] {
  return subjects
    .map((subject) => ({ subject, rating: ratings.get(subject.id)! }))
    .sort((a, b) => b.rating.rating - a.rating.rating || a.subject.seed - b.subject.seed);
}

/** Win probability of `a` over `b` given current ratings — used to phrase the
 *  crowd's read ("the crowd gives Jordan a 61% edge here"). */
export function winProbability(a: SubjectRating, b: SubjectRating): number {
  return expected(a.rating, b.rating);
}
