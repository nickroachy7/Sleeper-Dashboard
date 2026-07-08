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
  const hasZeroSide = sides.some((s) => (s.adjustedValue ?? s.totalValue) === 0);
  // Scale the near-even threshold with trade size (same rule as TradeEvaluator).
  const nearEvenThreshold = Math.max(300, Math.round(Math.max(val0, val1) * 0.03));
  const isNearEven = !hasZeroSide && (fairness === 'fair' || isActuallyEven || diff < nearEvenThreshold);

  const isCompact = variant === 'compact';
  const px = isCompact ? 'px-3' : 'px-4 sm:px-5';

  return (
    <div className="bg-[#141419] rounded-2xl overflow-hidden border border-[#22222b] card-hover">
      {/* Header */}
      {showHeader && (
        <div className={`flex items-center justify-between ${px} py-3 border-b border-[#1b1b22]`}>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-white text-black text-[10px] font-extrabold tracking-[1px] rounded">
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
            <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${FAIRNESS_CONFIG[fairness].badge}`}>
              {FAIRNESS_CONFIG[fairness].label}
            </span>
          )}
        </div>
      )}

      {/* Trade sides — each team's haul, stacked */}
      {sides.map((side, idx) => {
        const isWinner = actualWinnerIdx === idx && !isActuallyEven && !isNearEven;
        const assetCount = side.players.length + side.picks.length;
        const sideVal = side.adjustedValue ?? side.totalValue;
        const otherAvg = sides.filter((_, i) => i !== idx).reduce((sum, s) => sum + (s.adjustedValue ?? s.totalValue), 0) / Math.max(sides.length - 1, 1);
        const net = Math.round(sideVal - otherAvg);

        return (
          <div key={idx} style={{ borderLeft: `3px solid ${isWinner ? '#22c55e' : 'transparent'}` }}>
            {/* Team header */}
            <div className={`flex items-center justify-between gap-2 ${px} py-2.5 bg-[#17171d] border-t border-[#1b1b22]`}>
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-display text-[13px] sm:text-sm font-bold text-white truncate">{side.teamName}</span>
                <span className="text-[10px] text-[#60606a] shrink-0">
                  {assetCount} asset{assetCount !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[11px] text-[#75757f] font-medium tabular-nums">{sideVal.toLocaleString()}</span>
                {isNearEven || isActuallyEven ? (
                  <span className="text-[10px] font-bold text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded leading-none">Even</span>
                ) : (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded leading-none tabular-nums ${
                    net > 0 ? 'text-accent-400 bg-accent-500/10' : net < 0 ? 'text-red-400 bg-red-500/10' : 'text-[#75757f] bg-white/5'
                  }`}>
                    {net > 0 ? '+' : net < 0 ? '−' : ''}{Math.abs(net).toLocaleString()}
                  </span>
                )}
              </div>
            </div>

            {/* Assets */}
            {side.players.map((p) => {
              const row = (
                <AssetRow
                  playerId={p.id}
                  name={p.name}
                  position={p.position}
                  team={p.team}
                  value={p.value}
                  className={`border-t border-[#1b1b22] ${px}`}
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
              const pickCls = `flex items-center gap-2.5 py-2 border-t border-[#1b1b22] ${px}`;
              return linkPlayers && pick.playerId ? (
                <Link key={pickIdx} to={`/players/${pick.playerId}`} className={`${pickCls} hover:bg-[#1b1b22] active:bg-[#22222b] transition-colors`}>
                  {pickRow}
                </Link>
              ) : (
                <div key={pickIdx} className={pickCls}>{pickRow}</div>
              );
            })}

            {assetCount === 0 && (
              <div className={`flex items-center gap-2.5 py-2 border-t border-[#1b1b22] ${px}`}>
                <div className="w-8 h-8 rounded-full bg-[#1b1b22] shrink-0" />
                <p className="text-[13px] font-medium text-[#75757f]">Zip, nothing, nada.</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
