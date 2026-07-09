import { TrendingUp, TrendingDown } from 'lucide-react';
import { PlayerRow } from './PlayerRow';

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

function MoverColumn({ title, icon: Icon, rows, empty }: {
  title: string;
  icon: typeof TrendingUp;
  rows: Mover[];
  empty: string;
}) {
  return (
    <div className="bg-[#141419] rounded-2xl overflow-hidden border border-[#22222b]">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[#1b1b22]">
        <Icon className="h-3.5 w-3.5 text-[#75757f]" />
        <span className="text-[11px] font-bold tracking-[0.15em] uppercase text-[#9c9ca7]">
          {title}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="px-3 py-6 text-center text-[11px] text-[#60606a]">{empty}</p>
      ) : (
        rows.map((m) => (
          <PlayerRow
            key={m.playerId}
            playerId={m.playerId}
            name={m.name}
            position={m.position}
            team={m.team}
            delta={m.delta}
            value={m.value}
            meta={m.ownerTeam}
            size="sm"
            divided
          />
        ))
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
        <MoverColumn title="Risers" icon={TrendingUp} rows={risers} empty="No movement yet." />
        <MoverColumn title="Fallers" icon={TrendingDown} rows={fallers} empty="No movement yet." />
      </div>
    </section>
  );
}
