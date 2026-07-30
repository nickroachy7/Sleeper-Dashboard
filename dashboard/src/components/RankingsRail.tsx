import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown, Sparkles, ArrowRight } from 'lucide-react';
import { useGlobalMovers } from '../hooks/useGlobalMovers';
import { AssetAvatar } from './AssetAvatar';

// ── RankingsRail ─────────────────────────────────────────────────────────────
// The desktop side rail for the Rankings page: fills the horizontal space a lone
// list wastes with genuinely useful context — the biggest community risers and
// fallers (tappable into each player), and a short "how these values work"
// explainer that reinforces the community-owned-values pitch. Hidden on mobile
// (the page stacks to a single column there); this only mounts at lg+.

function MoverList({
  title,
  icon: Icon,
  rows,
  tone,
  loading,
}: {
  title: string;
  icon: typeof TrendingUp;
  rows: { playerId: string; name: string; position: string; team: string | null; delta: number }[];
  tone: 'up' | 'down';
  loading: boolean;
}) {
  const accent = tone === 'up' ? 'text-accent-400' : 'text-red-400';
  return (
    <div>
      <p className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] ${accent} mb-2`}>
        <Icon className="h-3.5 w-3.5" /> {title}
      </p>
      {loading ? (
        <div className="space-y-1.5">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-9 w-full rounded-lg" />)}
        </div>
      ) : rows.length === 0 ? (
        <p className="text-[12px] text-faint py-2">No movement yet.</p>
      ) : (
        <div className="space-y-0.5">
          {rows.map((r) => (
            <Link
              key={r.playerId}
              to={`/players/${r.playerId}`}
              className="flex items-center gap-2.5 px-1.5 py-1.5 rounded-lg hover:bg-white/[0.03] transition-colors"
            >
              <AssetAvatar id={r.playerId} alt={r.name} size={28} />
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-medium text-ink-soft truncate leading-tight">{r.name}</p>
                <p className="text-[10.5px] text-faint">{r.position}{r.team ? ` · ${r.team}` : ''}</p>
              </div>
              <span className={`text-[12px] font-semibold tabular-nums shrink-0 ${accent}`}>
                {r.delta > 0 ? '+' : ''}{Math.round(r.delta).toLocaleString()}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function RankingsRail() {
  const { risers, fallers, loading } = useGlobalMovers(30);

  return (
    <aside className="hidden lg:block space-y-4 lg:sticky lg:top-6">
      {/* Movers */}
      <section className="yap-card rounded-2xl p-4 space-y-4">
        <div className="flex items-baseline justify-between">
          <p className="yap-eyebrow">Biggest movers</p>
          <span className="text-[11px] text-faint">30d</span>
        </div>
        <MoverList title="Risers" icon={TrendingUp} rows={risers.slice(0, 4)} tone="up" loading={loading} />
        <MoverList title="Fallers" icon={TrendingDown} rows={fallers.slice(0, 4)} tone="down" loading={loading} />
      </section>

      {/* How values work — reinforces the community-owned pitch */}
      <section className="yap-card yap-accent-wash rounded-2xl p-4">
        <p className="flex items-center gap-1.5 yap-eyebrow mb-1.5">
          <Sparkles className="h-3.5 w-3.5" /> Community-powered
        </p>
        <p className="text-[12.5px] text-ink-soft leading-relaxed">
          These aren't a scrape. Every value here is set by the crowd — real trades
          and head-to-head votes — so it moves when opinion moves.
        </p>
        <Link
          to="/trade?tab=rank"
          className="inline-flex items-center gap-1 mt-2.5 text-[12.5px] font-semibold text-accent-400 hover:text-accent-300 transition-colors"
        >
          Cast your votes <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </section>
    </aside>
  );
}
