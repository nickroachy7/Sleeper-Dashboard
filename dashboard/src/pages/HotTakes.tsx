import { Link } from 'react-router-dom';
import { Flame, Target, TrendingUp, UserRound } from 'lucide-react';
import { useHotTakesLeaderboard } from '../hooks/useHotTakesLeaderboard';

// ── Hot Takes leaderboard (/leaders) ─────────────────────────────────────────
// The global status board: managers ranked by how often the crowd came around
// to their takes ("called"), conviction (players moved) as the tiebreaker.
// Turns the private board-delta signal into public competition.

const medal = (rank: number) =>
  rank === 1 ? '#ffd700' : rank === 2 ? '#c0c0c0' : rank === 3 ? '#cd7f32' : null;

export default function HotTakes() {
  const { leaders, available, loading } = useHotTakesLeaderboard(25);

  return (
    <div className="min-h-dvh">
      <div className="p-4 sm:p-6 lg:p-8 max-w-2xl mx-auto space-y-4">
        {/* Header */}
        <section className="relative overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-[#16161c] via-[#141419] to-[#111116]">
          <div className="pointer-events-none absolute -top-16 -right-10 h-40 w-40 rounded-full bg-accent-500/10 blur-3xl" />
          <div className="relative p-4 sm:p-5">
            <p className="text-[11px] font-bold text-accent-500 tracking-[0.18em] uppercase flex items-center gap-1.5">
              <Flame className="h-3.5 w-3.5" /> Hot Takes
            </p>
            <h1 className="font-display text-xl font-bold text-white tracking-tight mt-0.5">Who called it</h1>
            <p className="text-[13px] text-muted mt-1 leading-snug">
              Managers ranked by the takes the crowd came around to. Rank players off consensus, and when the market moves your way, you climb.
            </p>
          </div>
        </section>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton h-14 w-full rounded-xl" />)}
          </div>
        ) : !available ? (
          <section className="rounded-2xl border border-line bg-surface p-10 text-center">
            <Flame className="h-8 w-8 text-[#3a3a44] mx-auto mb-3" />
            <p className="text-[14px] font-semibold text-white">Leaderboard coming soon</p>
            <p className="text-[12px] text-faint mt-1 max-w-xs mx-auto leading-snug">
              The global Hot Takes board lights up once the community scoring ships. Keep ranking — your calls are already being tracked on your profile.
            </p>
          </section>
        ) : leaders.length === 0 ? (
          <section className="rounded-2xl border border-line bg-surface p-10 text-center">
            <p className="text-[14px] font-semibold text-white">No hot takes yet</p>
            <p className="text-[12px] text-faint mt-1">Be the first — rank players off the crowd and see if the market follows.</p>
          </section>
        ) : (
          <section className="rounded-2xl border border-line bg-surface overflow-hidden divide-y divide-[#17171d]">
            {leaders.map((l) => {
              const m = medal(l.rank);
              return (
                <Link
                  key={l.username}
                  to={`/u/${l.username}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors"
                >
                  <span
                    className="w-6 text-center text-[13px] font-bold tabular-nums shrink-0"
                    style={{ color: m ?? '#80808c' }}
                  >
                    {l.rank}
                  </span>
                  <div className="w-9 h-9 rounded-full overflow-hidden bg-overlay shrink-0 ring-1 ring-inset ring-white/10 flex items-center justify-center">
                    {l.avatarUrl ? (
                      <img src={l.avatarUrl} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
                    ) : (
                      <UserRound className="h-4 w-4 text-ghost" />
                    )}
                  </div>
                  <span className="flex-1 min-w-0 text-[14px] font-semibold text-white truncate">{l.username}</span>
                  <span className="flex items-center gap-1 text-[13px] font-bold text-accent-400 tabular-nums" title="Takes the crowd came around to">
                    <Target className="h-3.5 w-3.5" /> {l.called.toLocaleString()}
                  </span>
                  <span className="flex items-center gap-1 text-[12px] text-faint tabular-nums w-16 justify-end" title="Players moved off consensus">
                    <TrendingUp className="h-3.5 w-3.5" /> {l.moved.toLocaleString()}
                  </span>
                </Link>
              );
            })}
          </section>
        )}
      </div>
    </div>
  );
}
