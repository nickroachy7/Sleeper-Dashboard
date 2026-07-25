import { Link } from 'react-router-dom';
import { Eye, TrendingUp, TrendingDown, X } from 'lucide-react';
import { PlayerRow } from '../components/PlayerRow';
import { useWatchlistData } from '../hooks/useWatchlistData';
import { watchlist } from '../lib/watchlist';

// ── Watchlist (/watchlist) ───────────────────────────────────────────────────
// The trade-target board: assets you're tracking, with their recent market
// move — the first step of closing the tool loop (watch a target, see it move
// into range). localStorage-backed, guest-friendly.

function MoveChip({ d7, d30 }: { d7: number | null; d30: number | null }) {
  const primary = d30 ?? d7;
  if (primary == null || primary === 0) return <span className="text-[11px] text-faint">flat</span>;
  const up = primary > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold tabular-nums ${up ? 'text-accent-400' : 'text-red-400'}`}>
      <Icon className="h-3.5 w-3.5" />
      {up ? '+' : ''}{primary.toLocaleString()}
      <span className="text-faint font-normal">{d30 != null ? '30d' : '7d'}</span>
    </span>
  );
}

export default function Watchlist() {
  const { rows, loading, count } = useWatchlistData();

  return (
    <div className="min-h-dvh">
      <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto space-y-4">
        <section className="relative overflow-hidden yap-card yap-accent-wash">
          <div className="pointer-events-none absolute -top-16 -right-10 h-40 w-40 rounded-full bg-accent-500/10 blur-3xl" />
          <div className="relative p-4 sm:p-5">
            <p className="text-[11px] font-bold text-accent-500 tracking-[0.18em] uppercase flex items-center gap-1.5">
              <Eye className="h-3.5 w-3.5" /> Watchlist
            </p>
            <h1 className="font-display text-xl font-bold text-white tracking-tight mt-0.5">Your trade targets</h1>
            <p className="text-[13px] text-muted mt-1 leading-snug">
              Assets you're tracking, with how the market's moved. Watch a target and catch it when the value swings your way.
            </p>
          </div>
        </section>

        {loading ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-12 w-full rounded-xl" />)}</div>
        ) : count === 0 ? (
          <section className="yap-card p-10 text-center">
            <Eye className="h-8 w-8 text-[#3a3a44] mx-auto mb-3" />
            <p className="text-[14px] font-semibold text-white">Nothing on watch yet</p>
            <p className="text-[12px] text-faint mt-1 max-w-xs mx-auto leading-snug">
              Tap <span className="text-ink-soft font-medium">Watch</span> on any player to track their value here.
            </p>
            <Link to="/players" className="inline-flex items-center gap-1.5 mt-4 text-[13px] text-accent-400 hover:text-accent-300 font-medium transition-colors">
              Browse rankings →
            </Link>
          </section>
        ) : (
          <section className="yap-card overflow-hidden divide-y divide-line-subtle">
            {rows.map((r) => (
              <PlayerRow
                key={r.id}
                playerId={r.isPick ? null : r.id}
                to={r.isPick ? null : undefined}
                name={r.name}
                position={r.position ?? undefined}
                team={r.team}
                value={r.value ?? undefined}
                size="sm"
                meta={<MoveChip d7={r.d7} d30={r.d30} />}
                suffix={
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); watchlist.remove(r.id); }}
                    className="shrink-0 p-1.5 rounded-md text-faint hover:text-white hover:bg-white/5 transition-colors"
                    aria-label="Remove from watchlist"
                    title="Remove from watchlist"
                  >
                    <X className="h-4 w-4" />
                  </button>
                }
              />
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
