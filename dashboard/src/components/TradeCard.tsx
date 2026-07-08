import { Clock, Users } from 'lucide-react';
import { PlayerRow } from './PlayerRow';
import { useLeagueDirectory } from '../hooks/detail';
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

const FAIRNESS_TEXT: Record<Fairness, string> = {
  fair: 'text-[#75757f]',
  slight: 'text-[#75757f]',
  unfair: 'text-amber-400/90',
  lopsided: 'text-red-400/90',
};
const FAIRNESS_LABEL: Record<Fairness, string> = {
  fair: 'Even', slight: 'Slightly uneven', unfair: 'Uneven', lopsided: 'Lopsided',
};

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
  const even = !hasZeroSide && (fairness === 'fair' || isActuallyEven || diff < nearEvenThreshold);

  const rowTo = linkPlayers ? undefined : null; // null = don't render an inner link (card is already a link)

  return (
    <div className="bg-[#141419] rounded-2xl overflow-hidden border border-[#22222b] card-hover">
      {/* Header */}
      {showHeader && (
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-2 text-[11px] text-[#75757f]">
            <span className="px-1.5 py-0.5 bg-[#22222b] text-[#9c9ca7] text-[9px] font-bold tracking-[1px] rounded">TRADE</span>
            {date && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{date}</span>}
          </div>
          {fairness && (
            <span className={`text-[11px] font-medium ${FAIRNESS_TEXT[fairness]}`}>{FAIRNESS_LABEL[fairness]}</span>
          )}
        </div>
      )}

      {/* Each team's haul, stacked — flat, no nested boxes */}
      {sides.map((side, idx) => {
        const isWinner = actualWinnerIdx === idx && !even;
        const sideVal = side.adjustedValue ?? side.totalValue;
        const otherAvg = sides.filter((_, i) => i !== idx).reduce((s, o) => s + (o.adjustedValue ?? o.totalValue), 0) / Math.max(sides.length - 1, 1);
        const margin = Math.round(sideVal - otherAvg);
        const avatar = avatarUrl(side.rosterId);

        return (
          <div key={idx} className="border-t border-[#1b1b22]">
            {/* Team header */}
            <div className="flex items-center gap-2.5 px-4 pt-3 pb-1">
              {avatar ? (
                <img src={avatar} alt="" className="w-7 h-7 rounded-full bg-[#22222b] shrink-0 ring-1 ring-inset ring-white/10 object-cover" onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
              ) : (
                <div className="w-7 h-7 rounded-full bg-[#22222b] shrink-0 ring-1 ring-inset ring-white/10 flex items-center justify-center">
                  <Users className="h-3.5 w-3.5 text-[#60606a]" />
                </div>
              )}
              <span className="font-display text-sm font-bold text-white truncate flex-1 min-w-0">{side.teamName}</span>
              <span className="font-display text-sm font-bold text-white tabular-nums shrink-0">{sideVal.toLocaleString()}</span>
              {isWinner && (
                <span className="text-[11px] font-bold text-accent-400 tabular-nums shrink-0">+{margin.toLocaleString()}</span>
              )}
            </div>

            {/* Assets */}
            <div className="pb-1.5">
              {side.players.map((p) => (
                <PlayerRow
                  key={p.id}
                  playerId={p.id}
                  name={p.name}
                  position={p.position}
                  team={p.team}
                  value={p.value}
                  to={rowTo}
                />
              ))}
              {side.picks.map((pick, i) => (
                <PlayerRow
                  key={`pk-${i}`}
                  playerId={pick.playerId}
                  name={pick.name || `${pick.season} Round ${pick.round}`}
                  value={pick.value}
                  meta={pick.subtitle}
                  to={pick.playerId ? rowTo : null}
                />
              ))}
              {side.players.length === 0 && side.picks.length === 0 && (
                <p className="text-[12px] text-[#60606a] px-4 py-2">Nothing.</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
