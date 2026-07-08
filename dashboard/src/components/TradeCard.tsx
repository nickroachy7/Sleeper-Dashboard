import { Clock, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PositionBadge } from './PositionBadge';
import { useLeagueDirectory } from '../hooks/detail';
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
  /** Roster id — used to resolve the team's avatar. */
  rosterId?: number;
}

interface TradeCardProps {
  sides: TradeSide[];
  winnerId?: number | null;
  isEvenTrade?: boolean;
  date?: string;
  variant?: 'compact' | 'full';
  showHeader?: boolean;
  fairness?: Fairness;
  /** Link players/used-picks to their detail pages (used on the trade page). */
  linkPlayers?: boolean;
}

export function TradeCard({
  sides,
  winnerId,
  isEvenTrade,
  date,
  showHeader = true,
  fairness,
  linkPlayers = false,
}: TradeCardProps) {
  const { data: directory } = useLeagueDirectory();
  if (sides.length < 2) return null;

  const avatarUrl = (rosterId?: number): string | null => {
    if (rosterId == null || !directory) return null;
    const roster = directory.rosters.find((r) => r.roster_id === rosterId && r.league_id === directory.currentLeagueId)
      || directory.rosters.find((r) => r.roster_id === rosterId);
    const user = directory.users.find((u) => u.user_id === roster?.owner_id);
    return user?.avatar ? `https://sleepercdn.com/avatars/thumbs/${user.avatar}` : null;
  };

  const val0 = sides[0].adjustedValue ?? sides[0].totalValue;
  const val1 = sides[1].adjustedValue ?? sides[1].totalValue;
  const diff = Math.abs(val0 - val1);
  const winnerIndex = val0 > val1 ? 0 : val1 > val0 ? 1 : null;
  const actualWinnerIdx = winnerId !== null && winnerId !== undefined ? winnerId : winnerIndex;
  const isActuallyEven = isEvenTrade ?? diff === 0;
  const hasZeroSide = sides.some((s) => (s.adjustedValue ?? s.totalValue) === 0);
  const nearEvenThreshold = Math.max(300, Math.round(Math.max(val0, val1) * 0.03));
  const isNearEven = !hasZeroSide && (fairness === 'fair' || isActuallyEven || diff < nearEvenThreshold);
  const even = isNearEven || isActuallyEven;

  return (
    <div className="bg-[#141419] rounded-2xl overflow-hidden border border-[#22222b] card-hover">
      {/* Header */}
      {showHeader && (
        <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 border-b border-[#1b1b22]">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-white text-black text-[10px] font-extrabold tracking-[1px] rounded">TRADE</span>
            {date && (
              <span className="text-[11px] text-[#75757f] flex items-center gap-1">
                <Clock className="h-3 w-3" />{date}
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

      {/* Two-column haul comparison */}
      <div className="grid grid-cols-2 gap-2 p-2 sm:p-3">
        {sides.map((side, idx) => {
          const isWinner = actualWinnerIdx === idx && !even;
          const sideVal = side.adjustedValue ?? side.totalValue;
          const otherAvg = sides.filter((_, i) => i !== idx).reduce((s, o) => s + (o.adjustedValue ?? o.totalValue), 0) / Math.max(sides.length - 1, 1);
          const net = Math.round(sideVal - otherAvg);
          const avatar = avatarUrl(side.rosterId);

          return (
            <div
              key={idx}
              className={`rounded-xl border p-2 sm:p-2.5 flex flex-col ${
                isWinner ? 'border-accent-500/40 bg-accent-500/[0.05]' : 'border-[#22222b] bg-[#17171d]'
              }`}
            >
              {/* Team header */}
              <div className="flex items-center gap-2 min-w-0">
                {avatar ? (
                  <img src={avatar} alt="" className="w-6 h-6 rounded-full bg-[#22222b] shrink-0 ring-1 ring-inset ring-white/10 object-cover" onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-[#22222b] shrink-0 ring-1 ring-inset ring-white/10 flex items-center justify-center">
                    <Users className="h-3 w-3 text-[#60606a]" />
                  </div>
                )}
                <span className="font-display text-[12px] sm:text-[13px] font-bold text-white truncate">{side.teamName}</span>
              </div>

              {/* Total + net */}
              <div className="flex items-center justify-between mt-1.5 pb-2 border-b border-[#22222b]">
                <span className="font-display text-[15px] font-bold text-white tabular-nums">{sideVal.toLocaleString()}</span>
                {even ? (
                  <span className="text-[9px] font-bold text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded leading-none">EVEN</span>
                ) : (
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded leading-none tabular-nums ${
                    net > 0 ? 'text-accent-400 bg-accent-500/10' : 'text-red-400 bg-red-500/10'
                  }`}>
                    {net > 0 ? '+' : '−'}{Math.abs(net).toLocaleString()}
                  </span>
                )}
              </div>

              {/* Assets */}
              <div className="mt-1.5 space-y-0.5">
                {side.players.map((p) => (
                  <AssetChip
                    key={p.id}
                    img={getPlayerImageUrl(p.id)}
                    name={p.name}
                    value={p.value}
                    position={p.position}
                    team={p.team}
                    to={linkPlayers ? `/players/${p.id}` : undefined}
                  />
                ))}
                {side.picks.map((pick, i) => (
                  <AssetChip
                    key={`pk-${i}`}
                    img={pick.playerId ? getPlayerImageUrl(pick.playerId) : null}
                    name={pick.name || `${pick.season} Round ${pick.round}`}
                    value={pick.value}
                    subtitle={pick.subtitle}
                    to={linkPlayers && pick.playerId ? `/players/${pick.playerId}` : undefined}
                  />
                ))}
                {side.players.length === 0 && side.picks.length === 0 && (
                  <p className="text-[11px] text-[#60606a] py-1.5">Nothing.</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface AssetChipProps {
  img: string | null;
  name: string;
  value?: number;
  position?: string;
  team?: string | null;
  subtitle?: string;
  to?: string;
}

function AssetChip({ img, name, value, position, team, subtitle, to }: AssetChipProps) {
  // Abbreviate player first names ("Drake Maye" → "D. Maye") to read cleanly in
  // the narrow columns; leave pick labels ("2028 Round 2") intact.
  const parts = name.trim().split(/\s+/);
  const displayName = position && parts.length >= 2 ? `${parts[0][0]}. ${parts.slice(1).join(' ')}` : name;
  const inner = (
    <>
      {img ? (
        <img src={img} alt="" className="w-7 h-7 rounded-full object-cover bg-[#22222b] shrink-0 ring-1 ring-inset ring-white/5" onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
      ) : (
        <div className="w-7 h-7 rounded-full bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0">
          <span className="text-[8px] font-bold text-cyan-400/70">PK</span>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-1">
          <span className="text-[12px] font-semibold text-white truncate">{displayName}</span>
          {value !== undefined && (
            <span className="text-[11px] font-medium text-[#9c9ca7] tabular-nums shrink-0">
              {value > 0 ? value.toLocaleString() : '—'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 mt-0.5 min-w-0">
          {position && <PositionBadge position={position} size="xs" />}
          {team && <span className="text-[10px] text-[#60606a] truncate">{team}</span>}
          {subtitle && <span className="text-[10px] text-[#60606a] truncate">{subtitle}</span>}
        </div>
      </div>
    </>
  );
  const cls = 'flex items-center gap-2 rounded-lg px-1 py-1';
  return to ? (
    <Link to={to} className={`${cls} hover:bg-white/5 active:bg-white/10 transition-colors`}>{inner}</Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}
