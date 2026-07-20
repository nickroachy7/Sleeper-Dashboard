import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { PositionBadge } from './PositionBadge';
import { StatTile } from './StatTile';
import { AssetAvatar } from './AssetAvatar';
import { ValueChart } from './charts/ValueChart';
import { isPickAsset } from '../lib/vote-assets';
import type { AssetDetail } from '../hooks/usePairDetails';
import type { Player } from '../types/domain';

// ── Compare panel ────────────────────────────────────────────────────────────
// Lives under the two vote cards and gives the user the context to make an
// INFORMED "who'd you rather" call instead of guessing on a half-known name:
// value, overall + position rank, a 30-day value sparkline, age/experience,
// injury, and a one-line read. Side by side so the two assets read as a direct
// comparison. Always visible — it IS the "look through and decide" surface.

export interface CompareSide {
  player: Player;
  /** Community value (the market number). */
  value: number | null;
  overallRank: number | null;
  positionRank: number | null;
  detail: AssetDetail | undefined;
}

function TrendChip({ delta }: { delta: number | null }) {
  if (delta == null || Math.abs(delta) < 50) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-[#75757f]">
        <Minus className="h-3 w-3" /> Flat (30d)
      </span>
    );
  }
  const up = delta > 0;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${up ? 'text-emerald-400' : 'text-red-400'}`}>
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {up ? '+' : ''}{Math.round(delta).toLocaleString()} (30d)
    </span>
  );
}

/** One-line contextual read from trend + age — a light "what's the story",
 *  not a hard projection. */
function quickRead(side: CompareSide): string {
  const { detail, player } = side;
  if (isPickAsset(player.player_id)) {
    return 'Future rookie capital — value tracks where the class and the pick slot land.';
  }
  const age = detail?.age ?? null;
  const t = detail?.trend30 ?? null;
  const bits: string[] = [];
  if (t != null && Math.abs(t) >= 50) bits.push(t > 0 ? 'value rising' : 'value slipping');
  if (age != null) {
    if (age <= 23) bits.push('young, ascending window');
    else if (age >= 29 && (player.position === 'RB')) bits.push('age risk at RB');
    else if (age >= 30) bits.push('on the back nine');
  }
  if (detail?.injury_status) bits.push(`injury: ${detail.injury_status.toLowerCase()}`);
  if (!bits.length) return 'Settled market value, no strong signal either way.';
  return bits.join(' · ').replace(/^./, (c) => c.toUpperCase());
}

function Column({ side }: { side: CompareSide }) {
  const { player, value, overallRank, positionRank, detail } = side;
  const pick = isPickAsset(player.player_id);
  const chart = (detail?.history ?? []).map((h) => ({ date: h.date, value: h.value }));
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2.5 mb-3">
        <AssetAvatar id={player.player_id} size={44} />
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-white truncate">{player.full_name}</p>
          <span className="flex items-center gap-1.5">
            <PositionBadge position={player.position} />
            {player.team && <span className="text-[11px] text-[#75757f]">{player.team}</span>}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5 mb-2.5">
        <StatTile label="YAP Value">{value != null ? Math.round(value).toLocaleString() : '—'}</StatTile>
        <StatTile label="Rank" sub={!pick && overallRank && positionRank ? `${player.position}${positionRank}` : undefined}>
          {overallRank ? `#${overallRank}` : '—'}
        </StatTile>
        {pick ? (
          <StatTile label="Type" className="col-span-2">Rookie draft pick</StatTile>
        ) : (
          <>
            <StatTile label="Age">{detail?.age != null ? `${detail.age}` : '—'}</StatTile>
            <StatTile label="Exp">
              {detail?.years_exp != null ? (detail.years_exp === 0 ? 'Rookie' : `${detail.years_exp} yr`) : '—'}
            </StatTile>
          </>
        )}
      </div>

      {!pick && (
        <div className="mb-2 flex items-center justify-between">
          <TrendChip delta={detail?.trend30 ?? null} />
          {detail?.injury_status && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/15 text-red-400">
              {detail.injury_status}
            </span>
          )}
        </div>
      )}

      {pick ? (
        <div className="rounded-lg border border-[#22222b] bg-[#101015]/40 h-[110px] flex items-center justify-center text-[11px] text-[#60606a] px-3 text-center">
          Pick value moves with the incoming rookie class
        </div>
      ) : chart.length >= 2 ? (
        <div className="rounded-lg border border-[#22222b] bg-[#101015]/60 px-1 pt-1">
          <ValueChart data={chart} height={110} diverging={false} />
        </div>
      ) : (
        <div className="rounded-lg border border-[#22222b] bg-[#101015]/40 h-[110px] flex items-center justify-center text-[11px] text-[#60606a]">
          Not enough value history
        </div>
      )}

      <p className="mt-2.5 text-[11.5px] leading-relaxed text-[#9c9ca7]">{quickRead(side)}</p>
    </div>
  );
}

export function VoteComparePanel({ a, b }: { a: CompareSide; b: CompareSide }) {
  return (
    <div className="mt-8 rounded-2xl border border-[#22222b] bg-[#141419] p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-4">
        <p className="text-[10px] font-bold text-[#75757f] tracking-[2px] uppercase">Compare</p>
        <span className="text-[11px] text-[#60606a]">— dig in before you decide</span>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:gap-6">
        <Column side={a} />
        <Column side={b} />
      </div>
    </div>
  );
}
