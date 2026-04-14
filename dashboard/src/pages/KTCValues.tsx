import { useState, useMemo, Fragment } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { PageHeader } from '../components/PageHeader';
import { Pagination } from '../components/Pagination';
import { FilterBar, SearchInput, FilterPills, SortSelect } from '../components/FilterBar';
import { PositionBadge } from '../components/PositionBadge';
import { useTradeData } from '../hooks/useLeagueData';
import {
  buildPlayersForRoster,
  buildPicksForRoster,
  calcWeightedPositionValue,
} from '../lib/trade-shared';

// ── Player Values Types ──────────────────────────────────────────

interface PlayerValueDetailed {
  id: string;
  player_id: string;
  value: number;
  rank: number | null;
  position_rank: number | null;
  tier: number | null;
  trend: number | null;
  superflex: boolean | null;
  fetched_at: string | null;
  player: {
    full_name: string | null;
    position: string | null;
    team: string | null;
    age: number | null;
    injury_status: string | null;
  };
}

interface PickValueDetailed {
  id: string;
  pick_type: string;
  pick_year: string;
  pick_round: number;
  pick_tier: string | null;
  value: number;
  rank: number | null;
  superflex: boolean | null;
  fetched_at: string | null;
}

interface UnifiedValue {
  id: string;
  playerId: string | null;
  type: 'player' | 'pick';
  name: string | null;
  position: string | null;
  team: string | null;
  age: number | null;
  value: number;
  rank: number | null;
  positionRank: number | null;
  tier: number | null;
  trend: number | null;
  injuryStatus: string | null;
  pickTier: string | null;
  fetchedAt: string | null;
}

async function fetchPlayerValues(): Promise<PlayerValueDetailed[]> {
  const { data, error } = await supabase
    .from('player_values')
    .select(`
      id, player_id, value, rank, position_rank, tier, trend, superflex, fetched_at,
      player:players(full_name, position, team, age, injury_status)
    `)
    .order('rank', { ascending: true });

  if (error) throw error;

  return (data || []).map(pv => {
    const player = Array.isArray(pv.player) ? pv.player[0] : pv.player;
    return { ...pv, player: player as PlayerValueDetailed['player'] };
  });
}

async function fetchPickValues(): Promise<PickValueDetailed[]> {
  const { data, error } = await supabase
    .from('pick_values')
    .select('*')
    .order('value', { ascending: false });

  if (error) throw error;
  return data || [];
}

type SortField = 'rank' | 'value' | 'name';
type SortDirection = 'asc' | 'desc';
type TabType = 'players' | 'teams';

const ITEMS_PER_PAGE = 50;

const tierDescriptions: Record<number, string> = {
  1: 'Elite Dynasty Assets',
  2: 'Blue-Chip Starters',
  3: 'Solid Contributors',
  4: 'Depth & Upside',
  5: 'Roster Filler',
};

const tierAccents: Record<number, string> = {
  1: '#ffd700',
  2: '#c0c0c0',
  3: '#cd7f32',
  4: '#555555',
  5: '#333333',
};

// ── Teams Tab Types & Helpers ────────────────────────────────────

interface TeamRanking {
  rosterId: number;
  ownerName: string;
  teamName: string | null;
  ownerId: string;
  avatarUrl: string | null;
  totalValue: number;
  qbValue: number;
  rbValue: number;
  wrValue: number;
  teValue: number;
  picksValue: number;
  compositeRank: number; // average position rank (lower = better)
  qbRank: number;
  rbRank: number;
  wrRank: number;
  teRank: number;
  picksRank: number;
}

const teamTierLabels: Record<string, string> = {
  Stacked: 'Stacked',
  Solid: 'Solid',
  Meh: 'Meh',
  Pain: 'Pain',
};

const teamTierBorders: Record<string, string> = {
  Stacked: '#f59e0b',
  Solid: '#3b82f6',
  Meh: '#555555',
  Pain: '#ef4444',
};

