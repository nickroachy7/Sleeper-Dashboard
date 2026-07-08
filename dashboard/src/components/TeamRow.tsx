import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Users } from 'lucide-react';

const rankMedalColors: Record<number, string> = {
  1: '#ffd700',
  2: '#c0c0c0',
  3: '#cd7f32',
};

export interface TeamRowProps {
  rosterId: number | string;
  name: string;
  /** Owner name / record shown on the meta line. */
  subtitle?: string;
  value?: number;
  /** Sleeper avatar id (thumbs). Falls back to a generic team glyph. */
  avatarId?: string | null;
  rank?: number;
  meta?: ReactNode;
  suffix?: ReactNode;
  /** Navigation target. Defaults to `/teams/:rosterId`. Pass `null` to opt out. */
  to?: string | null;
  onClick?: () => void;
  size?: 'sm' | 'md';
  divided?: boolean;
  className?: string;
}

/** Canonical league-team row. Clickable by default → team detail page. */
export function TeamRow({
  rosterId,
  name,
  subtitle,
  value,
  avatarId,
  rank,
  meta,
  suffix,
  to,
  onClick,
  size = 'md',
  divided = false,
  className = '',
}: TeamRowProps) {
  const isSm = size === 'sm';
  const avatar = isSm ? 'w-8 h-8' : 'w-9 h-9';

  const target = to === undefined ? `/teams/${rosterId}` : to;
  const interactive = Boolean(target || onClick);

  const base = `flex items-center gap-3 px-3 ${isSm ? 'py-2' : 'py-2.5'} text-left w-full ${
    divided ? 'border-b border-[#1b1b22] last:border-b-0' : ''
  } ${interactive ? 'group hover:bg-[#1b1b22] transition-colors cursor-pointer' : ''} ${className}`;

  const inner = (
    <>
      {rank !== undefined && (
        <span
          className="font-display text-[13px] font-bold tabular-nums w-5 text-center shrink-0"
          style={{ color: rankMedalColors[rank] || '#60606a' }}
        >
          {rank}
        </span>
      )}

      {avatarId ? (
        <div className={`${avatar} rounded-full overflow-hidden bg-[#22222b] shrink-0 ring-1 ring-inset ring-white/5`}>
          <img
            src={`https://sleepercdn.com/avatars/thumbs/${avatarId}`}
            alt=""
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.visibility = 'hidden';
            }}
          />
        </div>
      ) : (
        <div className={`${avatar} rounded-full bg-[#22222b] flex items-center justify-center shrink-0 ring-1 ring-inset ring-white/5`}>
          <Users className="h-3.5 w-3.5 text-[#75757f]" />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[13px] font-semibold text-white truncate group-hover:text-accent-400 transition-colors">
            {name}
          </span>
          {value !== undefined && (
            <span className="font-display text-[13px] font-bold text-white tabular-nums shrink-0">
              {value > 0 ? value.toLocaleString() : '—'}
            </span>
          )}
        </div>
        {(subtitle || meta) && (
          <div className="flex items-center gap-1.5 mt-1">
            {subtitle && <span className="text-[10px] text-[#75757f] truncate">{subtitle}</span>}
            {meta !== undefined && meta !== null && meta !== '' && (
              <>
                {subtitle && <span className="text-[#4c4c56]">·</span>}
                <span className="text-[10px] text-[#75757f] truncate">{meta}</span>
              </>
            )}
          </div>
        )}
      </div>

      {suffix}
    </>
  );

  if (target) {
    return (
      <Link to={target} onClick={onClick} className={base}>
        {inner}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={base}>
        {inner}
      </button>
    );
  }
  return <div className={base}>{inner}</div>;
}
