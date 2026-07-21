import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { PositionBadge } from './PositionBadge';
import { AssetAvatar } from './AssetAvatar';
import { ValueChart } from './charts/ValueChart';
import { isPickAsset } from '../lib/vote-assets';
import type { AssetDetail } from '../hooks/usePairDetails';
import type { Player } from '../types/domain';

// ── PlayerVersus ─────────────────────────────────────────────────────────────
// One self-contained head-to-head of two assets (players or picks): each is a
// single column — avatar, name, the key decision stats, a value sparkline, and
// a one-line read — laid out as a strict two-column grid so it can never
// overflow the page. Per-stat the leading side is subtly accented, so the
// comparison reads at a glance.
//
// Reusable across surfaces via `variant`:
//   • 'vote'     — each column is a big tap target; onPick(side) fires. (Rank 'Em, feed CTAs)
//   • 'readonly' — pure display, no picking. (chat, embeds)
// The component knows nothing about how a vote is recorded — the caller owns
// onPick — so it drops into any surface.

export interface CompareSide {
  player: Player;
  /** Community value (the market number). */
  value: number | null;
  overallRank: number | null;
  positionRank: number | null;
  detail: AssetDetail | undefined;
}

type Winner = 0 | 1 | null;

interface Verdicts {
  value: Winner;
  rank: Winner;
  trend: Winner;
  age: Winner;
}

/** Which side leads each metric (null = tie / not comparable). */
function compareSides(a: CompareSide, b: CompareSide): Verdicts {
  const pick = isPickAsset(a.player.player_id) || isPickAsset(b.player.player_id);
  const better = (x: number | null | undefined, y: number | null | undefined, higher = true): Winner => {
    if (x == null || y == null) return null;
    if (x === y) return null;
    return (higher ? x > y : x < y) ? 0 : 1;
  };
  return {
    value: better(a.value, b.value),
    // Lower overall rank number is better (#1 > #50).
    rank: better(a.overallRank, b.overallRank, false),
    trend: pick ? null : better(a.detail?.trend30 ?? null, b.detail?.trend30 ?? null),
    // Younger is better for dynasty; only compare when both known and it's players.
    age: pick ? null : better(a.detail?.age ?? null, b.detail?.age ?? null, false),
  };
}

const WIN = 'text-emerald-400';
const NEUTRAL = 'text-white';

