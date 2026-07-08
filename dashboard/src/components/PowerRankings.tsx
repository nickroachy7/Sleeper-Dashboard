import { ChevronDown, ChevronUp, Crown } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from './PageHeader';

interface RankedTeam {
  rosterId: number;
  teamName: string;
  totalValue: number;
  topPlayer: { name: string; value: number; position: string; playerId: string } | null;
  wins: number;
  losses: number;
  rank: number;
  avatarUrl?: string | null;
}

interface PowerRankingsProps {
  rankings: RankedTeam[];
}

interface Tier {
  label: string;
  color: string;
}

function getTiers(total: number): { startIdx: number; endIdx: number; tier: Tier }[] {
  const contenderEnd = Math.max(1, Math.floor(total * 0.25));
  const playoffEnd = Math.max(contenderEnd + 1, Math.floor(total * 0.5));
  const midEnd = Math.max(playoffEnd + 1, Math.floor(total * 0.75));

  return [
    { startIdx: 0, endIdx: contenderEnd, tier: { label: 'Stacked', color: '#f59e0b' } },
    { startIdx: contenderEnd, endIdx: playoffEnd, tier: { label: 'Solid', color: '#3b82f6' } },
    { startIdx: playoffEnd, endIdx: midEnd, tier: { label: 'Middling', color: '#8b8b95' } },
    { startIdx: midEnd, endIdx: total, tier: { label: 'Pain', color: '#ef4444' } },
  ];
}

const rankMedalColors: Record<number, string> = {
  1: '#ffd700',
  2: '#c0c0c0',
  3: '#cd7f32',
};

export function PowerRankings({ rankings }: PowerRankingsProps) {
  const [showAll, setShowAll] = useState(false);

  if (rankings.length === 0) return null;

  const tiers = getTiers(rankings.length);
  const displayCount = showAll ? rankings.length : 7;
  const displayed = rankings.slice(0, displayCount);

  // Normalize bar widths against the full field so the spread reads dramatically:
  // last place still gets a visible stub, first place fills the track.
  const maxValue = rankings[0].totalValue;
  const minValue = rankings[rankings.length - 1].totalValue;
  const span = Math.max(maxValue - minValue, 1);
  const barWidth = (value: number) => 18 + ((value - minValue) / span) * 82;

  const getTierForIndex = (idx: number) => tiers.find(t => idx >= t.startIdx && idx < t.endIdx);

  return (
    <section>
      <PageHeader
        sectionLabel="Power Rankings"
        title="Dynasty Rankings"
        subtitle="Weighted roster strength — starters valued most"
      />

      <div className="bg-[#141419] rounded-2xl overflow-hidden border border-[#22222b]">
        {displayed.map((team, idx) => {
          const medal = rankMedalColors[team.rank];
          const tierInfo = getTierForIndex(idx);
          const prevTierInfo = idx > 0 ? getTierForIndex(idx - 1) : null;
          const showTierHeader = tierInfo && (!prevTierInfo || tierInfo.tier.label !== prevTierInfo.tier.label);
          const tierColor = tierInfo?.tier.color ?? '#8b8b95';

          return (
            <div key={team.rosterId}>
              {/* Tier header */}
              {showTierHeader && (
                <div className="flex items-center gap-2 px-4 pt-4 pb-2">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: tierColor }} />
                  <span className="text-[11px] font-bold uppercase tracking-[0.15em]" style={{ color: tierColor }}>
                    {tierInfo.tier.label}
                  </span>
                  <span className="h-px flex-1 bg-[#22222b]" />
                </div>
              )}

              {/* Team row */}
              <Link
                to={`/teams/${team.rosterId}`}
                className="group flex items-center gap-3 px-4 py-2.5 hover:bg-[#1b1b22] active:bg-[#22222b] transition-colors"
              >
                {/* Rank */}
                <div className="w-6 shrink-0 flex items-center justify-center">
                  {medal ? (
                    <span
                      className="font-display text-[15px] font-bold tabular-nums leading-none"
                      style={{ color: medal }}
                    >
                      {team.rank}
                    </span>
                  ) : (
                    <span className="font-display text-[15px] font-bold tabular-nums leading-none text-[#60606a]">
                      {team.rank}
                    </span>
                  )}
                </div>

                {/* Avatar */}
                <div
                  className="relative w-10 h-10 rounded-full overflow-hidden bg-[#22222b] shrink-0 ring-1 ring-inset ring-white/5"
                >
                  {team.avatarUrl ? (
                    <img
                      src={team.avatarUrl}
                      alt=""
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center text-[13px] font-bold text-[#60606a]">
                      {team.teamName.charAt(0).toUpperCase()}
                    </span>
                  )}
                  {team.rank === 1 && (
                    <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#ffd700] flex items-center justify-center ring-2 ring-[#141419]">
                      <Crown className="h-2.5 w-2.5 text-black" />
                    </span>
                  )}
                </div>

                {/* Name + meta + bar */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-[13px] font-semibold text-white truncate group-hover:text-accent-400 transition-colors">{team.teamName}</p>
                    <span className="font-display text-[13px] font-bold text-white tabular-nums shrink-0">
                      {team.totalValue.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {/* Value bar */}
                    <div className="flex-1 h-1.5 rounded-full bg-[#22222b] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${barWidth(team.totalValue)}%`, backgroundColor: tierColor }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 text-[11px] text-[#75757f]">
                    {(team.wins > 0 || team.losses > 0) && (
                      <>
                        <span className="tabular-nums font-medium text-[#9c9ca7]">{team.wins}-{team.losses}</span>
                        {team.topPlayer && <span className="text-[#4c4c56]">·</span>}
                      </>
                    )}
                    {team.topPlayer && (
                      <span className="truncate">
                        <span className="text-[#4c4c56]">Best: </span>{team.topPlayer.name}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            </div>
          );
        })}

        {/* Show All / Show Less toggle */}
        {rankings.length > 7 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="w-full py-3 text-xs font-semibold text-[#75757f] hover:text-[#d6d6de] hover:bg-[#1b1b22] transition-colors flex items-center justify-center gap-1.5 border-t border-[#22222b]"
          >
            {showAll ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {showAll ? 'Show Less' : `Show All ${rankings.length} Teams`}
          </button>
        )}
      </div>
    </section>
  );
}
