import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PositionBadge } from './PositionBadge';

interface ValueWatchPlayer {
  playerId: string;
  name: string;
  position: string;
  team: string | null;
  value: number;
  ownerTeam: string;
  rank: number;
}

interface ValueWatchProps {
  players: ValueWatchPlayer[];
}

const rankAccentColors: Record<number, string> = {
  1: '#ffd700',
  2: '#c0c0c0',
  3: '#cd7f32',
};

export function ValueWatch({ players }: ValueWatchProps) {
  if (players.length === 0) return null;

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[11px] font-bold text-accent-500 tracking-[0.2em] uppercase mb-1">VALUE WATCH</p>
          <h2 className="font-display text-lg font-bold text-white tracking-tight">Top 10 Assets</h2>
        </div>
        <Link to="/ktc-values" className="text-[11px] text-[#9c9ca7] hover:text-accent-400 transition-colors flex items-center gap-0.5">
          Full Rankings <ChevronRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="bg-[#141419] rounded-xl overflow-hidden">
        <div className="divide-y divide-[#1b1b22]">
          {players.slice(0, 10).map((player, idx) => {
            const accentColor = rankAccentColors[player.rank];
            return (
              <div
                key={player.playerId}
                className={`flex items-center gap-2.5 px-3 py-2.5 hover:bg-[#1b1b22] transition-colors ${idx % 2 === 1 ? 'bg-[#101015]' : ''}`}
                style={accentColor ? { borderLeft: `3px solid ${accentColor}` } : undefined}
              >
                <span
                  className="text-[11px] font-bold tabular-nums w-5 text-right shrink-0"
                  style={{ color: accentColor || '#75757f' }}
                >
                  {player.rank}
                </span>

                <div className="w-7 h-7 rounded-full overflow-hidden bg-[#1b1b22] shrink-0">
                  <img
                    src={`https://sleepercdn.com/content/nfl/players/${player.playerId}.jpg`}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-white truncate">{player.name}</p>
                  <div className="flex items-center gap-1">
                    <PositionBadge position={player.position} size="xs" />
                    {player.team && <span className="text-[10px] text-[#75757f]">{player.team}</span>}
                  </div>
                </div>

                <span className="font-display text-[13px] font-bold text-white tabular-nums shrink-0">
                  {player.value.toLocaleString()}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