function getTeamTiers(total: number): { startIdx: number; endIdx: number; label: string }[] {
  const contenderEnd = Math.max(1, Math.floor(total * 0.25));
  const playoffEnd = Math.max(contenderEnd + 1, Math.floor(total * 0.5));
  const midEnd = Math.max(playoffEnd + 1, Math.floor(total * 0.75));
  return [
    { startIdx: 0, endIdx: contenderEnd, label: 'Stacked' },
    { startIdx: contenderEnd, endIdx: playoffEnd, label: 'Solid' },
    { startIdx: playoffEnd, endIdx: midEnd, label: 'Meh' },
    { startIdx: midEnd, endIdx: total, label: 'Pain' },
  ];
}

const teamRankAccentColors: Record<number, string> = {
  1: '#ffd700',
  2: '#c0c0c0',
  3: '#cd7f32',
};

type TeamPositionFilter = 'ALL' | 'QB' | 'RB' | 'WR' | 'TE' | 'Picks';

// Positional weighting now lives in trade-shared.ts so the same "team strength
// at position X" definition is used by the Evaluator and Finder too.

function getTeamValueForFilter(team: TeamRanking, filter: TeamPositionFilter): number {
  switch (filter) {
    case 'QB': return team.qbValue;
    case 'RB': return team.rbValue;
    case 'WR': return team.wrValue;
    case 'TE': return team.teValue;
    case 'Picks': return team.picksValue;
    default: return team.totalValue;
  }
}

// ── Players Tab Component ────────────────────────────────────────

