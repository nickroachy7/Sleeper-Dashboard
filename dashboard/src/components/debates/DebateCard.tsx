import { Link } from 'react-router-dom';
import { ArrowRight, Users } from 'lucide-react';
import { SubjectAvatar } from './SubjectAvatar';
import { useDebateLeaderboard } from '../../hooks/useDebates';
import type { Debate } from '../../lib/debates/types';

// ── DebateCard ───────────────────────────────────────────────────────────────
// One argument in the feed, styled like a sports-media story card: category
// eyebrow, the question as a headline, the hook, a live top-3 podium strip, and
// the crowd's current leader. The whole card links into the debate. `featured`
// gives the hero a larger, accent-washed treatment.

export function DebateCard({ debate, featured = false }: { debate: Debate; featured?: boolean }) {
  const board = useDebateLeaderboard(debate);
  const top3 = board.slice(0, 3);
  const totalVotes = Math.round(board.reduce((s, r) => s + r.crowdMatches, 0) / 2);
  const leader = board[0]?.subject.name;

  return (
    <Link
      to={`/debates/${debate.slug}`}
      className={`group yap-card yap-card-interactive block rounded-2xl overflow-hidden ${
        featured ? 'yap-accent-wash' : ''
      }`}
    >
      <div className={featured ? 'p-5 sm:p-6' : 'p-4 sm:p-5'}>
        <div className="flex items-center gap-2 mb-2">
          <span className="yap-eyebrow">{debate.category}</span>
          <span className="text-faint">·</span>
          <span className="text-[11px] text-faint">{debate.published}</span>
        </div>

        <h3
          className={`font-display font-bold text-white leading-tight ${
            featured ? 'text-[22px] sm:text-[26px]' : 'text-[17px] sm:text-[19px]'
          }`}
        >
          {debate.question}
        </h3>
        <p className={`text-ink-soft mt-1.5 leading-snug ${featured ? 'text-[14px]' : 'text-[13px]'} line-clamp-2`}>
          {debate.hook}
        </p>

        {/* Live podium strip — the crowd's current top 3, overlapping avatars. */}
        {top3.length > 0 && (
          <div className="flex items-center gap-3 mt-4">
            <div className="flex -space-x-2.5">
              {top3.map((r, i) => (
                <SubjectAvatar
                  key={r.subject.id}
                  subject={r.subject}
                  size={featured ? 40 : 34}
                  className={`ring-2 ring-[var(--bg-card)] ${i === 0 ? 'z-30' : i === 1 ? 'z-20' : 'z-10'}`}
                />
              ))}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] text-muted truncate">
                Crowd has <span className="font-semibold text-white">{leader}</span> on top
              </p>
              <p className="text-[11px] text-faint inline-flex items-center gap-1 mt-0.5">
                <Users className="h-3 w-3" /> {totalVotes.toLocaleString()} votes · {debate.subjects.length} in the mix
              </p>
            </div>
            <span className="shrink-0 inline-flex items-center gap-1 text-[12.5px] font-semibold text-accent-500 group-hover:gap-1.5 transition-all">
              Weigh in <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}
