import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PositionBadge } from './PositionBadge';
import { getPlayerImageUrl } from '../lib/trade-shared';
import { positionHue } from '../lib/positions';

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
  /** Show the position-hue left accent rail (the rebuilt list identity cue).
   *  On by default; pass false for compact/secondary rows (trade packages,
   *  search results) where the rail would be visual noise. */
  rail?: boolean;
  /** 0–100 "value vs the #1 asset" — renders a thin position-hue meter under
   *  the meta line (ranking boards). Omit to hide. */
  meter?: number;
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
  rail,
  meter,
  className = '',
}: PlayerRowProps) {
  const isPick = !playerId;
  const isSm = size === 'sm';
  const avatar = isSm ? 'w-10 h-10' : 'w-12 h-12';
  const nameColor = dim ? 'text-muted' : 'text-white';
  const valueColor = dim ? 'text-muted' : 'text-white';
  const hue = positionHue(isPick ? 'PICK' : position);
  // Rail shows by default on PRIMARY standalone rows; auto-off on `dim`
  // secondary rows (trade packages, feed moves) and where explicitly disabled.
  const showRail = (rail ?? !dim) && (isPick || !!position);

  const target = to === undefined ? (playerId ? `/players/${playerId}` : null) : to;
  const interactive = Boolean(target || onClick);

  const showDelta = delta !== undefined;
  const up = (delta ?? 0) >= 0;
  const isMedal = rank !== undefined && rank <= 3;

  const base = `flex items-center gap-3 ${showRail ? 'pl-3.5' : 'pl-3'} pr-3 sm:pr-4 ${isSm ? 'py-2.5' : 'py-3'} text-left w-full relative ${
    divided ? 'border-b border-line-subtle last:border-b-0' : ''
  } ${interactive ? 'group hover:bg-elevated active:bg-overlay transition-colors cursor-pointer' : ''} ${className}`;

  const inner = (
    <>
      {/* Position-hue accent rail — the rebuilt list identity cue. Sits flush to
          the left edge of the row; a soft glow so it reads as lit, not painted. */}
      {showRail && (
        <span
          className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full"
          style={{ backgroundColor: hue, boxShadow: `0 0 8px ${hue}55` }}
          aria-hidden
        />
      )}

      {lead !== undefined ? (
        <div className="shrink-0">{lead}</div>
      ) : rank !== undefined ? (
        isMedal ? (
          // Top-3 get a filled medal chip — the podium reads instantly.
          <span
            className="font-display text-[12px] font-extrabold tabular-nums w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
            style={{ color: '#0b0b0f', backgroundColor: rankMedalColors[rank] }}
          >
            {rank}
          </span>
        ) : (
          <span className="font-display text-[13px] font-bold tabular-nums w-6 text-center shrink-0 text-faint">
            {rank}
          </span>
        )
      ) : null}

      {/* Avatar */}
      {isPick ? (
        <div
          className={`${avatar} rounded-xl flex items-center justify-center shrink-0 ring-1 ring-inset`}
          style={{ backgroundColor: `${hue}1a`, borderColor: `${hue}40`, color: hue }}
        >
          <span className="text-[10px] font-extrabold">PK</span>
        </div>
      ) : (
        <div className={`${avatar} rounded-xl overflow-hidden bg-overlay shrink-0 ring-1 ring-inset ring-white/10`}>
          <img
            src={getPlayerImageUrl(playerId!)}
            alt=""
            className="w-full h-full object-cover object-top"
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
            <span className={`text-[14px] font-semibold truncate group-hover:text-accent-400 transition-colors ${nameColor}`}>
              {name}
            </span>
            {injuryStatus && (
              <span className="px-1.5 py-0.5 text-[9px] bg-red-500/15 text-red-400 rounded-md font-bold leading-none shrink-0 ring-1 ring-inset ring-red-500/20">
                {injuryStatus}
              </span>
            )}
          </span>

          {showDelta ? (
            <span
              className={`text-[12px] font-bold tabular-nums shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md ${up ? 'text-accent-400 bg-accent-500/10' : 'text-red-400 bg-red-500/10'}`}
            >
              {up ? '↑' : '↓'}
              {Math.abs(delta!).toLocaleString()}
            </span>
          ) : value !== undefined ? (
            <span className="shrink-0 flex flex-col items-end leading-tight">
              <span className={`font-display text-[16px] font-bold tabular-nums ${valueColor}`}>
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
            {team && <span className="text-[11px] text-muted font-semibold">{team}</span>}
            {meta !== undefined && meta !== null && meta !== '' && (
              <>
                {(position || team) && <span className="text-line-strong">·</span>}
                <span className="text-[11px] text-muted truncate">{meta}</span>
              </>
            )}
            {showDelta && value !== undefined && (
              <>
                <span className="text-line-strong">·</span>
                <span className="text-[10px] text-faint tabular-nums">{value.toLocaleString()}</span>
              </>
            )}
          </div>
        )}

        {/* Value-vs-#1 meter (ranking boards) — a thin position-hue bar that
            fills the name column, so it reads as the player's share of the top. */}
        {meter !== undefined && (
          <div className="mt-1.5 h-[3px] w-full rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.max(2, Math.min(100, meter))}%`, backgroundColor: hue, opacity: 0.75 }}
            />
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
