import { Clock } from 'lucide-react';
import { AssetRow } from './AssetRow';

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
  variant?: 'compact' | 'full';
  showHeader?: boolean;
}

export function TradeCard({
  sides,
  winnerId,
  isEvenTrade,
  date,
  variant = 'full',
  showHeader = true,
}: TradeCardProps) {
  if (sides.length < 2) return null;

  const diff = Math.abs(sides[0].totalValue - sides[1].totalValue);
  const winnerIndex = sides[0].totalValue > sides[1].totalValue ? 0 : sides[1].totalValue > sides[0].totalValue ? 1 : null;
  const actualWinnerIdx = winnerId !== null && winnerId !== undefined ? winnerId : winnerIndex;
  const isActuallyEven = isEvenTrade ?? diff === 0;
  const hasZeroSide = sides.some(s => s.totalValue === 0);
  const isNearEven = !hasZeroSide && (isActuallyEven || diff < 500);

  const isCompact = variant === 'compact';

  return (
    <div className="bg-[#0a0a0a] rounded-xl overflow-hidden card-hover">
      {/* Header */}
      {showHeader && (
        <div className={`flex items-center justify-between bg-white/[0.05] ${isCompact ? 'px-3 py-3' : 'px-4 sm:px-5 py-3 sm:py-4'}`}>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-white text-black text-[10px] font-extrabold tracking-[1px] rounded-sm">
              TRADE
            </span>
            {date && (
              <span className="text-[11px] text-[#555555] flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {date}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Trade sides */}
      <div>
        {sides.map((side, idx) => {
          const isWinner = actualWinnerIdx === idx && !isActuallyEven;
          const assetCount = side.players.length + side.picks.length;
          return (
            <div key={idx}>
              {/* Team header */}
              <div className={`flex items-center justify-between border-t border-[#1a1a1a] bg-[#111111] ${isCompact ? 'px-3 py-2.5' : 'px-4 sm:px-5 py-2.5'}`}>
                <div className="flex items-center gap-2">
                  <span className={`font-bold text-white ${isCompact ? 'text-[13px]' : 'text-sm'}`}>
                    {side.teamName}
                  </span>
                  {isNearEven ? (
                    <span className="text-[10px] font-bold text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded leading-none">
                      =
                    </span>
                  ) : actualWinnerIdx !== null && (
                    isWinner ? (
                      <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded leading-none">
                        W
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded leading-none">
                        L
                      </span>
                    )
                  )}
                  <span className="text-[10px] text-[#555555]">
                    {assetCount} asset{assetCount !== 1 ? 's' : ''}
                  </span>
                </div>
                {(() => {
                  const otherTotal = sides.filter((_, i) => i !== idx).reduce((sum, s) => sum + s.totalValue, 0) / Math.max(sides.length - 1, 1);
                  const net = Math.round(side.totalValue - otherTotal);
                  if (net === 0) {
                    return (
                      <span className="text-[11px] text-[#555555] font-medium tabular-nums">
                        {side.totalValue.toLocaleString()} KTC
                      </span>
                    );
                  }
                  const color = isNearEven ? 'text-[#555555]' : net > 0 ? 'text-emerald-400' : 'text-red-400';
                  return (
                    <span className={`text-[11px] font-semibold tabular-nums ${color}`}>
                      {net > 0 ? '+' : ''}{net.toLocaleString()} KTC
                    </span>
                  );
                })()}
              </div>

              {/* Assets */}
              <div style={{ borderLeft: `3px solid ${isWinner ? '#10b981' : '#222222'}` }}>
                {side.players.map((p) => (
                  <AssetRow
                    key={p.id}
                    playerId={p.id}
                    name={p.name}
                    position={p.position}
                    team={p.team}
                    value={p.value}
                    className={`border-t border-[#111111] ${isCompact ? 'px-3' : 'px-4 sm:px-5'}`}
                  />
                ))}
                {side.picks.map((pick, pickIdx) => (
                  <AssetRow
                    key={pickIdx}
                    name={`${pick.season} Round ${pick.round}`}
                    position="PICK"
                    value={pick.value}
                    className={`border-t border-[#111111] ${isCompact ? 'px-3' : 'px-4 sm:px-5'}`}
                  />
                ))}
                {side.players.length === 0 && side.picks.length === 0 && (
                  <div className={`flex items-center gap-2.5 py-2 border-t border-[#111111] ${isCompact ? 'px-3' : 'px-4 sm:px-5'}`}>
                    <div className="w-8 h-8 rounded-full bg-[#111111] shrink-0" />
                    <p className="text-[13px] font-medium text-[#555555]">Zip, nothing, nada.</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
