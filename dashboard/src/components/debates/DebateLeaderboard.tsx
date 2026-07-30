import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { SubjectAvatar } from './SubjectAvatar';
import type { LeaderboardRow } from '../../lib/debates/types';

// ── DebateLeaderboard ────────────────────────────────────────────────────────
// The living scoreboard for a debate. Each row: crowd rank, subject, a share-of-
// room meter, and — once the viewer has a take — a vs-crowd delta chip (▲ higher
// / ▼ lower than the room). This is "your take vs the crowd" generalized to any
// topic; it's the artifact that turns a passive ranking into an argument.

const rankColor = (r: number) =>
  r === 1 ? 'text-rank-gold' : r === 2 ? 'text-rank-silver' : r === 3 ? 'text-rank-bronze' : 'text-faint';

export function DebateLeaderboard({ rows }: { rows: LeaderboardRow[] }) {
  if (rows.length === 0) return null;
  const maxRating = Math.max(...rows.map((r) => r.crowdRating));
  const minRating = Math.min(...rows.map((r) => r.crowdRating));
  const span = Math.max(1, maxRating - minRating);

  return (
    <div className="space-y-1.5">
      {rows.map((row) => {
        const pct = 8 + ((row.crowdRating - minRating) / span) * 92; // meter width
        return (
          <div
            key={row.subject.id}
            className="yap-card flex items-center gap-3 px-3 py-2.5 rounded-xl"
          >
            <span className={`font-display font-bold text-[15px] tabular-nums w-6 text-center ${rankColor(row.crowdRank)}`}>
              {row.crowdRank}
            </span>
            <SubjectAvatar subject={row.subject} size={38} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-semibold text-[13.5px] text-white truncate">{row.subject.name}</p>
                <DeltaChip delta={row.delta} yourRank={row.yourRank} />
              </div>
              {/* Share-of-room meter — visual weight of the crowd's rating. */}
              <div className="mt-1 h-1.5 rounded-full bg-elevated overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-accent-300 to-accent-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          </div>
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
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted shrink-0">
        <Minus className="h-3 w-3" /> you agree
      </span>
    );
  const higher = delta < 0; // your rank number is lower = you rate them higher
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-semibold tabular-nums shrink-0 ${
        higher ? 'text-accent-400' : 'text-orange-400'
      }`}
    >
      {higher ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      you #{yourRank}
    </span>
  );
}
