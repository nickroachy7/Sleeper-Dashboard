import { useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChevronLeft, Users } from 'lucide-react';
import { useDebate, useDebateLeaderboard, useMyDebateVoteCount, useCastDebateVote } from '../hooks/useDebates';
import { useDebateMatchup } from '../hooks/useDebateMatchup';
import { hostVerdict, hostMatchupTake, hostReaction } from '../lib/debates/host';
import { SubjectVersus } from '../components/debates/SubjectVersus';
import { DebateLeaderboard } from '../components/debates/DebateLeaderboard';
import { HostBubble } from '../components/debates/HostBubble';
import { useAuth } from '../lib/auth';

// ── DebateDetail — where the argument happens ────────────────────────────────
// The centerpiece. Three beats stacked (single column on mobile, two on
// desktop): the STORYLINE (editorial framing), the ARENA (host provocation →
// vote → host reaction, looping), and the LIVE LEADERBOARD (crowd standings +
// your-take-vs-crowd deltas). Every tap moves the board on this same screen —
// the whole opinion loop is visible without navigating away.

export default function DebateDetail() {
  const { slug } = useParams<{ slug: string }>();
  const debate = useDebate(slug);
  const navigate = useNavigate();
  const { user, username } = useAuth();

  const board = useDebateLeaderboard(debate);
  const myAttributedVotes = useMyDebateVoteCount(debate);
  const castVote = useCastDebateVote(debate);

  // The matchup advances via a nonce that bumps on each vote/skip.
  const [nonce, setNonce] = useState(0);
  // Session tap count so a guest sees their votes register (the attributed
  // count is 0 for guests until they sign in). Signed-in users see their real
  // lifetime count for this debate.
  const [sessionVotes, setSessionVotes] = useState(0);
  const myVotes = user ? myAttributedVotes : sessionVotes;
  const [flash, setFlash] = useState<{ winnerId: string; loserId: string } | null>(null);
  const matchup = useDebateMatchup(debate, nonce);

  const verdict = useMemo(() => (debate ? hostVerdict(debate, board) : ''), [debate, board]);
  const matchupTake = useMemo(
    () => (matchup ? hostMatchupTake(board, matchup.a.id, matchup.b.id) : ''),
    [board, matchup]
  );
  const reaction = useMemo(
    () => (flash ? hostReaction(board, flash.winnerId, flash.loserId) : null),
    [flash, board]
  );

  if (!debate) {
    return (
      <div className="p-8 max-w-2xl mx-auto text-center">
        <p className="text-muted text-[14px]">That debate doesn't exist.</p>
        <Link to="/" className="text-accent-500 text-[13px] mt-3 inline-block">← Back to the room</Link>
      </div>
    );
  }

  const totalVotes = Math.round(board.reduce((s, r) => s + r.crowdMatches, 0) / 2);

  const onPick = (winnerId: string, loserId: string) => {
    if (flash) return;
    castVote(winnerId, loserId);
    setSessionVotes((v) => v + 1);
    setFlash({ winnerId, loserId });
    // Brief lock so the pick + host reaction register, then advance.
    setTimeout(() => {
      setFlash(null);
      setNonce((n) => n + 1);
    }, 900);
  };

  return (
    <div className="min-h-dvh">
      <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
        {/* Breadcrumb */}
        <button
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-white transition-colors mb-4 -ml-1"
        >
          <ChevronLeft className="h-4 w-4" /> The Room
        </button>

        {/* Headline */}
        <div className="flex items-center gap-2 mb-2">
          <span className="yap-eyebrow">{debate.category}</span>
          <span className="text-faint">·</span>
          <span className="text-[11px] text-faint inline-flex items-center gap-1">
            <Users className="h-3 w-3" /> {totalVotes.toLocaleString()} votes
          </span>
        </div>
        <h1 className="font-display font-bold text-white text-[26px] sm:text-[32px] leading-tight">
          {debate.question}
        </h1>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8 lg:items-start mt-5">
          {/* Main column: storyline + arena */}
          <div className="min-w-0 space-y-6">
            {/* Storyline */}
            <article className="host-md text-[14.5px] leading-relaxed text-ink-soft">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  p: (props) => <p className="my-2.5" {...props} />,
                  strong: (props) => <strong className="text-white font-semibold" {...props} />,
                }}
              >
                {debate.storyline}
              </ReactMarkdown>
            </article>

            {/* The Arena */}
            <div className="yap-card rounded-2xl p-4 sm:p-5">
              <p className="yap-eyebrow mb-3">The Arena</p>
              {reaction ? (
                <div className="mb-4"><HostBubble bare tone="hot">{reaction}</HostBubble></div>
              ) : (
                matchupTake && <div className="mb-4"><HostBubble bare>{matchupTake}</HostBubble></div>
              )}

              {matchup ? (
                <SubjectVersus
                  a={matchup.a}
                  b={matchup.b}
                  disabled={!!flash}
                  pickedId={flash?.winnerId ?? null}
                  onPick={onPick}
                />
              ) : (
                <p className="text-center text-faint py-10 text-[13px]">Not enough subjects to compare.</p>
              )}

              <div className="flex items-center justify-between mt-4 text-[12.5px]">
                <span className="text-faint">
                  {myVotes} {myVotes === 1 ? 'vote' : 'votes'} cast here
                </span>
                <button
                  onClick={() => { setFlash(null); setNonce((n) => n + 1); }}
                  disabled={!!flash}
                  className="font-medium text-accent-500 hover:text-accent-400 disabled:opacity-40"
                >
                  Skip →
                </button>
              </div>

              {!user && myVotes >= 2 && (
                <button
                  onClick={() => navigate('/welcome')}
                  className="mt-3 w-full text-left flex items-center gap-2 px-3.5 h-10 rounded-xl border border-accent-500/25 bg-accent-500/[0.06] text-[12.5px] text-ink-soft hover:border-accent-500/50 transition-colors"
                >
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold text-white">Create an account</span> to lock in your board and prove your takes.
                  </span>
                  <span className="text-accent-500 shrink-0">→</span>
                </button>
              )}
            </div>
          </div>

          {/* Side rail: live leaderboard + host verdict */}
          <aside className="mt-6 lg:mt-0 space-y-4 lg:sticky lg:top-6">
            <div>
              <div className="flex items-baseline justify-between mb-2 px-0.5">
                <p className="yap-eyebrow">The Crowd's Ranking</p>
                {user && username && myVotes >= 3 && (
                  <span className="text-[11px] text-faint">▲▼ vs your board</span>
                )}
              </div>
              <HostBubble bare>{verdict}</HostBubble>
              <div className="mt-3">
                <DebateLeaderboard rows={board} />
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
