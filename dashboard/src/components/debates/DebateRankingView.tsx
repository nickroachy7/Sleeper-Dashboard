import { Link } from 'react-router-dom';
import { ArrowRight, Users } from 'lucide-react';
import { useDebate, useDebateLeaderboard, useMyDebateVoteCount } from '../../hooks/useDebates';
import { useAuth } from '../../lib/auth';
import { DebateLeaderboard } from './DebateLeaderboard';
import { HostBubble } from './HostBubble';
import { hostVerdict } from '../../lib/debates/host';

// ── DebateRankingView ────────────────────────────────────────────────────────
// A full debate leaderboard rendered inside the Rankings page (chosen via the
// ranking switcher). Gives the crowd's ranking the same production treatment as
// the dynasty board — a header with the question + vote count, the host's read,
// the ranked rows, and a prominent "weigh in" CTA that jumps into the debate to
// vote. This is how a reviewer browses every ranking in one place.

export function DebateRankingView({ slug }: { slug: string }) {
  const debate = useDebate(slug);
  const board = useDebateLeaderboard(debate);
  const myVotes = useMyDebateVoteCount(debate);
  const { user, username } = useAuth();

  if (!debate) {
    return <p className="text-center text-faint py-16 text-[14px]">That ranking doesn't exist.</p>;
  }

  const totalVotes = Math.round(board.reduce((s, r) => s + r.crowdMatches, 0) / 2);

  return (
    <div className="space-y-4">
      {/* Header — the question, provenance, and the vote CTA. */}
      <div className="yap-card yap-accent-wash rounded-2xl p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="yap-eyebrow">{debate.category}</span>
              <span className="text-faint">·</span>
              <span className="text-[11px] text-faint inline-flex items-center gap-1">
                <Users className="h-3 w-3" /> {totalVotes.toLocaleString()} votes
              </span>
            </div>
            <h2 className="font-display font-bold text-white text-[19px] sm:text-[22px] leading-tight">
              {debate.question}
            </h2>
            <p className="text-[13px] text-ink-soft mt-1 leading-snug">{debate.hook}</p>
          </div>
          <Link
            to={`/debates/${debate.slug}`}
            className="shrink-0 inline-flex items-center gap-1.5 h-10 px-4 rounded-lg bg-accent-500 text-[#06110a] text-[13px] font-semibold hover:bg-accent-400 transition-colors"
          >
            Weigh in <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* The host's live read on the standings. */}
      <HostBubble>{hostVerdict(debate, board)}</HostBubble>

      {/* Your-take affordance mirrors the dynasty board's take-vs-crowd line. */}
      {user && username && myVotes >= 3 && (
        <p className="text-[11.5px] text-faint px-0.5">
          ▲▼ shows where <span className="text-ink-soft font-medium">your board</span> breaks from the crowd.
        </p>
      )}

      {/* The ranked leaderboard — rows link into the debate to vote. */}
      <DebateLeaderboard rows={board} debateSlug={debate.slug} />
    </div>
  );
}
