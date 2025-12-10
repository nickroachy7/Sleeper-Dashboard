import { Trophy, Medal } from 'lucide-react';

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

export function StandingsEmbed({ standings, title }: StandingsEmbedProps) {
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

      {/* Table - matches Standings page exactly */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 dark:bg-zinc-800/50 border-b border-slate-100 dark:border-zinc-700">
              <th className="px-2 sm:px-5 py-2.5 sm:py-4 text-left text-[10px] sm:text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Rank
              </th>
              <th className="px-2 sm:px-5 py-2.5 sm:py-4 text-left text-[10px] sm:text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Team
              </th>
              <th className="px-2 sm:px-5 py-2.5 sm:py-4 text-center text-[10px] sm:text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Record
              </th>
              <th className="px-2 sm:px-5 py-2.5 sm:py-4 text-right text-[10px] sm:text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                PF
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
            {standings.map((team) => (
              <tr key={team.rank} className="hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors">
                <td className="px-2 sm:px-5 py-2 sm:py-4">
                  <div className="flex items-center gap-1 sm:gap-2">
                    {team.rank <= 3 && (
                      <Medal
                        className={`h-3 w-3 sm:h-4 sm:w-4 ${
                          team.rank === 1
                            ? 'text-amber-500'
                            : team.rank === 2
                            ? 'text-slate-400'
                            : 'text-orange-500'
                        }`}
                      />
                    )}
                    <span className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white">{team.rank}</span>
                  </div>
                </td>
                <td className="px-2 sm:px-5 py-2 sm:py-4">
                  <span className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white">{team.teamName}</span>
                </td>
                <td className="px-2 sm:px-5 py-2 sm:py-4 text-center">
                  <span className="inline-flex items-center gap-0.5 sm:gap-1 text-xs sm:text-sm font-medium">
                    <span className="text-accent-600 dark:text-accent-400">{team.wins}</span>
                    <span className="text-slate-300 dark:text-zinc-600">-</span>
                    <span className="text-red-500 dark:text-red-400">{team.losses}</span>
                  </span>
                </td>
                <td className="px-2 sm:px-5 py-2 sm:py-4 text-right text-xs sm:text-sm font-medium text-slate-900 dark:text-white tabular-nums">
                  {team.points.toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