function PlayersTab() {
  const [searchQuery, setSearchQuery] = useState('');
  const [positionFilter, setPositionFilter] = useState<string>('ALL');
  const [sortField, setSortField] = useState<SortField>('rank');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [currentPage, setCurrentPage] = useState(1);

  const { data: playerValues, isLoading: playersLoading, error: playersError } = useQuery({
    queryKey: ['playerValues', 'detailed'],
    queryFn: fetchPlayerValues
  });

  const { data: pickValues, isLoading: picksLoading, error: picksError } = useQuery({
    queryKey: ['pickValues'],
    queryFn: fetchPickValues
  });

  const isLoading = playersLoading || picksLoading;
  const error = playersError || picksError;

  const unifiedValues = useMemo<UnifiedValue[]>(() => {
    const combined: UnifiedValue[] = [];
    if (playerValues) {
      for (const pv of playerValues) {
        if (!pv.player) continue;
        combined.push({
          id: pv.id, playerId: pv.player_id, type: 'player',
          name: pv.player.full_name, position: pv.player.position,
          team: pv.player.team, age: pv.player.age, value: pv.value,
          rank: pv.rank, positionRank: pv.position_rank, tier: pv.tier,
          trend: pv.trend, injuryStatus: pv.player.injury_status,
          pickTier: null, fetchedAt: pv.fetched_at,
        });
      }
    }
    if (pickValues) {
      for (const pick of pickValues) {
        combined.push({
          id: pick.id, playerId: null, type: 'pick',
          name: pick.pick_type, position: 'PICK', team: null, age: null,
          value: pick.value, rank: pick.rank, positionRank: null,
          tier: null, trend: null, injuryStatus: null,
          pickTier: pick.pick_tier, fetchedAt: pick.fetched_at,
        });
      }
    }
    return combined;
  }, [playerValues, pickValues]);

  const filteredAndSorted = useMemo(() => {
    let filtered = [...unifiedValues];
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(item =>
        item.name?.toLowerCase().includes(query) ||
        item.team?.toLowerCase().includes(query) ||
        item.position?.toLowerCase().includes(query)
      );
    }
    if (positionFilter !== 'ALL') {
      filtered = filtered.filter(item => item.position === positionFilter);
    }
    filtered.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'rank': comparison = (a.rank || 999) - (b.rank || 999); break;
        case 'value': comparison = (b.value || 0) - (a.value || 0); break;
        case 'name': comparison = (a.name || '').localeCompare(b.name || ''); break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
    return filtered;
  }, [unifiedValues, searchQuery, positionFilter, sortField, sortDirection]);

  const totalPages = Math.ceil(filteredAndSorted.length / ITEMS_PER_PAGE);
  const paginatedValues = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredAndSorted.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredAndSorted, currentPage]);

  const handleSearchChange = (value: string) => { setSearchQuery(value); setCurrentPage(1); };
  const handlePositionFilterChange = (value: string) => { setPositionFilter(value); setCurrentPage(1); };

  const stats = useMemo(() => {
    const players = unifiedValues.filter(v => v.type === 'player');
    const picks = unifiedValues.filter(v => v.type === 'pick');
    const lastUpdated = unifiedValues[0]?.fetchedAt;
    return { totalPlayers: players.length, totalPicks: picks.length, total: unifiedValues.length, lastUpdated };
  }, [unifiedValues]);

  if (isLoading) {
    return (
      <div className="space-y-3 mt-4">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-2 py-3">
            <div className="skeleton w-8 h-4" />
            <div className="skeleton w-8 h-8 rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="skeleton w-40 h-4" />
              <div className="skeleton w-24 h-3" />
            </div>
            <div className="skeleton w-16 h-5" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-5 text-red-400 text-sm mt-4">
        Error loading values: {error instanceof Error ? error.message : 'Unknown error'}
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <span className="text-[11px] text-[#555555] bg-[#0a0a0a] px-2 py-0.5 rounded-md">
          {stats.totalPlayers} players
        </span>
        <span className="text-[11px] text-[#555555] bg-[#0a0a0a] px-2 py-0.5 rounded-md">
          {stats.totalPicks} picks
        </span>
        {stats.lastUpdated && (
          <span className="text-[11px] text-[#444444]">
            Updated {new Date(stats.lastUpdated).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at {new Date(stats.lastUpdated).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </span>
        )}
      </div>
      <FilterBar sticky>
        <SearchInput
          value={searchQuery}
          onChange={handleSearchChange}
          placeholder="Search players or picks..."
        />
        <FilterPills
          options={[
            { value: 'ALL', label: 'All' },
            { value: 'QB', label: 'QB' },
            { value: 'RB', label: 'RB' },
            { value: 'WR', label: 'WR' },
            { value: 'TE', label: 'TE' },
            { value: 'PICK', label: 'Picks' },
          ]}
          selected={positionFilter}
          onChange={handlePositionFilterChange}
        />
        <SortSelect
          value={`${sortField}-${sortDirection}`}
          onChange={(val) => {
            const [field, dir] = val.split('-') as [SortField, SortDirection];
            setSortField(field);
            setSortDirection(dir);
            setCurrentPage(1);
          }}
          options={[
            { value: 'rank-asc', label: 'Rank (High → Low)' },
            { value: 'rank-desc', label: 'Rank (Low → High)' },
            { value: 'value-desc', label: 'Value (High → Low)' },
            { value: 'value-asc', label: 'Value (Low → High)' },
            { value: 'name-asc', label: 'Name (A → Z)' },
            { value: 'name-desc', label: 'Name (Z → A)' },
          ]}
        />
      </FilterBar>

      <div className="bg-[#0a0a0a] rounded-xl overflow-hidden">
        {paginatedValues.map((item, idx) => {
          const prevItem = idx > 0 ? paginatedValues[idx - 1] : null;
          const showTierHeader = sortField === 'rank' &&
            item.tier &&
            (!prevItem || prevItem.tier !== item.tier);

          const globalRank = (currentPage - 1) * ITEMS_PER_PAGE + idx + 1;

          return (
            <Fragment key={`${item.type}-${item.id}`}>
              {showTierHeader && (
                <div
                  className="px-4 py-2.5 bg-[#0d0d0d] border-b border-[#111111] sticky top-0 z-[5]"
                  style={{ borderLeft: `3px solid ${tierAccents[item.tier!] || '#333'}` }}
                >
                  <span className="text-xs font-bold text-[#888888]">
                    Tier {item.tier}
                  </span>
                  {tierDescriptions[item.tier!] && (
                    <span className="text-xs text-[#555555] ml-2">
                      — {tierDescriptions[item.tier!]}
                    </span>
                  )}
                </div>
              )}
              <div
                className="flex items-center gap-2.5 px-3 sm:px-4 py-2 sm:py-2.5 hover:bg-[#111111]/50 transition-colors border-b border-[#111111] last:border-b-0"
              >
                <span className="text-xs font-medium text-[#666666] w-5 sm:w-6 text-right shrink-0 tabular-nums">
                  {globalRank}
                </span>

                {item.type === 'player' && item.playerId ? (
                  <img
                    src={`https://sleepercdn.com/content/nfl/players/${item.playerId}.jpg`}
                    alt=""
                    className="w-8 h-8 rounded-full object-cover bg-[#111111] shrink-0"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-[#111111] flex items-center justify-center shrink-0">
                    <span className="text-[8px] font-bold text-[#555555]">PK</span>
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <span className="text-[13px] font-semibold text-white truncate block">
                    {item.name}
                  </span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {item.position && <PositionBadge position={item.position} size="xs" />}
                    {item.team && (
                      <span className="text-[11px] text-[#666666]">
                        {item.team}
                      </span>
                    )}
                    {item.pickTier && (
                      <span className={`px-1 py-0.5 text-[9px] rounded font-bold leading-none ${
                        item.pickTier === 'Early' ? 'bg-emerald-500/20 text-emerald-400' :
                        item.pickTier === 'Mid' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-red-500/20 text-red-400'
                      }`}>
                        {item.pickTier}
                      </span>
                    )}
                  </div>
                </div>

                <span className="text-sm font-bold text-white tabular-nums shrink-0">
                  {item.value.toLocaleString()}
                </span>
              </div>
            </Fragment>
          );
        })}
      </div>

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={filteredAndSorted.length}
        itemsPerPage={ITEMS_PER_PAGE}
        onPageChange={(page) => { setCurrentPage(page); window.scrollTo({ top: 0 }); }}
      />
    </>
  );
}

// ── Teams Tab Component ──────────────────────────────────────────

function TeamsTab() {
  const [positionFilter, setPositionFilter] = useState<TeamPositionFilter>('ALL');

  const { rosters, players, playerValues, pickValues, tradedPicks, currentLeagueId, isLoading } = useTradeData();

  // Fetch team avatars from Sleeper API
  const { data: teamAvatarData } = useQuery({
    queryKey: ['team-avatars', currentLeagueId],
    queryFn: async () => {
      const res = await fetch(`https://api.sleeper.app/v1/league/${currentLeagueId}/users`);
      const sleeperUsers = await res.json();
      const avatarMap = new Map<string, string>();
      if (Array.isArray(sleeperUsers)) {
        sleeperUsers.forEach((u: any) => {
          const teamAvatar = u.metadata?.avatar;
          if (teamAvatar && u.user_id) {
            avatarMap.set(u.user_id, teamAvatar);
          }
        });
      }
      // Also fetch user avatars as fallback
      const { data: users } = await supabase.from('users').select('user_id, avatar');
      const userAvatars = new Map<string, string>();
      (users || []).forEach((u: any) => {
        if (u.avatar) userAvatars.set(u.user_id, `https://sleepercdn.com/avatars/thumbs/${u.avatar}`);
      });
      return { teamAvatars: avatarMap, userAvatars };
    },
    enabled: !!currentLeagueId,
  });

  const teamRankings = useMemo<TeamRanking[]>(() => {
    if (!rosters.length || !playerValues.size) return [];

    // First pass: compute weighted position values for each roster
    const baseTeams = rosters.map(roster => {
      const playerAssets = buildPlayersForRoster(roster, playerValues, players);
      const pickAssets = buildPicksForRoster(roster.roster_id, rosters, pickValues, tradedPicks);

      const byPosition: Record<string, { value: number }[]> = { QB: [], RB: [], WR: [], TE: [] };
      for (const asset of playerAssets) {
        if (asset.position && byPosition[asset.position]) {
          byPosition[asset.position].push(asset);
        }
      }

      const qbValue = calcWeightedPositionValue(byPosition.QB, 'QB');
      const rbValue = calcWeightedPositionValue(byPosition.RB, 'RB');
      const wrValue = calcWeightedPositionValue(byPosition.WR, 'WR');
      const teValue = calcWeightedPositionValue(byPosition.TE, 'TE');
      const picksValue = pickAssets.reduce((sum, a) => sum + a.value, 0);
      const totalValue = qbValue + rbValue + wrValue + teValue + picksValue;

      const teamAvatar = teamAvatarData?.teamAvatars.get(roster.owner_id) || null;
      const userAvatar = teamAvatarData?.userAvatars.get(roster.owner_id) || null;

      return {
        rosterId: roster.roster_id,
        ownerName: roster.ownerName,
        teamName: roster.teamName,
        ownerId: roster.owner_id,
        avatarUrl: teamAvatar || userAvatar,
        totalValue, qbValue, rbValue, wrValue, teValue, picksValue,
      };
    });

    // Second pass: compute position ranks and composite rank
    const rankByField = (field: 'qbValue' | 'rbValue' | 'wrValue' | 'teValue' | 'picksValue') => {
      const sorted = [...baseTeams].sort((a, b) => b[field] - a[field]);
      const ranks = new Map<number, number>();
      sorted.forEach((t, i) => ranks.set(t.rosterId, i + 1));
      return ranks;
    };

    const qbRanks = rankByField('qbValue');
    const rbRanks = rankByField('rbValue');
    const wrRanks = rankByField('wrValue');
    const teRanks = rankByField('teValue');
    const picksRanks = rankByField('picksValue');

    return baseTeams.map(t => {
      const qbRank = qbRanks.get(t.rosterId)!;
      const rbRank = rbRanks.get(t.rosterId)!;
      const wrRank = wrRanks.get(t.rosterId)!;
      const teRank = teRanks.get(t.rosterId)!;
      const picksRank = picksRanks.get(t.rosterId)!;
      const compositeRank = (qbRank + rbRank + wrRank + teRank + picksRank) / 5;

      return { ...t, compositeRank, qbRank, rbRank, wrRank, teRank, picksRank };
    });
  }, [rosters, players, playerValues, pickValues, tradedPicks, teamAvatarData]);

  const sortedTeams = useMemo(() => {
    return [...teamRankings]
      .sort((a, b) => getTeamValueForFilter(b, positionFilter) - getTeamValueForFilter(a, positionFilter));
  }, [teamRankings, positionFilter]);

  if (isLoading) {
    return (
      <div className="space-y-3 mt-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-2 py-3">
            <div className="skeleton w-5 h-4" />
            <div className="skeleton w-7 h-7 rounded-full" />
            <div className="skeleton w-32 h-4 flex-1" />
            <div className="skeleton w-16 h-4" />
          </div>
        ))}
      </div>
    );
  }

  if (!sortedTeams.length) return null;

  const tiers = getTeamTiers(sortedTeams.length);

  const getTierForIndex = (idx: number) => tiers.find(t => idx >= t.startIdx && idx < t.endIdx);

  const isAllFilter = positionFilter === 'ALL';
  const filterLabel = isAllFilter ? 'Total' : positionFilter === 'Picks' ? 'Pick' : positionFilter;

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <span className="text-[11px] text-[#555555] bg-[#0a0a0a] px-2 py-1 rounded-md">
          {sortedTeams.length} teams
        </span>
        <span className="text-[11px] text-[#444444]">
          Ranked by {filterLabel} weighted KTC value
        </span>
      </div>

      <div className="mb-4">
        <FilterPills
          options={[
            { value: 'ALL', label: 'All' },
            { value: 'QB', label: 'QB' },
            { value: 'RB', label: 'RB' },
            { value: 'WR', label: 'WR' },
            { value: 'TE', label: 'TE' },
            { value: 'Picks', label: 'Picks' },
          ]}
          selected={positionFilter}
          onChange={(v) => setPositionFilter(v as TeamPositionFilter)}
        />
      </div>

      <div className="bg-[#0a0a0a] rounded-xl overflow-hidden border border-[#161616]">
        {sortedTeams.map((team, idx) => {
          const rank = idx + 1;
          const accentColor = teamRankAccentColors[rank];
          const tierInfo = getTierForIndex(idx);
          const prevTierInfo = idx > 0 ? getTierForIndex(idx - 1) : null;
          const showTierHeader = tierInfo && (!prevTierInfo || tierInfo.label !== prevTierInfo.label);
          const displayValue = getTeamValueForFilter(team, positionFilter);

          return (
            <div key={team.rosterId}>
              {showTierHeader && (
                <div
                  className="px-4 py-2.5 bg-[#0d0d0d] border-b border-[#111111]"
                  style={{ borderLeft: `3px solid ${teamTierBorders[tierInfo.label] || '#333'}` }}
                >
                  <span className="text-xs font-bold text-[#888888]">
                    Tier {tiers.indexOf(tierInfo) + 1}
                  </span>
                  <span className="text-xs text-[#555555] ml-2">
                    — {teamTierLabels[tierInfo.label]}
                  </span>
                </div>
              )}

              <div
                className={`flex items-center gap-2.5 px-3 py-2 hover:bg-[#0d0d0d] transition-colors ${idx % 2 === 1 ? 'bg-[#070707]' : ''}`}
              >
                <span
                  className="text-[11px] font-bold tabular-nums w-5 text-right shrink-0"
                  style={{ color: accentColor || '#555555' }}
                >
                  {rank}
                </span>

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

                <div className="flex-1 min-w-0 flex items-center justify-between">
                  <p className="text-[12px] font-semibold text-white truncate">
                    {team.teamName || team.ownerName}
                  </p>
                  <span className="text-[12px] font-bold text-white tabular-nums ml-2 shrink-0">
                    {displayValue.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          );
        })}

      </div>

      <div className="text-[11px] text-[#444444] mt-3 px-1 leading-relaxed space-y-1.5">
        <p>
          Rankings use diminishing returns to prevent roster hoarding from inflating values. Players are sorted by KTC value at each position, then weighted by roster slot:
        </p>
        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 pl-1">
          <span className="text-[#555555] font-medium">100%</span>
          <span>Top 2 QBs, top 3 RBs, top 3 WRs, top 1 TE</span>
          <span className="text-[#555555] font-medium">50%</span>
          <span>Next 1 QB, next 2 RBs, next 2 WRs, next 1 TE</span>
          <span className="text-[#555555] font-medium">10%</span>
          <span>Everyone else on the bench beyond that</span>
        </div>
        <p>Picks are always counted at full value.</p>
      </div>
    </>
  );
}

// ── Main Page Component ──────────────────────────────────────────

export function KTCValues() {
  const [activeTab, setActiveTab] = useState<TabType>('players');

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
      <PageHeader
        sectionLabel="Values"
        title="KTC Values"
        subtitle="Superflex Dynasty Rankings"
        tabs={[
          { id: 'players', label: 'Players' },
          { id: 'teams', label: 'Teams' },
        ]}
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as 'players' | 'teams')}
      />

      {activeTab === 'players' ? <PlayersTab /> : <TeamsTab />}
    </div>
  );
}
