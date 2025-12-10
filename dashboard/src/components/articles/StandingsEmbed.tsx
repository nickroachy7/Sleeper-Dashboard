import { Trophy } from 'lucide-react';

interface StandingsTeam {
  rank: number;
  teamName: string;
  wins: number;
  losses: number;
  points: number;
  playerValue: number;
  pickValue: number;
  totalValue: number;
}

interface StandingsEmbedProps {
  standings: StandingsTeam[];
  highlightTeams?: string[];
  title?: string;
}

function getRankStyles(rank: number): string {
  if (rank === 1) return 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/30';
  if (rank === 2) return 'bg-slate-100 dark:bg-slate-500/20 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-500/30';
  if (rank === 3) return 'bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-500/30';
  if (rank <= 6) return 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-100 dark:border-emerald-500/20';
  return 'bg-slate-50 dark:bg-zinc-800/50 text-slate-600 dark:text-slate-400 border-slate-100 dark:border-zinc-700';
}

export function StandingsEmbed({ standings, highlightTeams, title }: StandingsEmbedProps) {
  if (!standings || standings.length === 0) return null;

  return (
    <div className="my-6 rounded-xl border border-slate-200 dark:border-zinc-700 overflow-hidden bg-white dark:bg-zinc-900">
      {/* Header */}
      <div className="px-4 py-3 bg-slate-50 dark:bg-zinc-800 border-b border-slate-200 dark:border-zinc-700 flex items-center gap-2">
        <Trophy className="h-4 w-4 text-amber-500" />
        <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
          {title || 'Current Standings'}
        </h4>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide border-b border-slate-100 dark:border-zinc-800">
              <th className="text-left py-2 px-3 font-medium">#</th>
              <th className="text-left py-2 px-3 font-medium">Team</th>
              <th className="text-center py-2 px-3 font-medium">Record</th>
              <th className="text-right py-2 px-3 font-medium hidden sm:table-cell">Points</th>
              <th className="text-right py-2 px-3 font-medium hidden md:table-cell">Player Val</th>
              <th className="text-right py-2 px-3 font-medium hidden md:table-cell">Pick Val</th>
              <th className="text-right py-2 px-3 font-medium">Total Val</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
            {standings.map((team) => {
              const isHighlighted = highlightTeams?.includes(team.teamName);
              return (
                <tr 
                  key={team.rank} 
                  className={`${isHighlighted ? 'bg-accent-50 dark:bg-accent-500/10' : 'hover:bg-slate-50 dark:hover:bg-zinc-800/50'} transition-colors`}
                >
                  <td className="py-2.5 px-3">
                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold border ${getRankStyles(team.rank)}`}>
                      {team.rank}
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    <span className={`font-medium ${isHighlighted ? 'text-accent-600 dark:text-accent-400' : 'text-slate-900 dark:text-white'}`}>
                      {team.teamName}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <span className="font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
                      {team.wins}-{team.losses}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right hidden sm:table-cell">
                    <span className="text-slate-600 dark:text-slate-400 tabular-nums">
                      {team.points.toFixed(1)}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right hidden md:table-cell">
                    <span className="text-slate-600 dark:text-slate-400 tabular-nums">
                      {team.playerValue.toLocaleString()}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right hidden md:table-cell">
                    <span className="text-purple-600 dark:text-purple-400 tabular-nums">
                      {team.pickValue.toLocaleString()}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <span className="font-semibold text-slate-900 dark:text-white tabular-nums">
                      {team.totalValue.toLocaleString()}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
