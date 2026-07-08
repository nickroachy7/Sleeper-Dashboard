import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { PositionBadge } from './PositionBadge';
import { getPlayerImageUrl } from '../lib/trade-shared';

export interface Mover {
  playerId: string;
  name: string;
  position: string;
  team: string | null;
  value: number;
  delta: number;
  pct: number;
  ownerTeam: string;
}

interface BiggestMoversProps {
  risers: Mover[];
  fallers: Mover[];
  /** Window the deltas were measured over, e.g. "30d" */
  windowLabel?: string;
}

function MoverRow({ m }: { m: Mover }) {
  const up = m.delta >= 0;
  return (
    <Link
      to={`/players/${m.playerId}`}
      className="group flex items-center gap-2.5 px-3 py-2.5 border-b border-[#1b1b22] last:border-b-0 hover:bg-[#1b1b22] transition-colors"
    >
      <div className="w-8 h-8 rounded-full overflow-hidden bg-[#22222b] shrink-0 ring-1 ring-inset ring-white/5">
        <img
          src={getPlayerImageUrl(m.playerId)}
          alt=""
          className="w-full h-full object-cover"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[13px] font-semibold text-white truncate group-hover:text-accent-400 transition-colors">
            {m.name}
          </p>
          <span
            className={`text-[12px] font-bold tabular-nums shrink-0 ${up ? 'text-accent-500' : 'text-[#ef4444]'}`}
          >
            {up ? '+' : '−'}{Math.abs(m.delta).toLocaleString()}
          </span>
        </div>
        <div className="flex items-center gap-1.5 mt-1">
          <PositionBadge position={m.position} size="xs" />
          {m.team && <span className="text-[10px] text-[#75757f]">{m.team}</span>}
          <span className="text-[#4c4c56]">·</span>
          <span className="text-[10px] text-[#75757f] truncate">{m.ownerTeam}</span>
          <span className="text-[#4c4c56]">·</span>
          <span className="text-[10px] text-[#60606a] tabular-nums">{m.value.toLocaleString()}</span>
        </div>
      </div>
    </Link>
  );
}

function MoverColumn({ title, icon: Icon, tint, rows, empty }: {
  title: string;
  icon: typeof TrendingUp;
  tint: string;
  rows: Mover[];
  empty: string;
}) {
  return (
    <div className="bg-[#141419] rounded-2xl overflow-hidden border border-[#22222b]">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[#1b1b22]">
        <Icon className="h-3.5 w-3.5" style={{ color: tint }} />
        <span className="text-[11px] font-bold tracking-[0.15em] uppercase" style={{ color: tint }}>
          {title}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="px-3 py-6 text-center text-[11px] text-[#60606a]">{empty}</p>
      ) : (
        rows.map((m) => <MoverRow key={m.playerId} m={m} />)
      )}
    </div>
  );
}

export function BiggestMovers({ risers, fallers, windowLabel = '30d' }: BiggestMoversProps) {
  if (risers.length === 0 && fallers.length === 0) return null;

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[11px] font-bold text-accent-500 tracking-[0.2em] uppercase mb-1">BIGGEST MOVERS</p>
          <h2 className="font-display text-lg font-bold text-white tracking-tight">Rising &amp; Falling</h2>
        </div>
        <span className="text-[11px] text-[#75757f]">last {windowLabel}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:gap-4">
        <MoverColumn title="Risers" icon={TrendingUp} tint="#22c55e" rows={risers} empty="No movement yet." />
        <MoverColumn title="Fallers" icon={TrendingDown} tint="#ef4444" rows={fallers} empty="No movement yet." />
      </div>
    </section>
  );
}
