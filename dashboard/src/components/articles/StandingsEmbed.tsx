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

      {/* Card-based layout */}
      <div className="divide-y divide-slate-100 dark:divide-zinc-800">
        {standings.map((team) => {
          const isHighlighted = highlightTeams?.includes(team.teamName);
          return (
            <div 
              key={team.rank} 
              className={`px-4 py-4 ${isHighlighted ? 'bg-accent-50 dark:bg-accent-500/10' : ''}`}
            >
              {/* Top row: Rank, Team, Record */}
              <div className="flex items-center gap-3">
                <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold border flex-shrink-0 ${getRankStyles(team.rank)}`}>
                  {team.rank}
                </span>
                <span className={`font-semibold text-base flex-1 ${isHighlighted ? 'text-accent-600 dark:text-accent-400' : 'text-slate-900 dark:text-white'}`}>
                  {team.teamName}
                </span>
                <span className="font-bold text-base text-slate-700 dark:text-slate-300 tabular-nums">
                  {team.wins}-{team.losses}
                </span>
              </div>
              
              {/* Bottom row: Values - with more spacing */}
              <div className="flex items-center gap-4 mt-2 ml-11 text-sm">
                <div>
                  <span className="text-slate-400 dark:text-slate-500">Players: </span>
                  <span className="font-medium text-slate-600 dark:text-slate-300 tabular-nums">
                    {(team.playerValue / 1000).toFixed(0)}k
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 dark:text-slate-500">Picks: </span>
                  <span className="font-medium text-purple-600 dark:text-purple-400 tabular-nums">
                    {(team.pickValue / 1000).toFixed(0)}k
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 dark:text-slate-500">Total: </span>
                  <span className="font-semibold text-slate-900 dark:text-white tabular-nums">
                    {(team.totalValue / 1000).toFixed(0)}k
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
