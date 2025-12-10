import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { 
  FileText, 
  Loader2, 
  ArrowRightLeft,
  ChevronDown,
  ChevronRight,
  History,
  Calendar,
  CircleDot,
  MinusCircle,
  TrendingUp,
  TrendingDown,
  Minus
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useMemo } from 'react';
import { PageHeader } from '../components/PageHeader';

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

const positionColors: Record<string, string> = {
  QB: 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400',
  RB: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400',
  WR: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400',
  TE: 'bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-400',
  K: 'bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-400',
  DEF: 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400',
};

const roundColors: Record<number, string> = {
  1: 'bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-400 border-amber-300 dark:border-amber-500/30',
  2: 'bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-zinc-600',
  3: 'bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-400 border-orange-300 dark:border-orange-500/30',
  4: 'bg-stone-100 dark:bg-stone-500/20 text-stone-600 dark:text-stone-400 border-stone-300 dark:border-stone-500/30',
};

export default function Drafts() {
  const [activeTab, setActiveTab] = useState<'history' | 'capital'>('history');
  const [selectedDraft, setSelectedDraft] = useState<string | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<string>('2026');
  const [expandedRounds, setExpandedRounds] = useState<Set<number>>(new Set([1]));

  const { data: players } = useQuery({
    queryKey: ['players'],
    queryFn: async () => {
      const { data } = await supabase.from('players').select('*');
      const playerMap = new Map<string, Player>();
      (data as Player[] || []).forEach(p => playerMap.set(p.player_id, p));
      return playerMap;
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ['drafts-data'],
    queryFn: async () => {
      const { data: drafts } = await supabase
        .from('drafts')
        .select('*')
        .order('season', { ascending: false });

      const { data: draftPicks } = await supabase
        .from('draft_picks')
        .select('*')
        .order('pick_no', { ascending: true });

      const { data: tradedPicks } = await supabase
        .from('traded_picks')
        .select('*')
        .order('season', { ascending: false });

      const { data: users } = await supabase.from('users').select('*');
      const { data: rosters } = await supabase.from('rosters').select('*');
      const { data: leagueUsers } = await supabase.from('league_users').select('user_id, team_name, display_name');
      const { data: league } = await supabase.from('leagues').select('*').limit(1);

      return { 
        drafts: drafts || [], 
        draftPicks: draftPicks || [], 
        tradedPicks: tradedPicks || [], 
        users: users || [], 
        rosters: rosters || [],
        leagueUsers: leagueUsers as LeagueUser[] || [],
        league: league?.[0]
      };
    },
  });

  const getPlayer = (playerId: string): Player | undefined => {
    return players?.get(playerId);
  };

  const getTeamName = (rosterId: number, leagueId?: string) => {
    const roster = data?.rosters.find((r: any) => 
      r.roster_id === rosterId && (!leagueId || r.league_id === leagueId)
    );
    const leagueUser = data?.leagueUsers?.find((lu: LeagueUser) => lu.user_id === roster?.owner_id);
    const user = data?.users.find((u: any) => u.user_id === roster?.owner_id);
    return leagueUser?.team_name || leagueUser?.display_name || user?.display_name || user?.username || `Team ${rosterId}`;
  };

  // Get team name from picked_by user_id (works for all historical drafts)
  const getTeamNameByUserId = (userId: string | null) => {
    if (!userId) return 'Unknown';
    const user = data?.users.find((u: any) => u.user_id === userId);
    return user?.display_name || user?.username || 'Unknown';
  };

  // Set initial selected draft when data loads
  useMemo(() => {
    if (data?.drafts?.length && !selectedDraft) {
      setSelectedDraft(data.drafts[0].draft_id);
    }
  }, [data?.drafts, selectedDraft]);

  // Get available seasons from traded picks
  const availableSeasons = useMemo(() => {
    if (!data?.tradedPicks?.length) return ['2026', '2027', '2028'];
    const seasons = [...new Set(data.tradedPicks.map((tp: TradedPick) => tp.season))].sort();
    return seasons.length > 0 ? seasons : ['2026', '2027', '2028'];
  }, [data?.tradedPicks]);

  // Group draft picks by draft and round
  const picksByDraftAndRound = useMemo(() => {
    if (!data?.draftPicks) return {};
    return data.draftPicks.reduce((acc: any, pick: any) => {
      if (!acc[pick.draft_id]) acc[pick.draft_id] = {};
      if (!acc[pick.draft_id][pick.round]) acc[pick.draft_id][pick.round] = [];
      acc[pick.draft_id][pick.round].push(pick);
      return acc;
    }, {});
  }, [data?.draftPicks]);

  // Build pick ownership for a season (Draft Capital logic)
  const buildPickOwnership = (season: string) => {
    const seasonPicks = (data?.tradedPicks || []).filter((tp: TradedPick) => tp.season === season);
    const rounds = [1, 2, 3, 4];
    const totalRosters = data?.league?.total_rosters || 12;
    
    // Build a map of who owns what picks
    const picksByOwner: Record<number, { round: number; originalOwner: number }[]> = {};
    for (let rosterId = 1; rosterId <= totalRosters; rosterId++) {
      picksByOwner[rosterId] = [];
    }

    // Add picks each team still owns (their own)
    for (let rosterId = 1; rosterId <= totalRosters; rosterId++) {
      for (const round of rounds) {
        const traded = seasonPicks.find(
          (tp: TradedPick) => tp.roster_id === rosterId && tp.round === round
        );
        if (!traded) {
          picksByOwner[rosterId].push({ round, originalOwner: rosterId });
        }
      }
    }

    // Add traded picks to their new owners
    for (const tp of seasonPicks) {
      picksByOwner[tp.owner_id]?.push({ round: tp.round, originalOwner: tp.roster_id });
    }

    // Sort picks by round then by original owner
    for (const rosterId in picksByOwner) {
      picksByOwner[rosterId].sort((a, b) => a.round - b.round || a.originalOwner - b.originalOwner);
    }

    return picksByOwner;
  };

  const picksByOwner = buildPickOwnership(selectedSeason);

  // Calculate pick value (rough estimate based on round)
  const getPickValue = (round: number): number => {
    const values: Record<number, number> = { 1: 100, 2: 50, 3: 25, 4: 10 };
    return values[round] || 5;
  };

  // Calculate total capital for each team
  const calculateCapital = (picks: { round: number; originalOwner: number }[]): number => {
    return picks.reduce((sum, pick) => sum + getPickValue(pick.round), 0);
  };

  // Sort teams by total draft capital
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
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <Loader2 className="h-8 w-8 sm:h-10 sm:w-10 animate-spin text-accent-500 mx-auto" />
            <p className="mt-4 text-slate-500 dark:text-slate-400 text-xs sm:text-sm">Loading drafts...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!data?.drafts?.length && !data?.tradedPicks?.length) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-12 h-12 sm:w-16 sm:h-16 bg-slate-100 dark:bg-zinc-800 rounded-2xl flex items-center justify-center mb-4">
            <FileText className="h-6 w-6 sm:h-8 sm:w-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">No Draft Data</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mb-6">
            Connect and sync your league to see draft history and traded picks
          </p>
          <Link
            to="/setup"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-accent-600 text-white text-sm font-medium rounded-lg hover:bg-accent-700 transition-colors"
          >
            Connect League
          </Link>
        </div>
      </div>
    );
  }

  const currentDraft = data.drafts.find((d: any) => d.draft_id === selectedDraft);
  const currentDraftPicks = selectedDraft ? picksByDraftAndRound[selectedDraft] || {} : {};
  const rounds = Object.keys(currentDraftPicks).map(Number).sort((a, b) => a - b);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <PageHeader title="Drafts" backTo="/league" />
      <p className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm -mt-3 mb-4 sm:mb-6">
        View draft history and future pick ownership
      </p>

      {/* Tab Navigation */}
      <div className="mb-4 sm:mb-6 flex gap-1 p-1 bg-slate-100 dark:bg-zinc-800 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
            activeTab === 'history'
              ? 'bg-white dark:bg-zinc-900 text-slate-900 dark:text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <History className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          <span className="hidden sm:inline">Draft </span>History
        </button>
        <button
          onClick={() => setActiveTab('capital')}
          className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
            activeTab === 'capital'
              ? 'bg-white dark:bg-zinc-900 text-slate-900 dark:text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          <span className="hidden sm:inline">Future </span>Capital
        </button>
      </div>

      {/* Draft History Tab */}
      {activeTab === 'history' && (
        <div className="space-y-6">
          {/* Draft Selector */}
          {data.drafts.length > 0 && (
            <div className="flex items-center gap-4">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Select Draft:</label>
              <div className="relative">
                <select
                  value={selectedDraft || ''}
                  onChange={(e) => {
                    setSelectedDraft(e.target.value);
                    setExpandedRounds(new Set([1]));
                  }}
                  className="appearance-none px-4 py-2 pr-10 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg text-sm font-medium text-slate-900 dark:text-white focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
                >
                  {data.drafts.map((draft: any) => (
                    <option key={draft.draft_id} value={draft.draft_id}>
                      {draft.season} {draft.type} Draft
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              </div>
              {currentDraft && (
                <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${
                  currentDraft.status === 'complete' 
                    ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400' 
                    : 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400'
                }`}>
                  {currentDraft.status}
                </span>
              )}
            </div>
          )}

          {/* Draft Rounds */}
          {rounds.length > 0 ? (
            <div className="space-y-4">
              {rounds.map((round) => {
                const picks = currentDraftPicks[round] || [];
                const isExpanded = expandedRounds.has(round);

                return (
                  <div 
                    key={round}
                    className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 shadow-sm dark:shadow-none overflow-hidden"
                  >
                    <button
                      onClick={() => toggleRound(round)}
                      className="w-full px-3 sm:px-6 py-3 sm:py-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors"
                    >
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div className="w-8 h-8 sm:w-10 sm:h-10 bg-indigo-100 dark:bg-indigo-500/20 rounded-lg flex items-center justify-center">
                          <span className="text-base sm:text-lg font-bold text-indigo-600 dark:text-indigo-400">{round}</span>
                        </div>
                        <div className="text-left">
                          <h3 className="font-semibold text-sm sm:text-base text-slate-900 dark:text-white">Round {round}</h3>
                          <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400">{picks.length} picks</p>
                        </div>
                      </div>
                      <ChevronRight className={`h-4 w-4 sm:h-5 sm:w-5 text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                    </button>

                    {isExpanded && (
                      <div className="border-t border-slate-100 dark:border-zinc-800">
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead>
                              <tr className="bg-slate-50 dark:bg-zinc-800/50">
                                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Pick</th>
                                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Player</th>
                                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Pos</th>
                                <th className="hidden sm:table-cell px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">NFL Team</th>
                                <th className="hidden sm:table-cell px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Drafted By</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                              {picks.map((pick: any) => {
                                const player = getPlayer(pick.player_id);
                                const posClass = player ? positionColors[player.position] : '';
                                const pickDisplay = `${round}.${String(pick.pick_no - (round - 1) * 12).padStart(2, '0')}`;

                                return (
                                  <tr key={pick.pick_no} className="hover:bg-slate-50 dark:hover:bg-zinc-800/30">
                                    <td className="px-2 sm:px-4 py-2 sm:py-3">
                                      <span className="font-mono text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300">
                                        {pickDisplay}
                                      </span>
                                    </td>
                                    <td className="px-2 sm:px-4 py-2 sm:py-3">
                                      <span className="font-medium text-xs sm:text-sm text-slate-900 dark:text-white">
                                        {player?.full_name || 'Unknown'}
                                      </span>
                                    </td>
                                    <td className="px-2 sm:px-4 py-2 sm:py-3">
                                      {player?.position && (
                                        <span className={`px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-xs font-bold ${posClass}`}>
                                          {player.position}
                                        </span>
                                      )}
                                    </td>
                                    <td className="hidden sm:table-cell px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                                      {player?.team || '—'}
                                    </td>
                                    <td className="hidden sm:table-cell px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300">
                                      {getTeamNameByUserId(pick.picked_by)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-12 text-center">
              <div className="w-12 h-12 bg-slate-100 dark:bg-zinc-800 rounded-xl flex items-center justify-center mx-auto mb-4">
                <FileText className="h-6 w-6 text-slate-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">No Picks Yet</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                This draft hasn't started or has no recorded picks
              </p>
            </div>
          )}
        </div>
      )}

      {/* Future Draft Capital Tab */}
      {activeTab === 'capital' && (
        <div className="space-y-6">
          {/* Season Selector */}
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            {availableSeasons.map((season: string) => (
              <button
                key={season}
                onClick={() => setSelectedSeason(season)}
                className={`px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                  selectedSeason === season
                    ? 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400 ring-2 ring-purple-200 dark:ring-purple-500/30'
                    : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-zinc-700'
                }`}
              >
                {season}
              </button>
            ))}
          </div>

          {/* Legend */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-4 sm:p-5 shadow-sm dark:shadow-none">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3 sm:mb-4">Legend</h3>
            <div className="flex flex-wrap gap-4 sm:gap-6">
              {/* Round Colors */}
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Rounds:</span>
                {[1, 2, 3, 4].map(round => (
                  <span key={round} className={`px-2 sm:px-2.5 py-1 rounded-lg border text-xs font-medium ${roundColors[round]}`}>
                    {round === 1 ? '1st' : round === 2 ? '2nd' : round === 3 ? '3rd' : '4th'}
                  </span>
                ))}
              </div>
              
              {/* Status Indicators */}
              <div className="flex items-center gap-1 h-5 sm:border-l border-slate-200 dark:border-zinc-700 sm:pl-6">
                <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                  <div className="flex items-center gap-1.5 text-xs">
                    <CircleDot className="h-3.5 w-3.5 text-slate-400" />
                    <span className="text-slate-600 dark:text-slate-400">Own Pick</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <ArrowRightLeft className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="text-slate-600 dark:text-slate-400">Acquired</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <MinusCircle className="h-3.5 w-3.5 text-red-400" />
                    <span className="text-slate-600 dark:text-slate-400">Traded Away</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Teams Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {sortedTeams.map(({ rosterId, picks, totalValue, extraPicks }, index) => (
              <div
                key={rosterId}
                className={`bg-white dark:bg-zinc-900 rounded-xl border shadow-sm dark:shadow-none overflow-hidden ${
                  index === 0 ? 'border-amber-300 dark:border-amber-500/50 ring-2 ring-amber-100 dark:ring-amber-500/20' :
                  index === sortedTeams.length - 1 ? 'border-red-200 dark:border-red-500/30' :
                  'border-slate-200 dark:border-zinc-800'
                }`}
              >
                <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-zinc-800">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center text-sm font-bold ${
                        index === 0 ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400' :
                        index === 1 ? 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-400' :
                        index === 2 ? 'bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400' :
                        'bg-slate-50 dark:bg-zinc-800 text-slate-500 dark:text-slate-400'
                      }`}>
                        #{index + 1}
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base">{getTeamName(rosterId)}</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {picks.length} picks total
                          {extraPicks > 0 && (
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium ml-1">(+{extraPicks} acquired)</span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1.5">
                        {extraPicks > picks.filter(p => p.originalOwner === rosterId).length ? (
                          <TrendingUp className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />
                        ) : extraPicks < 4 - picks.filter(p => p.originalOwner === rosterId).length ? (
                          <TrendingDown className="h-4 w-4 text-red-500 dark:text-red-400" />
                        ) : (
                          <Minus className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                        )}
                        <span className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">{totalValue}</span>
                      </div>
                      <span className="text-xs text-slate-500 dark:text-slate-400">Capital Value</span>
                    </div>
                  </div>
                </div>
                
                <div className="p-4 sm:p-5 bg-slate-50 dark:bg-zinc-800/50">
                  <div className="flex flex-wrap gap-2">
                    {picks.length > 0 ? (
                      picks.map((pick, idx) => {
                        const isAcquired = pick.originalOwner !== rosterId;
                        return (
                          <div
                            key={idx}
                            className={`px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg border text-xs ${roundColors[pick.round]} ${
                              isAcquired ? 'ring-2 ring-emerald-400 dark:ring-emerald-500 ring-offset-1 dark:ring-offset-zinc-800' : ''
                            }`}
                          >
                            <span className={isAcquired ? 'font-bold' : 'font-medium'}>
                              {pick.round}.{String(pick.originalOwner).padStart(2, '0')}
                            </span>
                            {isAcquired && (
                              <span className="block mt-0.5 text-[10px] opacity-70">
                                from {getTeamName(pick.originalOwner).slice(0, 12)}
                              </span>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <span className="text-sm text-slate-400 dark:text-slate-500 italic">No picks</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Summary Table */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 shadow-sm dark:shadow-none overflow-hidden">
            <div className="px-4 sm:px-6 py-4 border-b border-slate-100 dark:border-zinc-800">
              <h3 className="font-semibold text-slate-900 dark:text-white">Draft Capital Summary</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Picks by round for all teams</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800/50">
                    <th className="text-left py-3 px-4 font-semibold text-slate-700 dark:text-slate-300 sticky left-0 bg-slate-50 dark:bg-zinc-800/50">Team</th>
                    <th className="text-center py-3 px-4 font-semibold text-amber-700 dark:text-amber-400">1st</th>
                    <th className="text-center py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">2nd</th>
                    <th className="text-center py-3 px-4 font-semibold text-orange-600 dark:text-orange-400">3rd</th>
                    <th className="text-center py-3 px-4 font-semibold text-stone-600 dark:text-stone-400">4th</th>
                    <th className="text-center py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">Total</th>
                    <th className="text-center py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedTeams.map(({ rosterId, picks, totalValue }, index) => {
                    const countByRound = [1, 2, 3, 4].map(round => 
                      picks.filter(p => p.round === round).length
                    );
                    return (
                      <tr key={rosterId} className={`border-b border-slate-100 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-800/50 ${
                        index === 0 ? 'bg-amber-50/50 dark:bg-amber-500/5' : ''
                      }`}>
                        <td className="py-3 px-4 font-medium text-slate-900 dark:text-white sticky left-0 bg-inherit">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-400 dark:text-slate-500 w-5">#{index + 1}</span>
                            {getTeamName(rosterId)}
                          </div>
                        </td>
                        {countByRound.map((count, idx) => (
                          <td key={idx} className="text-center py-3 px-4">
                            <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-bold ${
                              count === 0 ? 'bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400' :
                              count === 1 ? 'bg-slate-100 dark:bg-zinc-700 text-slate-600 dark:text-slate-300' :
                              count >= 2 ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400' : ''
                            }`}>
                              {count}
                            </span>
                          </td>
                        ))}
                        <td className="text-center py-3 px-4 font-bold text-slate-900 dark:text-white">{picks.length}</td>
                        <td className="text-center py-3 px-4 font-bold text-accent-600 dark:text-accent-400">{totalValue}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
