import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { SubjectAvatar } from './SubjectAvatar';
import type { LeaderboardRow } from '../../lib/debates/types';

// ── DebateLeaderboard ────────────────────────────────────────────────────────
// The living scoreboard for a debate — production-grade rows that read on the
// same footing as the dynasty player board: rank medal, avatar, name + subtitle,
// the community value on the familiar 0–9,999 ladder, vote count, and — once the
// viewer has a take — a ▲▼ vs-crowd delta. This is "your take vs the crowd"
// generalized to any topic; it's the artifact that turns a ranking into an
// argument. Rows can link back into the debate (`debateSlug`) or stay static.

const medalBg = (r: number) =>
  r === 1 ? 'bg-rank-gold/15 text-rank-gold'
  : r === 2 ? 'bg-rank-silver/15 text-rank-silver'
  : r === 3 ? 'bg-rank-bronze/20 text-rank-bronze'
  : 'text-faint';

export function DebateLeaderboard({
  rows,
  debateSlug,
}: {
  rows: LeaderboardRow[];
  /** When set, each row links to the debate so a reviewer can jump in to vote. */
  debateSlug?: string;
}) {
  if (rows.length === 0) return null;

  return (
    <div className="yap-card rounded-2xl overflow-hidden divide-y divide-line-subtle">
      {rows.map((row) => {
        const inner = (
          <>
            {/* Rank chip — medal fill for the podium, quiet number below. */}
            <span
              className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center font-display font-bold text-[13px] tabular-nums ${medalBg(row.crowdRank)}`}
            >
              {row.crowdRank}
            </span>
            <SubjectAvatar subject={row.subject} size={40} className="shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-[14px] text-white truncate leading-tight">{row.subject.name}</p>
              <p className="text-[11.5px] text-faint truncate mt-0.5">
                {row.subject.subtitle ?? ' '}
                {row.crowdMatches > 0 && (
                  <span className="text-ghost"> · {Math.round(row.crowdMatches).toLocaleString()} votes</span>
                )}
              </p>
            </div>
            <DeltaChip delta={row.delta} yourRank={row.yourRank} />
            {/* Community value on the familiar 0–9,999 ladder. */}
            <span className="shrink-0 font-display font-bold text-[15px] text-white tabular-nums w-16 text-right">
              {row.crowdValue.toLocaleString()}
            </span>
          </>
        );

        const cls = 'flex items-center gap-3 px-3.5 py-2.5';
        return debateSlug ? (
          <Link
            key={row.subject.id}
            to={`/debates/${debateSlug}`}
            className={`${cls} hover:bg-white/[0.03] transition-colors`}
          >
            {inner}
          </Link>
        ) : (
          <div key={row.subject.id} className={cls}>{inner}</div>
        );
      })}
    </div>
  );
}

/** ▲ higher than crowd / ▼ lower / = agree. Only shown once the viewer has a
 *  personal board for this debate. */
function DeltaChip({ delta, yourRank }: { delta: number | null; yourRank: number | null }) {
  if (delta == null || yourRank == null) return null;
  if (delta === 0)
    return (
      <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-medium text-muted shrink-0">
        <Minus className="h-3 w-3" /> agree
      </span>
    );
  const higher = delta < 0; // your rank number is lower = you rate them higher
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-semibold tabular-nums shrink-0 ${
        higher ? 'text-accent-400' : 'text-orange-400'
      }`}
      title={`You have them #${yourRank}; the crowd has them #${yourRank - delta}`}
    >
      {higher ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {higher ? `+${-delta}` : `-${delta}`} <span className="hidden sm:inline text-faint font-normal">vs you</span>
    </span>
  );
}
