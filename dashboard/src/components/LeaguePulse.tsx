import { useState } from 'react';
import { Trophy, Flame, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

// ─── Types ───────────────────────────────────────────────────────────

interface PulseStat {
  icon: typeof Trophy;
  /** Player image / team avatar URL; falls back to the icon when absent or broken. */
  image?: string | null;
  /** Circular vs. rounded-square avatar (players read better as squares). */
  imageShape: 'circle' | 'square';
  label: string;
  value: string;
  sub?: string;
  to?: string;
}

interface LeaguePulseProps {
  topTeam?: { name: string; value: number; to?: string; image?: string | null } | null;
  topAsset?: { name: string; value: number; to?: string; image?: string | null } | null;
}

// ─── Avatar: image with graceful fallback to the accent icon tile ──────

function PulseAvatar({ image, imageShape, icon: Icon }: Pick<PulseStat, 'image' | 'imageShape' | 'icon'>) {
  const [failed, setFailed] = useState(false);
  const radius = imageShape === 'circle' ? 'rounded-full' : 'rounded-lg';

  if (image && !failed) {
    return (
      <img
        src={image}
        alt=""
        onError={() => setFailed(true)}
        className={`h-11 w-11 shrink-0 object-cover bg-[#22222b] ring-1 ring-inset ring-white/5 ${radius}`}
      />
    );
  }
  return (
    <div className={`flex h-11 w-11 shrink-0 items-center justify-center bg-[#22222b] ring-1 ring-inset ring-white/5 ${radius}`}>
      <Icon className="h-5 w-5 text-[#75757f]" />
    </div>
  );
}

// ─── Card: header banner + body, mirroring the Movers columns ──────────

function PulseCard({ stat }: { stat: PulseStat }) {
  const body = (
    <>
      <PulseAvatar image={stat.image} imageShape={stat.imageShape} icon={stat.icon} />
      <div className="min-w-0 flex-1">
        <p className="font-display truncate text-[15px] font-bold leading-tight text-white transition-colors group-hover:text-accent-400">
          {stat.value}
        </p>
        {stat.sub && <p className="mt-0.5 truncate text-[12px] tabular-nums text-[#75757f]">{stat.sub}</p>}
      </div>
      {stat.to && <ChevronRight className="h-4 w-4 shrink-0 text-[#4c4c56] transition-colors group-hover:text-[#75757f]" />}
    </>
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-[#22222b] bg-[#141419]">
      {/* Header banner (like "RISERS") */}
      <div className="flex items-center gap-2 border-b border-[#1b1b22] px-3 py-2.5">
        <stat.icon className="h-3.5 w-3.5 text-[#75757f]" />
        <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-[#9c9ca7]">
          {stat.label}
        </span>
      </div>

      {/* Body */}
      {stat.to ? (
        <Link to={stat.to} className="group flex items-center gap-3 px-3 py-3 transition-colors hover:bg-[#17171d] active:bg-[#1b1b22]">
          {body}
        </Link>
      ) : (
        <div className="flex items-center gap-3 px-3 py-3">{body}</div>
      )}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────

/** At-a-glance league highlights, each in its own labeled card (Top Team, Top Asset). */
export function LeaguePulse({ topTeam, topAsset }: LeaguePulseProps) {
  const stats: PulseStat[] = [];
  if (topTeam) {
    stats.push({ icon: Trophy, image: topTeam.image, imageShape: 'circle', label: 'Top Team', value: topTeam.name, sub: `${topTeam.value.toLocaleString()} pts`, to: topTeam.to });
  }
  if (topAsset) {
    stats.push({ icon: Flame, image: topAsset.image, imageShape: 'square', label: 'Top Asset', value: topAsset.name, sub: `${topAsset.value.toLocaleString()} KTC`, to: topAsset.to });
  }

  if (stats.length === 0) return null;

  return (
    <section>
      <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em] text-accent-500">League Pulse</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:gap-4">
        {stats.map((s) => (
          <PulseCard key={s.label} stat={s} />
        ))}
      </div>
    </section>
  );
}
