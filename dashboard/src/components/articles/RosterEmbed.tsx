import { Users } from 'lucide-react';

interface RosterPlayer {
  name: string;
  position: string;
  value: number;
}

interface RosterTeam {
  teamName: string;
  wins: number;
  losses: number;
  playerValue: number;
  pickValue: number;
  totalValue: number;
  topPlayers?: RosterPlayer[];
}

interface RosterEmbedProps {
  teams: RosterTeam[];
  title?: string;
}

const positionColors: Record<string, string> = {
  QB: 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400',
  RB: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400',
  WR: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400',
  TE: 'bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-400',
  K: 'bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-400',
  DEF: 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400',
};

export function RosterEmbed({ teams, title }: RosterEmbedProps) {
  if (!teams || teams.length === 0) return null;

  return (
    <div className="my-6 rounded-xl border border-slate-200 dark:border-zinc-700 overflow-hidden bg-white dark:bg-zinc-900">
      {/* Header */}
      <div className="px-4 py-3 bg-slate-50 dark:bg-zinc-800 border-b border-slate-200 dark:border-zinc-700 flex items-center gap-2">
        <Users className="h-4 w-4 text-emerald-500" />
        <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
          {title || 'Team Breakdown'}
        </h4>
      </div>

      {/* Teams Grid */}
      <div className={`grid ${teams.length === 1 ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'} divide-y md:divide-y-0 md:divide-x divide-slate-100 dark:divide-zinc-800`}>
        {teams.map((team, idx) => (
          <div key={idx} className="p-4">
            {/* Team Header */}
            <div className="flex items-center justify-between mb-3">
              <div>
                <h5 className="font-bold text-slate-900 dark:text-white">{team.teamName}</h5>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {team.wins}-{team.losses} Record
                </span>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-slate-900 dark:text-white tabular-nums">
                  {team.totalValue.toLocaleString()}
                </div>
                <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Total Value</div>
              </div>
            </div>

            {/* Value Breakdown */}
            <div className="flex gap-3 mb-4">
              <div className="flex-1 bg-slate-50 dark:bg-zinc-800/50 rounded-lg p-2.5 text-center">
                <div className="text-sm font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
                  {team.playerValue.toLocaleString()}
                </div>
                <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Players</div>
              </div>
              <div className="flex-1 bg-purple-50 dark:bg-purple-500/10 rounded-lg p-2.5 text-center">
                <div className="text-sm font-semibold text-purple-700 dark:text-purple-400 tabular-nums">
                  {team.pickValue.toLocaleString()}
                </div>
                <div className="text-[10px] uppercase tracking-wide text-purple-600 dark:text-purple-400">Picks</div>
              </div>
            </div>

            {/* Top Players */}
            {team.topPlayers && team.topPlayers.length > 0 && (
              <div>
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
                  Top Players
                </div>
                <div className="space-y-1.5">
                  {team.topPlayers.slice(0, 5).map((player, pIdx) => {
                    const posClass = positionColors[player.position] || 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-400';
                    return (
                      <div key={pIdx} className="flex items-center justify-between py-1.5 px-2 bg-slate-50 dark:bg-zinc-800/50 rounded-lg">
                        <div className="flex items-center gap-2">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${posClass}`}>
                            {player.position}
                          </span>
                          <span className="text-sm font-medium text-slate-900 dark:text-white">
                            {player.name}
                          </span>
                        </div>
                        <span className="text-sm font-semibold text-slate-600 dark:text-slate-400 tabular-nums">
                          {player.value.toLocaleString()}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
