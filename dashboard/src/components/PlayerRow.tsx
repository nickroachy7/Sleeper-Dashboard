import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PositionBadge } from './PositionBadge';
import { getPlayerImageUrl } from '../lib/trade-shared';

const rankMedalColors: Record<number, string> = {
  1: '#ffd700',
  2: '#c0c0c0',
  3: '#cd7f32',
};

export interface PlayerRowProps {
  /** Sleeper player id. Omit/null to render a draft-pick placeholder. */
  playerId?: string | null;
  name: string;
  position?: string;
  team?: string | null;
  /** Primary trailing value (e.g. KTC value). */
  value?: number;
  /** Small secondary value under the main value (e.g. community value beneath
   *  "your value" on a personal board). Rendered muted; ignored when `delta` is
   *  set (that mode already repurposes the value line). */
  subValue?: ReactNode;
  /** Trend chip on the right (green up / red down). When set, `value` moves to the meta line. */
  delta?: number;
  injuryStatus?: string | null;
  /** Rank number in a leading medal slot (1–3 get medal colors). */
  rank?: number;
  /** Custom leading node (e.g. a pick number); overrides `rank`. */
  lead?: ReactNode;
  /** Inline node placed right before the name (e.g. a +/− indicator). */
  prefix?: ReactNode;
  /** Extra meta appended after "position · team" (e.g. owner, drafted-by). */
  meta?: ReactNode;
  /** Trailing node after the value (e.g. a remove button). */
  suffix?: ReactNode;
  /**
   * Navigation target. Defaults to `/players/:playerId` when a playerId is
   * present. Pass `null` to opt out (selection rows, non-navigable picks).
   */
  to?: string | null;
  onClick?: () => void;
  size?: 'sm' | 'md';
  /** Bottom divider for stacked list rows (auto-removed on the last child). */
  divided?: boolean;
  /** Dim the name/value (secondary rows, e.g. under a brighter team header). */
  dim?: boolean;
  className?: string;
}

/**
 * Canonical player (or draft-pick) row used across every list in the app —
 * search palette, rankings, rosters, trade packages, drafts. Clickable by
 * default: a player row links to its detail page unless `to` is set to null.
 */
export function PlayerRow({
  playerId,
  name,
  position,
  team,
  value,
  subValue,
  delta,
  injuryStatus,
  rank,
  lead,
  prefix,
  meta,
  suffix,
  to,
  onClick,
  size = 'md',
  divided = false,
  dim = false,
  className = '',
}: PlayerRowProps) {
  const isPick = !playerId;
  const isSm = size === 'sm';
  const avatar = isSm ? 'w-8 h-8' : 'w-9 h-9';
  const nameColor = dim ? 'text-[#9c9ca7]' : 'text-white';
  const valueColor = dim ? 'text-[#9c9ca7]' : 'text-white';

  const target = to === undefined ? (playerId ? `/players/${playerId}` : null) : to;
  const interactive = Boolean(target || onClick);

  const showDelta = delta !== undefined;
  const up = (delta ?? 0) >= 0;

  const base = `flex items-center gap-3 px-3 ${isSm ? 'py-2' : 'py-2.5'} text-left w-full ${
    divided ? 'border-b border-[#1b1b22] last:border-b-0' : ''
  } ${interactive ? 'group hover:bg-[#1b1b22] active:bg-[#22222b] transition-colors cursor-pointer' : ''} ${className}`;

  const inner = (
    <>
      {lead !== undefined ? (
        <div className="shrink-0">{lead}</div>
      ) : rank !== undefined ? (
        <span
          className="font-display text-[13px] font-bold tabular-nums w-5 text-center shrink-0"
          style={{ color: rankMedalColors[rank] || '#60606a' }}
        >
          {rank}
        </span>
      ) : null}

      {/* Avatar */}
      {isPick ? (
        <div
          className={`${avatar} rounded-full bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0`}
        >
          <span className="text-[9px] font-bold text-cyan-400/70">PK</span>
        </div>
      ) : (
        <div className={`${avatar} rounded-full overflow-hidden bg-[#22222b] shrink-0 ring-1 ring-inset ring-white/5`}>
          <img
            src={getPlayerImageUrl(playerId!)}
            alt=""
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.visibility = 'hidden';
            }}
          />
        </div>
      )}

      {/* Name + meta */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="flex items-center gap-1.5 min-w-0">
            {prefix}
            <span className={`text-[14px] font-medium truncate group-hover:text-accent-400 transition-colors ${nameColor}`}>
              {name}
            </span>
            {injuryStatus && (
              <span className="px-1 py-0.5 text-[9px] bg-red-500/20 text-red-400 rounded font-bold leading-none shrink-0">
                {injuryStatus}
              </span>
            )}
          </span>

          {showDelta ? (
            <span
              className={`text-[12px] font-bold tabular-nums shrink-0 ${up ? 'text-accent-500' : 'text-[#ef4444]'}`}
            >
              {up ? '+' : '−'}
              {Math.abs(delta!).toLocaleString()}
            </span>
          ) : value !== undefined ? (
            <span className="shrink-0 flex flex-col items-end leading-tight">
              <span className={`font-display text-[14px] font-bold tabular-nums ${valueColor}`}>
                {value > 0 ? value.toLocaleString() : '—'}
              </span>
              {subValue != null && subValue !== '' && (
                <span className="text-[10px] text-ghost tabular-nums">{subValue}</span>
              )}
            </span>
          ) : null}
        </div>

        {(position || team || meta || (showDelta && value !== undefined)) && (
          <div className="flex items-center gap-1.5 mt-1">
            {position && <PositionBadge position={position} size="xs" />}
            {team && <span className="text-[11px] text-[#9c9ca7] font-medium">{team}</span>}
            {meta !== undefined && meta !== null && meta !== '' && (
              <>
                {(position || team) && <span className="text-[#4c4c56]">·</span>}
                <span className="text-[11px] text-[#9c9ca7] truncate">{meta}</span>
              </>
            )}
            {showDelta && value !== undefined && (
              <>
                <span className="text-[#4c4c56]">·</span>
                <span className="text-[10px] text-[#60606a] tabular-nums">{value.toLocaleString()}</span>
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
