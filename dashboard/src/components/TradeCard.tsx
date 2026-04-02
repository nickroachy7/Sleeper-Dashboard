import { Clock } from 'lucide-react';
import { PositionBadge } from './PositionBadge';
import { PickChip } from './PickChip';

interface TradePlayer {
  id: string;
  name: string;
  position: string;
  team: string | null;
  value: number;
}

interface TradePick {
  season: string;
  round: number;
  value?: number;
}

export interface TradeSide {
  teamName: string;
  players: TradePlayer[];
  picks: TradePick[];
  totalValue: number;
}

interface TradeCardProps {
  sides: TradeSide[];
  winnerId?: number | null;
  isEvenTrade?: boolean;
  date?: string;
  fairnessLabel?: string;
  fairnessBadge?: string;
  variant?: 'compact' | 'full';
  showHeader?: boolean;
}

export function TradeCard({
  sides,
  winnerId,
  isEvenTrade,
  date,
  fairnessLabel,
  fairnessBadge,
  variant = 'full',
  showHeader = true,
}: TradeCardProps) {
  if (sides.length < 2) return null;

  const diff = Math.abs(sides[0].totalValue - sides[1].totalValue);
  const winnerIndex = sides[0].totalValue > sides[1].totalValue ? 0 : sides[1].totalValue > sides[0].totalValue ? 1 : null;
  const actualWinnerIdx = winnerId !== null && winnerId !== undefined ? winnerId : winnerIndex;
  const isActuallyEven = isEvenTrade ?? diff === 0;

  const isCompact = variant === 'compact';

  return (
    <div className={`bg-[#0a0a0a] rounded-xl overflow-hidden card-hover ${isCompact ? 'p-3' : 'p-4 sm:p-5'}`}>
      {/* Header */}
      {showHeader && (
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-white text-black text-[10px] font-extrabold tracking-[1px] rounded-sm">
              TRADE
            </span>
            {fairnessLabel && fairnessBadge && (
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${fairnessBadge}`}>
                {fairnessLabel}
              </span>
            )}
            {date && (
              <span className="text-[11px] text-[#444444] flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {date}
              </span>
            )}
          </div>
          {isActuallyEven ? (
            <span className="text-[10px] sm:text-xs text-[#555555] font-medium">Even Trade</span>
          ) : diff > 0 && (
            <span className="text-[10px] sm:text-xs text-emerald-400 font-semibold">
              {sides[actualWinnerIdx ?? 0]?.teamName} +{diff.toLocaleString()}
            </span>
          )}
        </div>
      )}

      {/* Trade sides */}
      <div className={`grid grid-cols-1 md:grid-cols-2 ${isCompact ? 'gap-3' : 'gap-4 sm:gap-5'}`}>
        {sides.map((side, idx) => {
          const isWinner = actualWinnerIdx === idx && !isActuallyEven;
          return (
            <div
              key={idx}
              className={`pl-3 border-l-2 ${isWinner ? 'border-l-emerald-500' : 'border-l-[#2a2a2a]'}`}
            >
              {/* Team name + total */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`font-bold text-white ${isCompact ? 'text-[13px]' : 'text-sm'}`}>
                    {side.teamName}
                  </span>
                  {isWinner && (
                    <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded leading-none">
                      W
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-[#444444] tabular-nums">
                  {side.totalValue.toLocaleString()} KTC
                </span>
              </div>

              {/* Assets — ValueWatch-style rows */}
              <div className="divide-y divide-[#111111]">
                {side.players.map((p) => (
                  <div key={p.id} className="flex items-center gap-2.5 py-2">
                    <img
                      src={`https://sleepercdn.com/content/nfl/players/${p.id}.jpg`}
                      alt=""
                      className="w-7 h-7 rounded-full object-cover bg-[#111111] shrink-0"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold text-white truncate">{p.name}</p>
                      <div className="flex items-center gap-1">
                        <PositionBadge position={p.position} size="xs" />
                        {p.team && <span className="text-[10px] text-[#444444]">{p.team}</span>}
                      </div>
                    </div>
                    <span className="text-[12px] font-bold text-white tabular-nums shrink-0">
                      {p.value > 0 ? p.value.toLocaleString() : '—'}
                    </span>
                  </div>
                ))}
                {side.picks.map((pick, pickIdx) => (
                  <div key={pickIdx} className="flex items-center gap-2.5 py-2">
                    <PickChip
                      season={pick.season}
                      round={pick.round}
                      size="sm"
                    />
                    <div className="flex-1" />
                    <span className="text-[12px] font-bold text-white tabular-nums shrink-0">
                      {pick.value !== undefined && pick.value > 0 ? pick.value.toLocaleString() : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
