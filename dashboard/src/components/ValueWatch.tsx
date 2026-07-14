import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PlayerRow } from './PlayerRow';

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

export function ValueWatch({ players }: ValueWatchProps) {
  if (players.length === 0) return null;

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[11px] font-bold text-accent-500 tracking-[0.2em] uppercase mb-1">VALUE WATCH</p>
          <h2 className="font-display text-lg font-bold text-white tracking-tight">Top 10 Assets</h2>
        </div>
        <Link to="/players" className="text-[11px] text-[#9c9ca7] hover:text-accent-400 transition-colors flex items-center gap-0.5">
          Full Rankings <ChevronRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="bg-[#141419] rounded-2xl overflow-hidden border border-[#22222b]">
        {players.slice(0, 10).map((player) => (
          <PlayerRow
            key={player.playerId}
            playerId={player.playerId}
            name={player.name}
            position={player.position}
            team={player.team}
            value={player.value}
            rank={player.rank}
            meta={player.ownerTeam}
            divided
          />
        ))}
      </div>
    </section>
  );
}
