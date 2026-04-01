import { useState, useMemo, Fragment } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Search,
  ArrowUpDown,
  Filter,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';

interface PlayerValue {
  id: string;
  player_id: string;
  value: number;
  rank: number | null;
  position_rank: number | null;
  tier: number | null;
  trend: number | null;
  superflex: boolean;
  fetched_at: string;
  player: {
    full_name: string;
    position: string;
    team: string;
    age: number | null;
    injury_status: string | null;
  };
}

interface PickValue {
  id: string;
  pick_type: string;
  pick_year: string;
  pick_round: number;
  pick_tier: string | null;
  value: number;
  rank: number | null;
  superflex: boolean;
  fetched_at: string;
}

// Unified type for combined list
interface UnifiedValue {
  id: string;
  playerId: string | null;
  type: 'player' | 'pick';
  name: string;
  position: string;
  team: string | null;
  age: number | null;
  value: number;
  rank: number | null;
  positionRank: number | null;
  tier: number | null;
  trend: number | null;
  injuryStatus: string | null;
  pickTier: string | null;
  fetchedAt: string;
}


async function fetchPlayerValues(): Promise<PlayerValue[]> {
  const { data, error } = await supabase
    .from('player_values')
    .select(`
      id,
      player_id,
      value,
      rank,
      position_rank,
      tier,
      trend,
      superflex,
      fetched_at,
      player:players(full_name, position, team, age, injury_status)
    `)
    .order('rank', { ascending: true });

  if (error) throw error;

  return (data || []).map(pv => ({
    ...pv,
    player: Array.isArray(pv.player) ? pv.player[0] : pv.player
  }));
}

async function fetchPickValues(): Promise<PickValue[]> {
  const { data, error } = await supabase
    .from('pick_values')
    .select('*')
    .order('value', { ascending: false });

  if (error) throw error;
  return data || [];
}

type SortField = 'rank' | 'value' | 'name';
type SortDirection = 'asc' | 'desc';

const ITEMS_PER_PAGE = 50;

