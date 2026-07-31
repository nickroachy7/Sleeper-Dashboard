// ── Debate domain model ──────────────────────────────────────────────────────
// The pivot's core generalization: the value engine was always abstract ("side
// A was preferred over side B" → a rating on one scale). It just happened to be
// pointed at dynasty players. Here we point the SAME shape at *any* rankable
// subject, grouped under a *debate* (a question with its own leaderboard).
//
// A `Subject` is anything the crowd ranks (an athlete, a team, a moment). A
// `Debate` is a question ("Who is the NBA GOAT?") with a fixed roster of
// subjects and its own editorial storyline. A subject's rating is ALWAYS
// debate-scoped — LeBron's "GOAT" standing is a different number from his "best
// scorer ever" standing — so every rating/vote carries a `debateId`.

/** A sport / topic bucket used for filtering the debates feed. */
export type DebateCategory = 'NBA' | 'NFL' | 'Soccer' | 'MLB' | 'Combat' | 'Cross-Sport';

/** Anything the crowd can rank. Subjects live inside a debate's roster. */
export interface Subject {
  /** Stable id, unique within a debate (kebab-case, e.g. 'michael-jordan'). */
  id: string;
  name: string;
  /** One-line descriptor shown under the name ("Bulls · 1984–2003"). */
  subtitle?: string;
  /** Optional image; we fall back to a deterministic initials avatar. */
  imageUrl?: string;
  /** A short editorial "case for" this subject, surfaced on cards + detail. */
  blurb?: string;
  /** Objective facts the host can cite (rings, MVPs, records…). Freeform. */
  facts?: string[];
  /** Editorial seed rank (1 = pre-vote favorite). Drives the day-one prior so
   *  boards aren't empty before the crowd shows up. Lower = stronger. */
  seed: number;
}

/** A question with its own leaderboard. The unit the whole app orbits. */
export interface Debate {
  id: string;
  /** URL slug ('nba-goat'). */
  slug: string;
  category: DebateCategory;
  /** The headline question ("Who is the greatest of all time?"). */
  question: string;
  /** A punchy sub-hook shown in the feed. */
  hook: string;
  /** Editorial article body (markdown) — the "storyline" wrapper. */
  storyline: string;
  /** The roster of subjects the crowd ranks in this debate. */
  subjects: Subject[];
  /** How the crowd contributes: pairwise "who's better" taps for now. */
  kind: 'pairwise';
  /** Feature it on the home hero. */
  featured?: boolean;
  /** Editorial publish label ("Jul 2026") — display only. */
  published: string;
}

/** One recorded preference: within `debateId`, `winnerId` beat `loserId`.
 *  Mirrors `value_events` (kind:'pairwise', side_a beat side_b) exactly, so the
 *  local store can be swapped for the Supabase table with no shape change. */
export interface DebateVote {
  debateId: string;
  winnerId: string;
  loserId: string;
  /** Epoch ms. */
  ts: number;
  /** Signed-in user id, or null for anonymous taps. */
  userId: string | null;
}

/** A subject's computed standing within a debate. */
export interface SubjectRating {
  subjectId: string;
  /** Elo-space rating (~1500 centered). */
  rating: number;
  /** Comparisons this subject has been in (crowd or personal). */
  matches: number;
}

/** A leaderboard row: subject + its crowd standing + the viewer's own take. */
export interface LeaderboardRow {
  subject: Subject;
  /** 1-based crowd rank. */
  crowdRank: number;
  /** Raw Elo-space rating (~1500 centered) — the engine's native number. */
  crowdRating: number;
  /** The rating reindexed onto the familiar 0–9,999 value ladder (#1 ≈ 9,999),
   *  so debate rankings read on the same scale as the dynasty player board. */
  crowdValue: number;
  /** Comparisons this subject has been in across the crowd's votes. */
  crowdMatches: number;
  /** The viewer's own rank for this subject, if they've voted enough. */
  yourRank: number | null;
  /** yourRank - crowdRank; negative = you're higher on them than the crowd. */
  delta: number | null;
}
