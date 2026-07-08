import { Clock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AssetRow } from './AssetRow';
import { FAIRNESS_CONFIG, getPlayerImageUrl } from '../lib/trade-shared';
import type { Fairness } from '../types/domain';

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
  name?: string;
  /** Secondary line, e.g. "via Team X · proj. Early". */
  subtitle?: string;
  /** If the pick has been used, the drafted player's id — shows their photo + links. */
  playerId?: string;
}

export interface TradeSide {
  teamName: string;
  players: TradePlayer[];
  picks: TradePick[];
  totalValue: number;
  adjustedValue?: number;
}

interface TradeCardProps {
  sides: TradeSide[];
  winnerId?: number | null;
  isEvenTrade?: boolean;
  date?: string;
  variant?: 'compact' | 'full';
  showHeader?: boolean;
  fairness?: Fairness;
  /** Wrap each player row in a link to its detail page (used on the trade page). */
  linkPlayers?: boolean;
}

export function TradeCard({
  sides,
  winnerId,
  isEvenTrade,
  date,
  variant = 'full',
  showHeader = true,
  fairness,
  linkPlayers = false,
}: TradeCardProps) {
  if (sides.length < 2) return null;

  // Use adjusted values when available, fall back to raw totals
  const val0 = sides[0].adjustedValue ?? sides[0].totalValue;
  const val1 = sides[1].adjustedValue ?? sides[1].totalValue;
  const diff = Math.abs(val0 - val1);
  const winnerIndex = val0 > val1 ? 0 : val1 > val0 ? 1 : null;
  const actualWinnerIdx = winnerId !== null && winnerId !== undefined ? winnerId : winnerIndex;
  const isActuallyEven = isEvenTrade ?? diff === 0;
  const hasZeroSide = sides.some(s => (s.adjustedValue ?? s.totalValue) === 0);
  // Scale the near-even threshold with trade size (same rule as TradeEvaluator):
  // 300 floor for small trades, 3% of the larger side for big packages.
  const nearEvenThreshold = Math.max(300, Math.round(Math.max(val0, val1) * 0.03));
  const isNearEven = !hasZeroSide && (fairness === 'fair' || isActuallyEven || diff < nearEvenThreshold);

  const isCompact = variant === 'compact';

  return (
    <div className="bg-[#141419] rounded-xl overflow-hidden card-hover">
      {/* Header */}
      {showHeader && (
        <div className={`flex items-center justify-between bg-white/[0.05] ${isCompact ? 'px-3 py-3' : 'px-4 sm:px-5 py-3 sm:py-4'}`}>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-white text-black text-[10px] font-extrabold tracking-[1px] rounded-sm">
              TRADE
            </span>
            {date && (
              <span className="text-[11px] text-[#75757f] flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {date}
              </span>
            )}
          </div>
          {fairness && (
            <span className={`px-2 py-0.5 text-[10px] font-bold rounded-sm ${FAIRNESS_CONFIG[fairness].badge}`}>
              {FAIRNESS_CONFIG[fairness].label}
            </span>
          )}
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
              <div className={`flex items-center justify-between border-t border-[#26262f] bg-[#1b1b22] ${isCompact ? 'px-3 py-2.5' : 'px-4 sm:px-5 py-2.5'}`}>
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
                  <span className="text-[10px] text-[#75757f]">
                    {assetCount} asset{assetCount !== 1 ? 's' : ''}
                  </span>
                </div>
                {(() => {
                  const sideVal = side.adjustedValue ?? side.totalValue;
                  const otherTotal = sides.filter((_, i) => i !== idx).reduce((sum, s) => sum + (s.adjustedValue ?? s.totalValue), 0) / Math.max(sides.length - 1, 1);
                  const net = Math.round(sideVal - otherTotal);
                  if (net === 0) {
                    return (
                      <span className="text-[11px] text-[#75757f] font-medium tabular-nums">
                        {sideVal.toLocaleString()} KTC
                      </span>
                    );
                  }
                  const color = isNearEven ? 'text-[#75757f]' : net > 0 ? 'text-emerald-400' : 'text-red-400';
                  return (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-[#60606a] font-medium tabular-nums">
                        {sideVal.toLocaleString()}
                      </span>
                      <span className={`text-[11px] font-semibold tabular-nums ${color}`}>
                        {net > 0 ? '+' : ''}{net.toLocaleString()}
                      </span>
                    </div>
                  );
                })()}
              </div>

              {/* Assets */}
              <div style={{ borderLeft: `3px solid ${isWinner ? '#10b981' : '#2e2e38'}` }}>
                {side.players.map((p) => {
                  const row = (
                    <AssetRow
                      playerId={p.id}
                      name={p.name}
                      position={p.position}
                      team={p.team}
                      value={p.value}
                      className={`border-t border-[#1b1b22] ${isCompact ? 'px-3' : 'px-4 sm:px-5'}`}
                    />
                  );
                  return linkPlayers ? (
                    <Link key={p.id} to={`/players/${p.id}`} className="block hover:bg-[#1b1b22] active:bg-[#22222b] transition-colors">
                      {row}
                    </Link>
                  ) : (
                    <div key={p.id}>{row}</div>
                  );
                })}
                {side.picks.map((pick, pickIdx) => {
                  const pickRow = (
                    <>
                      {pick.playerId ? (
                        <img
                          src={getPlayerImageUrl(pick.playerId)}
                          alt=""
                          className="w-8 h-8 rounded-full object-cover bg-[#22222b] shrink-0 ring-1 ring-inset ring-white/5"
                          onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0">
                          <span className="text-[9px] font-bold text-cyan-400/70">PK</span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-white truncate">
                          {pick.name || `${pick.season} Round ${pick.round}`}
                        </p>
                        {pick.subtitle && <p className="text-[11px] text-[#75757f] truncate mt-0.5">{pick.subtitle}</p>}
                      </div>
                      {pick.value !== undefined && (
                        <span className="font-display text-sm font-bold text-white tabular-nums shrink-0">
                          {pick.value > 0 ? pick.value.toLocaleString() : '—'}
                        </span>
                      )}
                    </>
                  );
                  const pickCls = `flex items-center gap-2.5 py-2 border-t border-[#1b1b22] ${isCompact ? 'px-3' : 'px-4 sm:px-5'}`;
                  return linkPlayers && pick.playerId ? (
                    <Link key={pickIdx} to={`/players/${pick.playerId}`} className={`${pickCls} hover:bg-[#1b1b22] active:bg-[#22222b] transition-colors`}>
                      {pickRow}
                    </Link>
                  ) : (
                    <div key={pickIdx} className={pickCls}>{pickRow}</div>
                  );
                })}
                {side.players.length === 0 && side.picks.length === 0 && (
                  <div className={`flex items-center gap-2.5 py-2 border-t border-[#1b1b22] ${isCompact ? 'px-3' : 'px-4 sm:px-5'}`}>
                    <div className="w-8 h-8 rounded-full bg-[#1b1b22] shrink-0" />
                    <p className="text-[13px] font-medium text-[#75757f]">Zip, nothing, nada.</p>
                  </div>
                )}
                {/* Value Adjustment line */}
                {(() => {
                  if (side.adjustedValue == null) return null;
                  const adj = side.adjustedValue - side.totalValue;
                  if (adj === 0) return null;
                  return (
                    <div className={`flex items-center justify-between py-2 border-t border-dashed border-[#26262f] ${isCompact ? 'px-3' : 'px-4 sm:px-5'}`}>
                      <span className="text-[11px] text-[#80808c] italic">Value Adjustment</span>
                      <span className={`text-[11px] font-semibold tabular-nums ${adj > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {adj > 0 ? '+' : ''}{adj.toLocaleString()}
                      </span>
                    </div>
                  );
                })()}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
