import { useState, useMemo, Fragment } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import {
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Pagination } from '../components/Pagination';
import { FilterBar, SearchInput, FilterPills, SortSelect } from '../components/FilterBar';
import { PositionBadge } from '../components/PositionBadge';

interface PlayerValue {
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

interface PickValue {
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

async function fetchPlayerValues(): Promise<PlayerValue[]> {
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
    return { ...pv, player: player as PlayerValue['player'] };
  });
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

const rankAccentColors: Record<number, string> = {
  1: '#ffd700',
  2: '#c0c0c0',
  3: '#cd7f32',
};

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

  // Filter and sort
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

  // Paginate
  const totalPages = Math.ceil(filteredAndSorted.length / ITEMS_PER_PAGE);
  const paginatedValues = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredAndSorted.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredAndSorted, currentPage]);

  const handleSearchChange = (value: string) => { setSearchQuery(value); setCurrentPage(1); };
  const handlePositionFilterChange = (value: string) => { setPositionFilter(value); setCurrentPage(1); };

  // Stats
  const stats = useMemo(() => {
    const players = unifiedValues.filter(v => v.type === 'player');
    const picks = unifiedValues.filter(v => v.type === 'pick');
    const lastUpdated = unifiedValues[0]?.fetchedAt;
    return { totalPlayers: players.length, totalPicks: picks.length, total: unifiedValues.length, lastUpdated };
  }, [unifiedValues]);

  const TrendIndicator = ({ trend }: { trend: number | null }) => {
    if (trend === null || trend === 0) {
      return <Minus className="w-3.5 h-3.5 text-[#444444]" />;
    }
    if (trend > 0) {
      return (
        <div className="flex items-center gap-0.5 text-emerald-400">
          <TrendingUp className="w-3.5 h-3.5" />
          <span className="text-[10px] font-semibold">+{trend}</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-0.5 text-red-400">
        <TrendingDown className="w-3.5 h-3.5" />
        <span className="text-[10px] font-semibold">{trend}</span>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
        <div className="space-y-3 mt-12">
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
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-5 text-red-400 text-sm">
          Error loading values: {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      </div>
    );
  }

  const lastUpdatedStr = stats.lastUpdated
    ? `Updated ${new Date(stats.lastUpdated).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${new Date(stats.lastUpdated).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
    : '';

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <PageHeader
        sectionLabel="Players"
        title="KTC Values"
        subtitle={`Superflex Dynasty Rankings${lastUpdatedStr ? ` · ${lastUpdatedStr}` : ''}`}
        stats={
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-[#555555] bg-[#0a0a0a] px-2 py-1 rounded-md">
              {stats.totalPlayers} players
            </span>
            <span className="text-[11px] text-[#555555] bg-[#0a0a0a] px-2 py-1 rounded-md">
              {stats.totalPicks} picks
            </span>
          </div>
        }
      />

      {/* Unified Filter Bar */}
      <FilterBar>
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

      {/* Asset List */}
      <div className="bg-[#0a0a0a] rounded-xl overflow-hidden">
        {paginatedValues.map((item, idx) => {
          const prevItem = idx > 0 ? paginatedValues[idx - 1] : null;
          const showTierHeader = sortField === 'rank' &&
            item.tier &&
            (!prevItem || prevItem.tier !== item.tier);

          const isTop10 = (item.rank || 999) <= 10;
          const accentColor = rankAccentColors[item.rank || 0];

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
                className={`flex items-center gap-2.5 sm:gap-3 px-3 sm:px-4 ${isTop10 ? 'py-3 sm:py-3.5' : 'py-2.5 sm:py-3'} hover:bg-[#0d0d0d] transition-colors border-b border-[#111111] last:border-b-0`}
                style={accentColor ? { borderLeft: `3px solid ${accentColor}` } : undefined}
              >
                {/* Rank */}
                <span
                  className="text-[11px] font-bold w-7 sm:w-8 text-right shrink-0 tabular-nums"
                  style={{ color: accentColor || '#555555' }}
                >
                  #{item.rank || '-'}
                </span>

                {/* Avatar */}
                {item.type === 'player' && item.playerId ? (
                  <img
                    src={`https://sleepercdn.com/content/nfl/players/${item.playerId}.jpg`}
                    alt=""
                    className={`${isTop10 ? 'w-9 h-9' : 'w-7 h-7 sm:w-8 sm:h-8'} rounded-full object-cover bg-[#111111] shrink-0`}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#111111] flex items-center justify-center shrink-0">
                    <span className="text-[8px] font-bold text-[#555555]">PK</span>
                  </div>
                )}

                {/* Name + meta */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`${isTop10 ? 'text-sm font-bold' : 'text-[13px] font-medium'} text-white truncate`}>
                      {item.name}
                    </span>
                    {item.injuryStatus && (
                      <span className="px-1 py-0.5 text-[9px] bg-red-500/20 text-red-400 rounded font-bold leading-none">
                        {item.injuryStatus}
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
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {item.position && <PositionBadge position={item.position} size="xs" />}
                    <span className="text-[11px] text-[#444444]">
                      {item.team ? `${item.team}` : ''}{item.positionRank ? ` · ${item.position}${item.positionRank}` : ''}{item.age ? ` · ${item.age}yr` : ''}
                    </span>
                  </div>
                </div>

                {/* Trend */}
                <div className="shrink-0">
                  <TrendIndicator trend={item.trend} />
                </div>

                {/* Value */}
                <span className={`${isTop10 ? 'text-base' : 'text-sm'} font-bold text-white tabular-nums shrink-0`}>
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
    </div>
  );
}
