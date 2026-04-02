import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from './PageHeader';

interface RankedTeam {
  rosterId: number;
  teamName: string;
  totalValue: number;
  topPlayer: { name: string; value: number; position: string; playerId: string } | null;
  wins: number;
  losses: number;
  rank: number;
}

interface PowerRankingsProps {
  rankings: RankedTeam[];
}

const rankAccents: Record<number, { border: string; glow: string; badge: string }> = {
  1: { border: 'border-amber-400/40', glow: 'card-glow-gold', badge: 'bg-amber-500/20 text-amber-400' },
  2: { border: 'border-[#c0c0c0]/30', glow: '', badge: 'bg-zinc-500/20 text-zinc-300' },
  3: { border: 'border-orange-500/30', glow: '', badge: 'bg-orange-500/20 text-orange-400' },
};

export function PowerRankings({ rankings }: PowerRankingsProps) {
  const [showAll, setShowAll] = useState(false);

  if (rankings.length === 0) return null;

  const maxTeamValue = rankings[0]?.totalValue || 1;
  const top3 = rankings.slice(0, 3);
  const rest = rankings.slice(3);
  const displayedRest = showAll ? rest : rest.slice(0, 4); // Show top 7 by default

  return (
    <section>
      <PageHeader
        sectionLabel="Power Rankings"
        title="Dynasty Rankings"
        subtitle="Teams ranked by total KTC roster value"
      />

      {/* Podium - Top 3 */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-5">
        {[top3[1], top3[0], top3[2]].map((team, idx) => {
          if (!team) return <div key={idx} />;
          const pos = idx === 1 ? 1 : idx === 0 ? 2 : 3;
          const accent = rankAccents[pos];
          const isFirst = pos === 1;

          return (
            <div
              key={team.rosterId}
              className={`bg-[#0a0a0a] border ${accent.border} rounded-xl p-3 sm:p-4 text-center ${accent.glow} ${isFirst ? 'sm:-mt-2' : 'mt-2 sm:mt-4'}`}
            >
              {/* Rank number */}
              <div className={`inline-flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-full mb-2 ${accent.badge}`}>
                <span className={`font-extrabold tabular-nums ${isFirst ? 'text-xl sm:text-2xl' : 'text-lg sm:text-xl'}`}>
                  {pos}
                </span>
              </div>

              <h3 className={`font-bold text-white truncate ${isFirst ? 'text-sm sm:text-base' : 'text-xs sm:text-sm'}`}>
                {team.teamName}
              </h3>

              <p className={`font-extrabold text-white tabular-nums mt-1 ${isFirst ? 'text-lg sm:text-xl' : 'text-sm sm:text-base'}`}>
                {team.totalValue.toLocaleString()}
              </p>

            </div>
          );
        })}
      </div>

      {/* Remaining Teams */}
      <div className="bg-[#0a0a0a] rounded-xl overflow-hidden">
        <div className="divide-y divide-[#111111]">
          {displayedRest.map((team) => (
            <div key={team.rosterId} className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#0d0d0d] transition-colors">
              <span className="text-xs font-bold text-[#444444] w-6 text-right tabular-nums shrink-0">
                {team.rank}
              </span>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[13px] font-semibold text-white truncate">{team.teamName}</span>
                  <span className="text-xs font-bold text-white tabular-nums ml-2 shrink-0">
                    {team.totalValue.toLocaleString()}
                  </span>
                </div>
                <div className="w-full h-1 bg-[#111111] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(team.totalValue / maxTeamValue) * 100}%`,
                      background: 'linear-gradient(90deg, #22c55e, rgba(34, 197, 94, 0.2))',
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Show All / Show Less toggle */}
        {rest.length > 4 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="w-full py-2.5 text-xs font-medium text-[#555555] hover:text-[#888888] hover:bg-[#0d0d0d] transition-colors flex items-center justify-center gap-1 border-t border-[#111111]"
          >
            {showAll ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {showAll ? 'Show Less' : `Show All ${rankings.length} Teams`}
          </button>
        )}
      </div>
    </section>
  );
}
