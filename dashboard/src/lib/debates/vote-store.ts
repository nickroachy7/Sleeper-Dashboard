// ── Debate vote store (local-first, Supabase-swap-ready) ─────────────────────
// Persists the pairwise preference log the engine reads. Today it's a
// localStorage-backed, subscribable store so the whole loop — vote → crowd moves
// → your-take-vs-crowd — is fully live with zero backend. Every write is shaped
// EXACTLY like a `value_events` row (kind:'pairwise', side_a beat side_b,
// voter_id/user_id), so the swap to Supabase is: replace `append`/`load` with an
// insert/select and keep the same DebateVote shape. See recordPairwiseVote in
// lib/community-events.ts for the row this mirrors.
//
// To make day-one boards feel like a real crowd (not a ghost town) we blend a
// deterministic "synthetic crowd" — a fixed set of votes derived from the
// editorial seeds — with the user's real taps. The synthetic votes are tagged
// userId:null and are clearly separable, so once real volume arrives the seed
// crowd can be dialed down or removed without touching the UI.

import type { Debate, DebateVote } from './types';

const KEY = 'yap-debate-votes-v1';

type Listener = () => void;
const listeners = new Set<Listener>();

let cache: DebateVote[] | null = null;

function load(): DebateVote[] {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as DebateVote[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function persist(votes: DebateVote[]): void {
  cache = votes;
  try {
    localStorage.setItem(KEY, JSON.stringify(votes));
  } catch {
    /* quota / private mode — the in-memory cache still drives the session */
  }
  listeners.forEach((fn) => fn());
}

/** Record one pairwise preference within a debate. */
export function recordDebateVote(v: Omit<DebateVote, 'ts'> & { ts?: number }): void {
  const vote: DebateVote = { ...v, ts: v.ts ?? Date.now() };
  persist([...load(), vote]);
}

/** All real (user-cast) votes for a debate. */
export function votesForDebate(debateId: string): DebateVote[] {
  return load().filter((v) => v.debateId === debateId);
}

/** Only the signed-in user's votes for a debate (their personal board). */
export function userVotesForDebate(debateId: string, userId: string | null): DebateVote[] {
  if (!userId) return [];
  return load().filter((v) => v.debateId === debateId && v.userId === userId);
}

/** Total real votes a user has cast across all debates (their "voice"). */
export function userVoteCount(userId: string | null): number {
  if (!userId) return 0;
  return load().filter((v) => v.userId === userId).length;
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getSnapshot(): DebateVote[] {
  return load();
}

// ── Synthetic seed crowd ─────────────────────────────────────────────────────
// A deterministic set of votes that expresses the editorial seed order, so the
// crowd leaderboard is populated and sensible on first load. Not random (that
// would break SSR/hydration determinism and re-shuffle every mount): for each
// adjacent seed pair we emit a fixed number of "better beat worse" votes, with a
// small, deterministic minority of upsets so the board looks contested, not
// unanimous. Idempotent — seeding the same debate twice is a no-op.

const SEEDED_FLAG = 'yap-debate-seeded-v1';
/** Votes emitted per adjacent-seed pair. */
const SEED_VOTES_PER_PAIR = 7;
/** Every Nth seed vote is an upset (worse beats better) to look contested. */
const UPSET_EVERY = 5;

function seededDebateIds(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEDED_FLAG);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

/** Populate the synthetic crowd for any debates not yet seeded. Call once at
 *  app start with the full catalog. Safe to call repeatedly. */
export function ensureSeedCrowd(debates: Debate[]): void {
  const seeded = seededDebateIds();
  const toSeed = debates.filter((d) => !seeded.has(d.id));
  if (toSeed.length === 0) return;

  const existing = load();
  const generated: DebateVote[] = [];
  // A fixed base timestamp (kept well in the past) so synthetic votes always
  // replay before any real tap. Not Date.now() — determinism matters here.
  let ts = 1_700_000_000_000;

  for (const debate of toSeed) {
    const roster = [...debate.subjects].sort((a, b) => a.seed - b.seed);
    let n = 0;
    for (let i = 0; i < roster.length - 1; i++) {
      const better = roster[i];
      const worse = roster[i + 1];
      for (let k = 0; k < SEED_VOTES_PER_PAIR; k++) {
        const upset = n % UPSET_EVERY === UPSET_EVERY - 1;
        generated.push({
          debateId: debate.id,
          winnerId: upset ? worse.id : better.id,
          loserId: upset ? better.id : worse.id,
          ts: ts++,
          userId: null,
        });
        n++;
      }
    }
  }

  persist([...generated, ...existing]);
  try {
    localStorage.setItem(
      SEEDED_FLAG,
      JSON.stringify([...seeded, ...toSeed.map((d) => d.id)])
    );
  } catch {
    /* ignore */
  }
}