function TrendBit({ delta }: { delta: number | null }) {
  if (delta == null || Math.abs(delta) < 50) {
    return <span className="inline-flex items-center gap-0.5 text-faint"><Minus className="h-3 w-3" />Flat</span>;
  }
  const up = delta > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 font-semibold ${up ? 'text-emerald-400' : 'text-red-400'}`}>
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {up ? '+' : ''}{Math.round(delta).toLocaleString()}
    </span>
  );
}

/** One-line contextual read — a light "what's the story", not a projection. */
function quickRead(side: CompareSide): string {
  const { detail, player } = side;
  if (isPickAsset(player.player_id)) {
    return 'Future rookie capital — value tracks the class & pick slot.';
  }
  const age = detail?.age ?? null;
  const t = detail?.trend30 ?? null;
  const bits: string[] = [];
  if (t != null && Math.abs(t) >= 50) bits.push(t > 0 ? 'value rising' : 'value slipping');
  if (age != null) {
    if (age <= 23) bits.push('young, ascending');
    else if (age >= 29 && player.position === 'RB') bits.push('age risk at RB');
    else if (age >= 30) bits.push('on the back nine');
  }
  // Only surface a real injury designation, not Sleeper's "NA"/"Active" noise.
  const inj = detail?.injury_status;
  if (inj && !['na', 'active', 'healthy'].includes(inj.toLowerCase())) bits.push(inj.toLowerCase());
  if (!bits.length) return 'Settled value, no strong signal.';
  return bits.join(' · ').replace(/^./, (c) => c.toUpperCase());
}

/** One metric row inside a column: label + value, accented when this side wins. */
function Stat({ label, children, win }: { label: string; children: React.ReactNode; win: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-[#101015]/60 px-2.5 py-1.5">
      <p className="text-[9px] text-faint uppercase tracking-[0.08em] font-bold truncate">{label}</p>
      <p className={`font-display text-[15px] font-bold tabular-nums truncate ${win ? WIN : NEUTRAL}`}>{children}</p>
    </div>
  );
}

function Column({
  side, sideIndex, verdicts, variant, highlighted, disabled, onPick,
}: {
  side: CompareSide;
  sideIndex: 0 | 1;
  verdicts: Verdicts;
  variant: 'vote' | 'readonly';
  highlighted: boolean;
  disabled: boolean;
  onPick?: () => void;
}) {
  const { player, value, overallRank, positionRank, detail } = side;
  const pick = isPickAsset(player.player_id);
  const chart = (detail?.history ?? []).map((h) => ({ date: h.date, value: h.value }));
  const wins = (w: Winner) => w === sideIndex;

  const inner = (
    <div className="min-w-0 flex flex-col items-center text-center gap-2">
      <AssetAvatar id={player.player_id} alt={player.full_name} size={72} />
      <div className="min-w-0 w-full">
        <p className="text-[14px] font-semibold text-white truncate leading-tight">{player.full_name}</p>
        <span className="mt-1 inline-flex items-center gap-1.5">
          <PositionBadge position={player.position} />
          {player.team && <span className="text-[11px] text-faint">{player.team}</span>}
        </span>
      </div>

      {/* Key decision stats — leader accented. */}
      <div className="grid grid-cols-2 gap-1.5 w-full mt-0.5">
        <Stat label="Value" win={wins(verdicts.value)}>
          {value != null ? Math.round(value).toLocaleString() : '—'}
        </Stat>
        <Stat label={!pick && positionRank ? `${player.position}${positionRank}` : 'Rank'} win={wins(verdicts.rank)}>
          {overallRank ? `#${overallRank}` : '—'}
        </Stat>
        {pick ? (
          <div className="col-span-2 rounded-lg border border-line bg-[#101015]/60 px-2.5 py-1.5">
            <p className="text-[9px] text-faint uppercase tracking-[0.08em] font-bold">Type</p>
            <p className="text-[13px] font-semibold text-white">Rookie pick</p>
          </div>
        ) : (
          <>
            <Stat label="Age" win={wins(verdicts.age)}>{detail?.age != null ? detail.age : '—'}</Stat>
            <div className="rounded-lg border border-line bg-[#101015]/60 px-2.5 py-1.5">
              <p className="text-[9px] text-faint uppercase tracking-[0.08em] font-bold">30d Trend</p>
              <p className="text-[13px] font-bold tabular-nums"><TrendBit delta={detail?.trend30 ?? null} /></p>
            </div>
          </>
        )}
      </div>

      {/* Value sparkline (players) or pick note. */}
      {pick ? (
        <div className="w-full rounded-lg border border-line bg-[#101015]/40 h-[72px] flex items-center justify-center text-[10px] text-ghost px-3">
          Value moves with the rookie class
        </div>
      ) : chart.length >= 2 ? (
        <div className="w-full rounded-lg border border-line bg-[#101015]/60 px-1 pt-1">
          <ValueChart data={chart} height={72} diverging={false} />
        </div>
      ) : (
        <div className="w-full rounded-lg border border-line bg-[#101015]/40 h-[72px] flex items-center justify-center text-[10px] text-ghost">
          No value history
        </div>
      )}

      <p className="text-[11px] leading-snug text-muted mt-0.5">{quickRead(side)}</p>
    </div>
  );

  const base = 'rounded-2xl border p-3 sm:p-4 transition-all';
  if (variant === 'vote') {
    return (
      <button
        type="button"
        onClick={onPick}
        disabled={disabled}
        className={`${base} ${highlighted
          ? 'border-accent-500 bg-accent-500/10 scale-[0.98]'
          : 'border-line bg-surface hover:border-accent-500 hover:bg-elevated'} disabled:cursor-default`}
      >
        {inner}
      </button>
    );
  }
  return <div className={`${base} border-line bg-surface`}>{inner}</div>;
}

export interface PlayerVersusProps {
  a: CompareSide;
  b: CompareSide;
  /** 'vote' = tappable columns (calls onPick); 'readonly' = display only. */
  variant?: 'vote' | 'readonly';
  /** Which side is flashing as just-picked (vote variant). */
  pickedIndex?: 0 | 1 | null;
  disabled?: boolean;
  onPick?: (sideIndex: 0 | 1) => void;
}

/**
 * Two assets side-by-side with the decision context baked in. One grid, two
 * columns, a centered "OR" — never overflows (min-w-0 columns). Drop into any
 * surface; the caller decides what a pick does.
 */
export function PlayerVersus({ a, b, variant = 'vote', pickedIndex = null, disabled = false, onPick }: PlayerVersusProps) {
  const verdicts = compareSides(a, b);
  return (
    <div className="relative grid grid-cols-2 gap-3 sm:gap-4 items-stretch">
      <Column
        side={a} sideIndex={0} verdicts={verdicts} variant={variant}
        highlighted={pickedIndex === 0} disabled={disabled} onPick={() => onPick?.(0)}
      />
      <Column
        side={b} sideIndex={1} verdicts={verdicts} variant={variant}
        highlighted={pickedIndex === 1} disabled={disabled} onPick={() => onPick?.(1)}
      />
      {/* Centered OR badge straddling the two columns. */}
      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-base border border-line flex items-center justify-center text-[10px] font-bold tracking-widest uppercase text-muted pointer-events-none">
        or
      </span>
    </div>
  );
}
