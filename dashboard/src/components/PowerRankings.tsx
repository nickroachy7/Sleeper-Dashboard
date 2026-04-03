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
  avatarUrl?: string | null;
}

interface PowerRankingsProps {
  rankings: RankedTeam[];
}

interface Tier {
  label: string;
  color: string;
  border: string;
}

function getTiers(total: number): { startIdx: number; endIdx: number; tier: Tier }[] {
  const contenderEnd = Math.max(1, Math.floor(total * 0.25));
  const playoffEnd = Math.max(contenderEnd + 1, Math.floor(total * 0.5));
  const midEnd = Math.max(playoffEnd + 1, Math.floor(total * 0.75));

  return [
    {
      startIdx: 0,
      endIdx: contenderEnd,
      tier: { label: 'Stacked', color: 'text-[#888888]', border: '#f59e0b' },
    },
    {
      startIdx: contenderEnd,
      endIdx: playoffEnd,
      tier: { label: 'Solid', color: 'text-[#888888]', border: '#3b82f6' },
    },
    {
      startIdx: playoffEnd,
      endIdx: midEnd,
      tier: { label: 'Meh', color: 'text-[#888888]', border: '#555555' },
    },
    {
      startIdx: midEnd,
      endIdx: total,
      tier: { label: 'Pain', color: 'text-[#888888]', border: '#ef4444' },
    },
  ];
}

const rankAccentColors: Record<number, string> = {
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

  const getTierForIndex = (idx: number) => {
    return tiers.find(t => idx >= t.startIdx && idx < t.endIdx);
  };

  return (
    <section>
      <PageHeader
        sectionLabel="Power Rankings"
        title="Dynasty Rankings"
        subtitle="Teams ranked by total KTC roster value"
      />

      <div className="bg-[#0a0a0a] rounded-xl overflow-hidden border border-[#161616]">
        {displayed.map((team, idx) => {
          const accentColor = rankAccentColors[team.rank];
          const tierInfo = getTierForIndex(idx);
          const prevTierInfo = idx > 0 ? getTierForIndex(idx - 1) : null;
          const showTierHeader = tierInfo && (!prevTierInfo || tierInfo.tier.label !== prevTierInfo.tier.label);

          return (
            <div key={team.rosterId}>
              {/* Tier header */}
              {showTierHeader && (
                <div
                  className="px-4 py-2.5 bg-[#0d0d0d] border-b border-[#111111]"
                  style={{ borderLeft: `3px solid ${tierInfo.tier.border}` }}
                >
                  <span className="text-xs font-bold text-[#888888]">
                    Tier {tiers.indexOf(tierInfo) + 1}
                  </span>
                  <span className="text-xs text-[#555555] ml-2">
                    — {tierInfo.tier.label}
                  </span>
                </div>
              )}

              {/* Team row — matches ValueWatch sizing */}
              <div
                className={`flex items-center gap-2.5 px-3 py-2 hover:bg-[#0d0d0d] transition-colors ${idx % 2 === 1 ? 'bg-[#070707]' : ''}`}
              >
                {/* Rank */}
                <span
                  className="text-[11px] font-bold tabular-nums w-5 text-right shrink-0"
                  style={{ color: accentColor || '#555555' }}
                >
                  {team.rank}
                </span>

                {/* Avatar */}
                <div className="w-7 h-7 rounded-full overflow-hidden bg-[#111111] shrink-0">
                  {team.avatarUrl ? (
                    <img
                      src={team.avatarUrl}
                      alt=""
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : null}
                </div>

                {/* Name + Value */}
                <div className="flex-1 min-w-0 flex items-center justify-between">
                  <p className="text-[12px] font-semibold text-white truncate">{team.teamName}</p>
                  <span className="text-[12px] font-bold text-white tabular-nums ml-2 shrink-0">
                    {team.totalValue.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          );
        })}

        {/* Show All / Show Less toggle */}
        {rankings.length > 7 && (
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
