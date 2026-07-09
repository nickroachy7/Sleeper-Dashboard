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
  /** Accepted for compatibility but no longer rendered — the meta row is type + date only. */
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
  linkPlayers = false,
}: TradeCardProps) {
  const { data: directory } = useLeagueDirectory();
  if (sides.length < 2) return null;

  // Custom team logo (falls back to user avatar), resolved via the directory.
  const avatarUrl = (rosterId?: number): string | null =>
    rosterId == null || !directory ? null : directory.teamAvatar(rosterId);

  // Winner/verdict uses the ADJUSTED value (KTC-style stud premium), but the
  // number shown in each team header is the RAW total so it always equals the
  // player/pick rows below it.
  const val0 = sides[0].adjustedValue ?? sides[0].totalValue;
  const val1 = sides[1].adjustedValue ?? sides[1].totalValue;
  const diff = Math.abs(val0 - val1);
  const winnerIndex = val0 > val1 ? 0 : val1 > val0 ? 1 : null;
  const actualWinnerIdx = winnerId !== null && winnerId !== undefined ? winnerId : winnerIndex;
  const deadEven = isEvenTrade ?? diff === 0;

  const rowTo = linkPlayers ? undefined : null; // null = don't render an inner link (card is already a link)

  return (
    <div>
      {/* Meta sits ABOVE the card for separation — type + date only, no trailing label */}
      {showHeader && (
        <div className="flex items-center px-1.5 pb-2">
          <div className="flex items-center gap-2 text-[11px] text-[#75757f]">
            <span className="px-1.5 py-0.5 bg-[#1b1b22] text-[#9c9ca7] text-[9px] font-bold tracking-[1px] rounded">TRADE</span>
            {date && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{date}</span>}
          </div>
        </div>
      )}

      <div className="bg-[#141419] rounded-2xl overflow-hidden border border-[#22222b] card-hover">
        {sides.map((side, idx) => {
          const sideVal = side.totalValue; // raw sum of rows shown in header
          const avatar = avatarUrl(side.rosterId);
          const result: 'W' | 'L' | '=' = deadEven ? '=' : actualWinnerIdx === idx ? 'W' : 'L';

          return (
            <div key={idx}>
              {/* Team header — tinted band separates it from the player rows */}
              <div className={`flex items-center gap-2.5 px-4 py-2.5 bg-[#1b1b22] ${idx > 0 ? 'border-t border-[#22222b]' : ''}`}>
                {avatar ? (
                  <img src={avatar} alt="" className="w-7 h-7 rounded-full bg-[#22222b] shrink-0 ring-1 ring-inset ring-white/10 object-cover" onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-[#22222b] shrink-0 ring-1 ring-inset ring-white/10 flex items-center justify-center">
                    <Users className="h-3.5 w-3.5 text-[#60606a]" />
                  </div>
                )}
                <span className="font-display text-sm font-bold text-white truncate flex-1 min-w-0">{side.teamName}</span>
                <span className="font-display text-sm font-bold text-white tabular-nums shrink-0">{sideVal.toLocaleString()}</span>
                <span className={`w-5 h-5 rounded flex items-center justify-center text-[11px] font-extrabold shrink-0 ${
                  result === 'W' ? 'bg-accent-500/15 text-accent-400' : result === 'L' ? 'bg-red-500/15 text-red-400' : 'bg-white/5 text-[#75757f]'
                }`}>{result}</span>
              </div>

              {/* Assets */}
              <div className="py-1">
                {side.players.map((p) => (
                  <PlayerRow key={p.id} playerId={p.id} name={p.name} position={p.position} team={p.team} value={p.value} to={rowTo} dim />
                ))}
                {side.picks.map((pick, i) => (
                  <PlayerRow
                    key={`pk-${i}`}
                    playerId={pick.playerId}
                    name={pick.name || `${pick.season} Round ${pick.round}`}
                    value={pick.value}
                    meta={pick.subtitle}
                    to={pick.playerId ? rowTo : null}
                    dim
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
    </div>
  );
}
