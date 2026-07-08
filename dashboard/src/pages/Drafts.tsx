import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import {
  FileText,
  ArrowRightLeft,
  ChevronRight,
  History,
  Calendar,
  CircleDot,
  MinusCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  Info,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useMemo } from 'react';
import { PageHeader } from '../components/PageHeader';
import { PlayerRow } from '../components/PlayerRow';
import type { DraftPickRow } from '../types/domain';

interface Player {
  player_id: string;
  full_name: string;
  position: string;
  team: string | null;
}

interface LeagueUser {
  user_id: string;
  team_name: string | null;
  display_name: string | null;
}

interface TradedPick {
  season: string;
  round: number;
  roster_id: number;
  owner_id: number;
  previous_owner_id: number;
  league_id: string;
}

const roundColors: Record<number, string> = {
  1: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  2: 'bg-[#22222b] text-[#9c9ca7] border-[#363641]',
  3: 'bg-orange-500/15 text-orange-400 border-orange-500/25',
  4: 'bg-stone-500/15 text-stone-400 border-stone-500/25',
};

export default function Drafts() {
  const [activeTab, setActiveTab] = useState<'history' | 'capital'>('history');
  const [selectedDraft, setSelectedDraft] = useState<string | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<string>('2026');
  const [expandedRounds, setExpandedRounds] = useState<Set<number>>(new Set([1]));
  const [showLegend, setShowLegend] = useState(false);

  const { data: players } = useQuery({
    queryKey: ['players'],
    queryFn: async () => {
      const { data } = await supabase.from('players').select('*');
      const playerMap = new Map<string, Player>();
      (data || []).forEach(p => playerMap.set(p.player_id, p as Player));
      return playerMap;
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ['drafts-data'],
    queryFn: async () => {
      const { data: drafts } = await supabase.from('drafts').select('*').order('season', { ascending: false });
      const { data: draftPicks } = await supabase.from('draft_picks').select('*').order('pick_no', { ascending: true });
      const { data: tradedPicks } = await supabase.from('traded_picks').select('*').order('season', { ascending: false });
      const { data: users } = await supabase.from('users').select('*');
      const { data: rosters } = await supabase.from('rosters').select('*');
      const { data: leagueUsers } = await supabase.from('league_users').select('user_id, team_name, display_name');
      const { data: league } = await supabase.from('leagues').select('*').order('season', { ascending: false }).limit(1);

      return {
        drafts: drafts || [], draftPicks: draftPicks || [], tradedPicks: tradedPicks || [],
        users: users || [], rosters: rosters || [], leagueUsers: leagueUsers || [],
        league: league?.[0]
      };
    },
  });

  const getPlayer = (playerId: string): Player | undefined => players?.get(playerId);

  const getTeamName = (rosterId: number, leagueId?: string) => {
    const roster = data?.rosters.find((r) => r.roster_id === rosterId && (!leagueId || r.league_id === leagueId));
    const leagueUser = data?.leagueUsers?.find((lu: LeagueUser) => lu.user_id === roster?.owner_id);
    const user = data?.users.find((u) => u.user_id === roster?.owner_id);
    return leagueUser?.team_name || leagueUser?.display_name || user?.display_name || user?.username || `Team ${rosterId}`;
  };

  const getTeamNameByUserId = (userId: string | null) => {
    if (!userId) return 'Unknown';
    const user = data?.users.find((u) => u.user_id === userId);
    return user?.display_name || user?.username || 'Unknown';
  };

  useMemo(() => {
    if (data?.drafts?.length && !selectedDraft) {
      setSelectedDraft(data.drafts[0].draft_id);
    }
  }, [data?.drafts, selectedDraft]);

  const availableSeasons = useMemo(() => {
    if (!data?.tradedPicks?.length) return ['2026', '2027', '2028'];
    const seasons = [...new Set(data.tradedPicks.map((tp: TradedPick) => tp.season))].sort();
    return seasons.length > 0 ? seasons : ['2026', '2027', '2028'];
  }, [data?.tradedPicks]);

  const picksByDraftAndRound = useMemo(() => {
    if (!data?.draftPicks) return {};
    return data.draftPicks.reduce((acc: Record<string, Record<number, DraftPickRow[]>>, pick) => {
      if (!acc[pick.draft_id]) acc[pick.draft_id] = {};
      if (!acc[pick.draft_id][pick.round]) acc[pick.draft_id][pick.round] = [];
      acc[pick.draft_id][pick.round].push(pick);
      return acc;
    }, {});
  }, [data?.draftPicks]);

  const buildPickOwnership = (season: string) => {
    const seasonPicks = (data?.tradedPicks || []).filter((tp: TradedPick) => tp.season === season);
    const rounds = [1, 2, 3, 4];
    const totalRosters = data?.league?.total_rosters || 12;

    const picksByOwner: Record<number, { round: number; originalOwner: number }[]> = {};
    for (let rosterId = 1; rosterId <= totalRosters; rosterId++) {
      picksByOwner[rosterId] = [];
    }

    for (let rosterId = 1; rosterId <= totalRosters; rosterId++) {
      for (const round of rounds) {
        const traded = seasonPicks.find((tp: TradedPick) => tp.roster_id === rosterId && tp.round === round);
        if (!traded) {
          picksByOwner[rosterId].push({ round, originalOwner: rosterId });
        }
      }
    }

    for (const tp of seasonPicks) {
      picksByOwner[tp.owner_id]?.push({ round: tp.round, originalOwner: tp.roster_id });
    }

    for (const rosterId in picksByOwner) {
      picksByOwner[rosterId].sort((a, b) => a.round - b.round || a.originalOwner - b.originalOwner);
    }

    return picksByOwner;
  };

  const picksByOwner = buildPickOwnership(selectedSeason);

  const getPickValue = (round: number): number => {
    const values: Record<number, number> = { 1: 100, 2: 50, 3: 25, 4: 10 };
    return values[round] || 5;
  };

  const calculateCapital = (picks: { round: number; originalOwner: number }[]): number => {
    return picks.reduce((sum, pick) => sum + getPickValue(pick.round), 0);
  };

  const sortedTeams = Object.entries(picksByOwner)
    .map(([rosterId, picks]) => ({
      rosterId: parseInt(rosterId),
      picks,
      totalValue: calculateCapital(picks),
      ownPicks: picks.filter(p => p.originalOwner === parseInt(rosterId)).length,
      extraPicks: picks.filter(p => p.originalOwner !== parseInt(rosterId)).length,
    }))
    .sort((a, b) => b.totalValue - a.totalValue);

  const toggleRound = (round: number) => {
    setExpandedRounds(prev => {
      const next = new Set(prev);
      if (next.has(round)) next.delete(round);
      else next.add(round);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
        <div className="space-y-4 mt-12">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-20 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (!data?.drafts?.length && !data?.tradedPicks?.length) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 bg-[#1b1b22] rounded-2xl flex items-center justify-center mb-4">
            <FileText className="h-7 w-7 text-[#75757f]" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">No Draft Data</h3>
          <p className="text-sm text-[#80808c] max-w-sm mb-6">
            Connect and sync your league to see draft history and traded picks
          </p>
          <Link
            to="/settings"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent-500 text-white text-sm font-semibold rounded-xl hover:bg-accent-400 transition-all"
          >
            Connect League
          </Link>
        </div>
      </div>
    );
  }

  const currentDraft = data.drafts.find((d) => d.draft_id === selectedDraft);
  const currentDraftPicks = selectedDraft ? picksByDraftAndRound[selectedDraft] || {} : {};
  const rounds = Object.keys(currentDraftPicks).map(Number).sort((a, b) => a - b);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
      <PageHeader
        sectionLabel="League"
        title="Drafts"
        subtitle="View draft history and future pick ownership"
        tabs={[
          { id: 'history', label: 'History', icon: History },
          { id: 'capital', label: 'Capital', icon: Calendar },
        ]}
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as 'history' | 'capital')}
      />

      {/* Draft History Tab */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          {data.drafts.length > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={selectedDraft || ''}
                onChange={(e) => { setSelectedDraft(e.target.value); setExpandedRounds(new Set([1])); }}
                className="px-3 py-2 bg-[#141419] border border-[#2a2a34] rounded-lg text-xs font-medium text-white focus:outline-none focus:ring-2 focus:ring-accent-500/50"
              >
                {data.drafts.map((draft) => (
                  <option key={draft.draft_id} value={draft.draft_id}>
                    {draft.season} {draft.type} Draft
                  </option>
                ))}
              </select>
              {currentDraft && (
                <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                  currentDraft.status === 'complete' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'
                }`}>
                  {currentDraft.status}
                </span>
              )}
            </div>
          )}

          {rounds.length > 0 ? (
            <div className="space-y-2">
              {rounds.map((round) => {
                const picks = currentDraftPicks[round] || [];
                const isExpanded = expandedRounds.has(round);

                return (
                  <div key={round} className="bg-[#141419] rounded-xl overflow-hidden">
                    <button
                      onClick={() => toggleRound(round)}
                      className="w-full px-4 py-3 flex items-center justify-between hover:bg-[#17171d] transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-accent-500/15 rounded-lg flex items-center justify-center">
                          <span className="text-sm font-bold text-accent-400">{round}</span>
                        </div>
                        <div className="text-left">
                          <h3 className="font-semibold text-sm text-white">Round {round}</h3>
                          <p className="text-[10px] text-[#75757f]">{picks.length} picks</p>
                        </div>
                      </div>
                      <ChevronRight className={`h-4 w-4 text-[#75757f] transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                    </button>

                    {isExpanded && (
                      <div className="border-t border-[#1b1b22]">
                        <div className="divide-y divide-[#17171d]">
                          {picks.map((pick) => {
                            const player = pick.player_id ? getPlayer(pick.player_id) : undefined;
                            const pickDisplay = `${round}.${String(pick.pick_no - (round - 1) * 12).padStart(2, '0')}`;

                            return (
                              <PlayerRow
                                key={pick.pick_no}
                                playerId={pick.player_id || undefined}
                                name={player?.full_name || 'Unknown'}
                                position={player?.position}
                                team={player?.team}
                                meta={getTeamNameByUserId(pick.picked_by)}
                                size="sm"
                                lead={
                                  <span className="font-mono text-xs font-bold text-[#60606a] w-8">
                                    {pickDisplay}
                                  </span>
                                }
                              />
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-[#141419] rounded-xl p-12 text-center">
              <div className="w-12 h-12 bg-[#1b1b22] rounded-xl flex items-center justify-center mx-auto mb-3">
                <FileText className="h-6 w-6 text-[#75757f]" />
              </div>
              <h3 className="text-base font-bold text-white mb-1">No Picks Yet</h3>
              <p className="text-sm text-[#75757f]">This draft hasn't started or has no recorded picks</p>
            </div>
          )}
        </div>
      )}

      {/* Future Draft Capital Tab */}
      {activeTab === 'capital' && (
        <div className="space-y-4">
          {/* Season Selector */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 flex-wrap">
              {availableSeasons.map((season: string) => (
                <button
                  key={season}
                  onClick={() => setSelectedSeason(season)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    selectedSeason === season
                      ? 'bg-purple-500/15 text-purple-400 ring-1 ring-purple-500/30'
                      : 'bg-[#1b1b22] text-[#9c9ca7] hover:bg-[#26262f]'
                  }`}
                >
                  {season}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowLegend(!showLegend)}
              className="flex items-center gap-1 text-[11px] text-[#75757f] hover:text-[#9c9ca7] transition-colors"
            >
              <Info className="h-3.5 w-3.5" />
              Legend
            </button>
          </div>

          {/* Collapsible Legend */}
          {showLegend && (
            <div className="rounded-xl p-3 bg-[#141419] flex flex-wrap gap-4 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-[#80808c]">Rounds:</span>
                {[1, 2, 3, 4].map(round => (
                  <span key={round} className={`px-2 py-0.5 rounded border text-[10px] font-medium ${roundColors[round]}`}>
                    {round === 1 ? '1st' : round === 2 ? '2nd' : round === 3 ? '3rd' : '4th'}
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 text-[11px]"><CircleDot className="h-3 w-3 text-[#9c9ca7]" /><span className="text-[#9c9ca7]">Own</span></div>
                <div className="flex items-center gap-1 text-[11px]"><ArrowRightLeft className="h-3 w-3 text-emerald-500" /><span className="text-[#9c9ca7]">Acquired</span></div>
                <div className="flex items-center gap-1 text-[11px]"><MinusCircle className="h-3 w-3 text-red-400" /><span className="text-[#9c9ca7]">Traded</span></div>
              </div>
            </div>
          )}

          {/* Teams Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {sortedTeams.map(({ rosterId, picks, totalValue, extraPicks }, index) => {
              const countByRound = [1, 2, 3, 4].map(round => picks.filter(p => p.round === round).length);

              return (
                <div
                  key={rosterId}
                  className={`bg-[#141419] rounded-xl border overflow-hidden animate-smooth hover:border-[#363641] ${
                    index === 0 ? 'border-amber-500/40 card-glow-gold' :
                    index === sortedTeams.length - 1 ? 'border-red-500/20' :
                    'border-[#2a2a34]'
                  }`}
                >
                  <div className="p-4 border-b border-[#1b1b22]">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                          index === 0 ? 'bg-amber-500/20 text-amber-400' :
                          index === 1 ? 'bg-zinc-500/20 text-zinc-300' :
                          index === 2 ? 'bg-orange-500/20 text-orange-400' :
                          'bg-[#1b1b22] text-[#75757f]'
                        }`}>
                          #{index + 1}
                        </div>
                        <div>
                          <h3 className="font-bold text-white text-sm">{getTeamName(rosterId)}</h3>
                          {/* Inline round counts */}
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {countByRound.map((count, rIdx) => (
                              <span key={rIdx} className={`text-[9px] font-bold ${
                                count === 0 ? 'text-red-400/60' : count >= 2 ? 'text-emerald-400' : 'text-[#75757f]'
                              }`}>
                                {rIdx + 1}st:{count}
                              </span>
                            ))}
                            {extraPicks > 0 && (
                              <span className="text-[9px] text-emerald-400 font-medium">+{extraPicks} acq</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-1.5">
                          {extraPicks > picks.filter(p => p.originalOwner === rosterId).length ? (
                            <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
                          ) : extraPicks < 4 - picks.filter(p => p.originalOwner === rosterId).length ? (
                            <TrendingDown className="h-3.5 w-3.5 text-red-400" />
                          ) : (
                            <Minus className="h-3.5 w-3.5 text-[#75757f]" />
                          )}
                          <span className="text-lg font-bold text-white">{totalValue}</span>
                        </div>
                      </div>
                    </div>

                    {/* Stacked bar chart */}
                    <div className="mt-2 h-1.5 bg-[#1b1b22] rounded-full overflow-hidden flex">
                      {[1, 2, 3, 4].map(round => {
                        const count = countByRound[round - 1];
                        if (count === 0) return null;
                        const colors = { 1: '#f59e0b', 2: '#9c9ca7', 3: '#f97316', 4: '#78716c' };
                        return (
                          <div
                            key={round}
                            className="h-full"
                            style={{
                              width: `${(count / picks.length) * 100}%`,
                              backgroundColor: colors[round as keyof typeof colors],
                              opacity: 0.6,
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>

                  <div className="p-3 bg-[#101015]">
                    <div className="flex flex-wrap gap-1.5">
                      {picks.length > 0 ? (
                        picks.map((pick, idx) => {
                          const isAcquired = pick.originalOwner !== rosterId;
                          return (
                            <div
                              key={idx}
                              className={`px-2 py-1 rounded-lg border text-[11px] ${roundColors[pick.round]} ${
                                isAcquired ? 'ring-1 ring-emerald-500/40' : ''
                              }`}
                            >
                              <span className={isAcquired ? 'font-bold' : 'font-medium'}>
                                {pick.round}.{String(pick.originalOwner).padStart(2, '0')}
                              </span>
                              {isAcquired && (
                                <span className="block text-[9px] opacity-60 mt-0.5">
                                  via {getTeamName(pick.originalOwner).slice(0, 10)}
                                </span>
                              )}
                            </div>
                          );
                        })
                      ) : (
                        <span className="text-xs text-[#75757f] italic">No picks</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