export function KTCValues() {
  const [searchQuery, setSearchQuery] = useState('');
  const [positionFilter, setPositionFilter] = useState<string>('ALL');
  const [sortField, setSortField] = useState<SortField>('rank');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [currentPage, setCurrentPage] = useState(1);

  const { data: playerValues, isLoading: playersLoading, error: playersError } = useQuery({
    queryKey: ['playerValues'],
    queryFn: fetchPlayerValues
  });

  const { data: pickValues, isLoading: picksLoading, error: picksError } = useQuery({
    queryKey: ['pickValues'],
    queryFn: fetchPickValues
  });

  const isLoading = playersLoading || picksLoading;
  const error = playersError || picksError;



  // Combine players and picks into unified list
  const unifiedValues = useMemo<UnifiedValue[]>(() => {
    const combined: UnifiedValue[] = [];

    // Add players
    if (playerValues) {
      for (const pv of playerValues) {
        if (!pv.player) continue;
        combined.push({
          id: pv.id,
          playerId: pv.player_id,
          type: 'player',
          name: pv.player.full_name,
          position: pv.player.position,
          team: pv.player.team,
          age: pv.player.age,
          value: pv.value,
          rank: pv.rank,
          positionRank: pv.position_rank,
          tier: pv.tier,
          trend: pv.trend,
          injuryStatus: pv.player.injury_status,
          pickTier: null,
          fetchedAt: pv.fetched_at,
        });
      }
    }

    // Add picks
    if (pickValues) {
      for (const pick of pickValues) {
        combined.push({
          id: pick.id,
          playerId: null,
          type: 'pick',
          name: pick.pick_type,
          position: 'PICK',
          team: null,
          age: null,
          value: pick.value,
          rank: pick.rank,
          positionRank: null,
          tier: null,
          trend: null,
          injuryStatus: null,
          pickTier: pick.pick_tier,
          fetchedAt: pick.fetched_at,
        });
      }
    }

    return combined;
  }, [playerValues, pickValues]);

  // Filter and sort combined list
  const filteredAndSorted = useMemo(() => {
    let filtered = [...unifiedValues];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(item =>
        item.name.toLowerCase().includes(query) ||
        item.team?.toLowerCase().includes(query) ||
        item.position.toLowerCase().includes(query)
      );
    }

    // Position filter
    if (positionFilter !== 'ALL') {
      filtered = filtered.filter(item => item.position === positionFilter);
    }

    // Sort
    filtered.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'rank':
          comparison = (a.rank || 999) - (b.rank || 999);
          break;
        case 'value':
          comparison = (b.value || 0) - (a.value || 0);
          break;
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }, [unifiedValues, searchQuery, positionFilter, sortField, sortDirection]);

  // Paginate filtered results
  const totalPages = Math.ceil(filteredAndSorted.length / ITEMS_PER_PAGE);
  const paginatedValues = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredAndSorted.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredAndSorted, currentPage]);

  // Reset to page 1 when filters change
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
  };

  const handlePositionFilterChange = (value: string) => {
    setPositionFilter(value);
    setCurrentPage(1);
  };

  // Stats
  const stats = useMemo(() => {
    const players = unifiedValues.filter(v => v.type === 'player');
    const picks = unifiedValues.filter(v => v.type === 'pick');
    const positions = ['QB', 'RB', 'WR', 'TE'];
    const positionCounts = positions.reduce((acc, pos) => {
      acc[pos] = players.filter(p => p.position === pos).length;
      return acc;
    }, {} as Record<string, number>);

    const lastUpdated = unifiedValues[0]?.fetchedAt;

    return {
      totalPlayers: players.length,
      totalPicks: picks.length,
      total: unifiedValues.length,
      positionCounts,
      lastUpdated
    };
  }, [unifiedValues]);

  const TrendIndicator = ({ trend }: { trend: number | null }) => {
    if (trend === null || trend === 0) {
      return <Minus className="w-3 h-3 sm:w-4 sm:h-4 text-[#888888]" />;
    }
    if (trend > 0) {
      return (
        <div className="flex items-center gap-0.5 sm:gap-1 text-emerald-400">
          <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4" />
          <span className="text-[10px] sm:text-xs font-medium">+{trend}</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-0.5 sm:gap-1 text-red-400">
        <TrendingDown className="w-3 h-3 sm:w-4 sm:h-4" />
        <span className="text-[10px] sm:text-xs font-medium">{trend}</span>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12 border-b-2 border-accent-500"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
        <div className="bg-red-500/10 border border-red-500/30 rounded-md p-4 sm:p-5 text-red-400 text-sm">
          Error loading values: {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
      <PageHeader
        sectionLabel="Players"
        title="KTC Values"
        subtitle="Powered by KeepTradeCut • Superflex Rankings"
      />

      {/* Filters */}
      <div className="mb-5 sm:mb-6 flex flex-col md:flex-row gap-3 sm:gap-4">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-[#888888]" />
          <input
            type="text"
            placeholder="Search players or picks..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full pl-8 sm:pl-10 pr-3 sm:pr-4 py-2 sm:py-2.5 bg-[#0a0a0a] border border-[#151515] rounded-md text-sm sm:text-base text-white placeholder-[#555555] focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent transition-colors"
          />
        </div>

        {/* Position Filter */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <Filter className="w-4 h-4 sm:w-5 sm:h-5 text-[#888888] hidden sm:block" />
          <div className="flex gap-1 flex-wrap">
            {['ALL', 'QB', 'RB', 'WR', 'TE', 'PICK'].map(pos => (
              <button
                key={pos}
                onClick={() => handlePositionFilterChange(pos)}
                className={`px-2 sm:px-3 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-colors ${
                  positionFilter === pos
                    ? 'bg-accent-500 text-white'
                    : 'bg-[#111111] text-[#888888] hover:bg-[#1a1a1a] hover:text-white'
                }`}
              >
                {pos === 'PICK' ? 'Picks' : pos}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Last Updated */}
      <div className="mt-4 sm:mt-6 text-xs sm:text-sm text-[#888888]">
        {stats.lastUpdated && (
          <span className="text-[10px] sm:text-sm">
            Last updated: {new Date(stats.lastUpdated).toLocaleString()}
          </span>
        )}
      </div>

      {/* Sort Controls */}
      <div className="flex items-center gap-3 mt-3 sm:mt-4 mb-3">
        <div className="flex items-center gap-1.5">
          <ArrowUpDown className="h-4 w-4 text-[#555555]" />
          <select
            value={`${sortField}-${sortDirection}`}
            onChange={(e) => {
              const [field, dir] = e.target.value.split('-') as [SortField, SortDirection];
              setSortField(field);
              setSortDirection(dir);
            }}
            className="px-3 py-2 bg-[#0a0a0a] border border-[#151515] rounded-md text-xs font-medium focus:outline-none focus:ring-2 focus:ring-accent-500 text-white"
          >
            <option value="rank-asc">Rank (High → Low)</option>
            <option value="rank-desc">Rank (Low → High)</option>
            <option value="value-desc">Value (High → Low)</option>
            <option value="value-asc">Value (Low → High)</option>
            <option value="name-asc">Name (A → Z)</option>
            <option value="name-desc">Name (Z → A)</option>
          </select>
        </div>
      </div>

      {/* Asset List */}
      <div className="divide-y divide-[#111111]">
        {paginatedValues.map((item, idx) => {
          const prevItem = idx > 0 ? paginatedValues[idx - 1] : null;
          const showTierHeader = sortField === 'rank' &&
            item.tier &&
            (!prevItem || prevItem.tier !== item.tier);

          const tierLabels: Record<number, string> = {
            1: 'Tier 1', 2: 'Tier 2', 3: 'Tier 3', 4: 'Tier 4', 5: 'Tier 5',
          };

          return (
            <Fragment key={item.id}>
              {showTierHeader && (
                <div className="bg-[#111111] px-3 sm:px-4 py-2 sm:py-2.5">
                  <span className="text-xs sm:text-sm font-bold text-[#333333]">
                    {tierLabels[item.tier!] || `Tier ${item.tier}`}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2 sm:gap-3 px-1 sm:px-2 py-2.5 sm:py-3 hover:bg-[#0a0a0a] transition-colors">
                {/* Rank */}
                <span className="text-[11px] sm:text-xs text-[#555555] font-medium w-7 sm:w-8 text-right shrink-0 tabular-nums">
                  #{item.rank || '-'}
                </span>

                {/* Avatar */}
                {item.type === 'player' && item.playerId ? (
                  <img
                    src={`https://sleepercdn.com/content/nfl/players/${item.playerId}.jpg`}
                    alt=""
                    className="w-7 h-7 sm:w-8 sm:h-8 rounded-full object-cover bg-[#111111] flex-shrink-0"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#111111] flex items-center justify-center flex-shrink-0">
                    <span className="text-[8px] sm:text-[9px] font-bold text-[#555555]">PK</span>
                  </div>
                )}

                {/* Name + meta */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[13px] sm:text-sm text-[#cccccc] font-medium truncate">{item.name}</span>
                    {item.injuryStatus && (
                      <span className="px-1 py-0.5 text-[10px] bg-red-500/20 text-red-400 rounded font-medium">
                        {item.injuryStatus}
                      </span>
                    )}
                    {item.pickTier && (
                      <span className={`px-1 py-0.5 text-[10px] rounded font-medium ${
                        item.pickTier === 'Early' ? 'bg-emerald-500/20 text-emerald-400' :
                        item.pickTier === 'Mid' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-red-500/20 text-red-400'
                      }`}>
                        {item.pickTier}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] sm:text-xs text-[#444444]">
                    {item.position}{item.team ? ` · ${item.team}` : ''}{item.positionRank ? ` · ${item.position}${item.positionRank}` : ''}{item.age ? ` · ${item.age}yr` : ''}
                  </span>
                </div>

                {/* Trend */}
                <div className="shrink-0">
                  <TrendIndicator trend={item.trend} />
                </div>

                {/* Value */}
                <span className="text-sm sm:text-base font-bold text-white tabular-nums shrink-0">
                  {item.value.toLocaleString()}
                </span>
              </div>
            </Fragment>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 sm:mt-6 flex items-center justify-between">
          <p className="text-xs sm:text-sm text-[#888888]">
            Page {currentPage} of {totalPages}
          </p>
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 sm:p-2 rounded-md border border-[#151515] bg-[#0a0a0a] hover:bg-[#111111] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[#888888]" />
            </button>
            <div className="hidden sm:flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`min-w-[36px] h-9 px-3 rounded-md text-sm font-medium transition-colors ${
                      currentPage === pageNum
                        ? 'bg-accent-500 text-white'
                        : 'bg-[#0a0a0a] border border-[#151515] text-[#888888] hover:bg-[#111111]'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>
            <span className="sm:hidden text-xs text-[#888888] min-w-[40px] text-center">
              {currentPage}/{totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 sm:p-2 rounded-md border border-[#151515] bg-[#0a0a0a] hover:bg-[#111111] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[#888888]" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
