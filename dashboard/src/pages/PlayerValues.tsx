import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  Search,
  RefreshCw,
  Crown,
  Star,
  ArrowUpDown,
  Filter,
  FileText
} from 'lucide-react';

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

const POSITION_COLORS: Record<string, string> = {
  QB: 'bg-red-500/20 text-red-400 border-red-500/30',
  RB: 'bg-green-500/20 text-green-400 border-green-500/30',
  WR: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  TE: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  K: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  DEF: 'bg-orange-500/20 text-orange-400 border-orange-500/30'
};

const TIER_COLORS: Record<number, string> = {
  1: 'bg-gradient-to-r from-yellow-500/20 to-amber-500/20 border-yellow-500/50',
  2: 'bg-gradient-to-r from-slate-400/20 to-gray-400/20 border-slate-400/50',
  3: 'bg-gradient-to-r from-orange-600/20 to-amber-600/20 border-orange-600/50',
  4: 'bg-slate-800/50 border-slate-600/50',
  5: 'bg-slate-800/30 border-slate-700/50',
};

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
  
  // Flatten the player object
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

type ViewTab = 'players' | 'picks';
type SortField = 'rank' | 'value' | 'name' | 'age' | 'trend';
type SortDirection = 'asc' | 'desc';

export function PlayerValues() {
  const [activeTab, setActiveTab] = useState<ViewTab>('players');
  const [searchQuery, setSearchQuery] = useState('');
  const [positionFilter, setPositionFilter] = useState<string>('ALL');
  const [tierFilter, setTierFilter] = useState<number | null>(null);
  const [pickYearFilter, setPickYearFilter] = useState<string>('ALL');
  const [pickRoundFilter, setPickRoundFilter] = useState<number | null>(null);
  const [sortField, setSortField] = useState<SortField>('rank');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  
  const { data: playerValues, isLoading: playersLoading, error: playersError, refetch: refetchPlayers, isRefetching: isRefetchingPlayers } = useQuery({
    queryKey: ['playerValues'],
    queryFn: fetchPlayerValues
  });

  const { data: pickValues, isLoading: picksLoading, error: picksError, refetch: refetchPicks, isRefetching: isRefetchingPicks } = useQuery({
    queryKey: ['pickValues'],
    queryFn: fetchPickValues
  });

  const isLoading = playersLoading || picksLoading;
  const isRefetching = isRefetchingPlayers || isRefetchingPicks;
  const error = playersError || picksError;

  const refetch = () => {
    refetchPlayers();
    refetchPicks();
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection(field === 'name' ? 'asc' : 'desc');
    }
  };

  const filteredAndSortedPlayers = useMemo(() => {
    if (!playerValues) return [];
    
    let filtered = playerValues.filter(pv => pv.player);
    
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(pv => 
        pv.player.full_name.toLowerCase().includes(query) ||
        pv.player.team?.toLowerCase().includes(query)
      );
    }
    
    // Position filter
    if (positionFilter !== 'ALL') {
      filtered = filtered.filter(pv => pv.player.position === positionFilter);
    }
    
    // Tier filter
    if (tierFilter !== null) {
      filtered = filtered.filter(pv => pv.tier === tierFilter);
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
          comparison = a.player.full_name.localeCompare(b.player.full_name);
          break;
        case 'age':
          comparison = (a.player.age || 99) - (b.player.age || 99);
          break;
        case 'trend':
          comparison = (b.trend || 0) - (a.trend || 0);
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
    
    return filtered;
  }, [playerValues, searchQuery, positionFilter, tierFilter, sortField, sortDirection]);

  // Filter and sort picks
  const filteredPicks = useMemo(() => {
    if (!pickValues) return [];
    
    let filtered = [...pickValues];
    
    // Year filter
    if (pickYearFilter !== 'ALL') {
      filtered = filtered.filter(pv => pv.pick_year === pickYearFilter);
    }
    
    // Round filter
    if (pickRoundFilter !== null) {
      filtered = filtered.filter(pv => pv.pick_round === pickRoundFilter);
    }
    
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(pv => pv.pick_type.toLowerCase().includes(query));
    }
    
    return filtered;
  }, [pickValues, pickYearFilter, pickRoundFilter, searchQuery]);

  // Get available years from picks
  const availableYears = useMemo(() => {
    if (!pickValues) return [];
    const years = [...new Set(pickValues.map(p => p.pick_year))].sort();
    return years;
  }, [pickValues]);

  const stats = useMemo(() => {
    if (!playerValues) return null;
    const validPlayers = playerValues.filter(pv => pv.player);
    const positions = ['QB', 'RB', 'WR', 'TE'];
    const positionCounts = positions.reduce((acc, pos) => {
      acc[pos] = validPlayers.filter(pv => pv.player.position === pos).length;
      return acc;
    }, {} as Record<string, number>);
    
    const lastUpdated = playerValues[0]?.fetched_at;
    
    return {
      total: validPlayers.length,
      totalPicks: pickValues?.length || 0,
      positionCounts,
      lastUpdated
    };
  }, [playerValues, pickValues]);

  const TrendIndicator = ({ trend }: { trend: number | null }) => {
    if (trend === null || trend === 0) {
      return <Minus className="w-4 h-4 text-slate-500" />;
    }
    if (trend > 0) {
      return (
        <div className="flex items-center gap-1 text-green-400">
          <TrendingUp className="w-4 h-4" />
          <span className="text-xs">+{trend}</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1 text-red-400">
        <TrendingDown className="w-4 h-4" />
        <span className="text-xs">{trend}</span>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12 border-b-2 border-accent-500"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl p-4 sm:p-5 text-red-700 dark:text-red-400 text-sm">
          Error loading player values: {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-4 sm:mb-6 flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2 sm:gap-3">
            <Crown className="w-6 h-6 sm:w-7 sm:h-7 text-yellow-500" />
            Dynasty Values
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-xs sm:text-sm">
            Powered by KeepTradeCut • Superflex Rankings
          </p>
        </div>
        
        <button
          onClick={() => refetch()}
          disabled={isRefetching}
          className="flex items-center gap-2 px-4 py-2.5 bg-accent-600 hover:bg-accent-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isRefetching ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="mb-8 flex gap-2 border-b border-slate-700/50 pb-2">
        <button
          onClick={() => setActiveTab('players')}
          className={`flex items-center gap-2 px-4 py-2 rounded-t-lg font-medium transition-colors ${
            activeTab === 'players'
              ? 'bg-purple-600 text-white'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <Crown className="w-4 h-4" />
          Players ({stats?.total || 0})
        </button>
        <button
          onClick={() => setActiveTab('picks')}
          className={`flex items-center gap-2 px-4 py-2 rounded-t-lg font-medium transition-colors ${
            activeTab === 'picks'
              ? 'bg-purple-600 text-white'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <FileText className="w-4 h-4" />
          Draft Picks ({stats?.totalPicks || 0})
        </button>
      </div>

      {activeTab === 'players' ? (
        <>
          {/* Stats */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
                <div className="text-2xl font-bold text-white">{stats.total}</div>
                <div className="text-sm text-slate-400">Total Players</div>
              </div>
              {Object.entries(stats.positionCounts).map(([pos, count]) => (
                <div key={pos} className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
                  <div className="text-2xl font-bold text-white">{count}</div>
                  <div className={`text-sm ${POSITION_COLORS[pos]?.split(' ')[1] || 'text-slate-400'}`}>{pos}s</div>
                </div>
              ))}
            </div>
          )}

          {/* Player Filters */}
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder="Search players..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
              />
            </div>
            
            {/* Position Filter */}
            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-slate-400" />
              <div className="flex gap-1">
                {['ALL', 'QB', 'RB', 'WR', 'TE'].map(pos => (
                  <button
                    key={pos}
                    onClick={() => setPositionFilter(pos)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      positionFilter === pos 
                        ? 'bg-purple-600 text-white' 
                        : 'bg-slate-800/50 text-slate-400 hover:text-white'
                    }`}
                  >
                    {pos}
                  </button>
                ))}
              </div>
            </div>
        
        {/* Tier Filter */}
            <div className="flex items-center gap-2">
              <Star className="w-5 h-5 text-slate-400" />
              <div className="flex gap-1">
                <button
                  onClick={() => setTierFilter(null)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    tierFilter === null 
                      ? 'bg-purple-600 text-white' 
                      : 'bg-slate-800/50 text-slate-400 hover:text-white'
                  }`}
                >
                  All
                </button>
                {[1, 2, 3, 4, 5].map(tier => (
                  <button
                    key={tier}
                    onClick={() => setTierFilter(tier)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      tierFilter === tier 
                        ? 'bg-purple-600 text-white' 
                        : 'bg-slate-800/50 text-slate-400 hover:text-white'
                    }`}
                  >
                    T{tier}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Results Count */}
          <div className="text-sm text-slate-400">
            Showing {filteredAndSortedPlayers.length} players
            {stats?.lastUpdated && (
              <span className="ml-4">
                Last updated: {new Date(stats.lastUpdated).toLocaleString()}
              </span>
            )}
          </div>

          {/* Player Table */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="px-4 py-3 text-left text-sm font-medium text-slate-400">
                      <button 
                        onClick={() => handleSort('rank')}
                        className="flex items-center gap-1 hover:text-white transition-colors"
                      >
                        Rank
                        <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-slate-400">
                      <button 
                        onClick={() => handleSort('name')}
                        className="flex items-center gap-1 hover:text-white transition-colors"
                      >
                        Player
                        <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-slate-400">Pos</th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-slate-400">Team</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-slate-400">
                      <button 
                        onClick={() => handleSort('value')}
                        className="flex items-center gap-1 hover:text-white transition-colors ml-auto"
                      >
                        Value
                        <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-slate-400">Tier</th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-slate-400">Pos Rank</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-slate-400">
                      <button 
                        onClick={() => handleSort('age')}
                        className="flex items-center gap-1 hover:text-white transition-colors ml-auto"
                      >
                        Age
                        <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-slate-400">
                      <button 
                        onClick={() => handleSort('trend')}
                        className="flex items-center gap-1 hover:text-white transition-colors"
                      >
                        Trend
                        <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/30">
                  {filteredAndSortedPlayers.map((pv) => (
                    <tr 
                      key={pv.id} 
                      className={`hover:bg-slate-700/20 transition-colors ${
                        pv.tier && TIER_COLORS[pv.tier] ? TIER_COLORS[pv.tier] : ''
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {pv.rank && pv.rank <= 3 && (
                            <Crown className={`w-4 h-4 ${
                              pv.rank === 1 ? 'text-yellow-400' :
                              pv.rank === 2 ? 'text-slate-300' :
                              'text-orange-400'
                            }`} />
                          )}
                          <span className="text-white font-medium">#{pv.rank || '-'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-white font-medium">{pv.player.full_name}</span>
                          {pv.player.injury_status && (
                            <span className="px-1.5 py-0.5 text-xs bg-red-500/20 text-red-400 rounded">
                              {pv.player.injury_status}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-1 text-xs font-medium rounded border ${
                          POSITION_COLORS[pv.player.position] || 'bg-slate-700/50 text-slate-300 border-slate-600/50'
                        }`}>
                          {pv.player.position}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-slate-300">{pv.player.team || '-'}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-lg font-bold text-purple-400">{pv.value.toLocaleString()}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {pv.tier && (
                          <span className={`px-2 py-1 text-xs font-medium rounded ${
                            pv.tier === 1 ? 'bg-yellow-500/20 text-yellow-400' :
                            pv.tier === 2 ? 'bg-slate-400/20 text-slate-300' :
                            pv.tier === 3 ? 'bg-orange-500/20 text-orange-400' :
                            pv.tier === 4 ? 'bg-blue-500/20 text-blue-400' :
                            'bg-slate-600/20 text-slate-400'
                          }`}>
                            Tier {pv.tier}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-slate-300">
                          {pv.position_rank ? `${pv.player.position}${pv.position_rank}` : '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-slate-300">{pv.player.age || '-'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-center">
                          <TrendIndicator trend={pv.trend} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Pick Filters */}
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder="Search picks (e.g. '2025 1st')..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
              />
            </div>
            
            {/* Year Filter */}
            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-slate-400" />
              <div className="flex gap-1">
                <button
                  onClick={() => setPickYearFilter('ALL')}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    pickYearFilter === 'ALL' 
                      ? 'bg-purple-600 text-white' 
                      : 'bg-slate-800/50 text-slate-400 hover:text-white'
                  }`}
                >
                  All Years
                </button>
                {availableYears.map(year => (
                  <button
                    key={year}
                    onClick={() => setPickYearFilter(year)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      pickYearFilter === year 
                        ? 'bg-purple-600 text-white' 
                        : 'bg-slate-800/50 text-slate-400 hover:text-white'
                    }`}
                  >
                    {year}
                  </button>
                ))}
              </div>
            </div>

            {/* Round Filter */}
            <div className="flex items-center gap-2">
              <Star className="w-5 h-5 text-slate-400" />
              <div className="flex gap-1">
                <button
                  onClick={() => setPickRoundFilter(null)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    pickRoundFilter === null 
                      ? 'bg-purple-600 text-white' 
                      : 'bg-slate-800/50 text-slate-400 hover:text-white'
                  }`}
                >
                  All Rounds
                </button>
                {[1, 2, 3, 4].map(round => (
                  <button
                    key={round}
                    onClick={() => setPickRoundFilter(round)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      pickRoundFilter === round 
                        ? 'bg-purple-600 text-white' 
                        : 'bg-slate-800/50 text-slate-400 hover:text-white'
                    }`}
                  >
                    R{round}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Results Count */}
          <div className="text-sm text-slate-400">
            Showing {filteredPicks.length} picks
            {pickValues && pickValues[0]?.fetched_at && (
              <span className="ml-4">
                Last updated: {new Date(pickValues[0].fetched_at).toLocaleString()}
              </span>
            )}
          </div>

          {/* Pick Values Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPicks.map((pick) => {
              const roundColors: Record<number, string> = {
                1: 'border-yellow-500/50 bg-yellow-500/10',
                2: 'border-blue-500/50 bg-blue-500/10',
                3: 'border-green-500/50 bg-green-500/10',
                4: 'border-slate-500/50 bg-slate-500/10',
              };
              const tierColors: Record<string, string> = {
                'Early': 'text-green-400',
                'Mid': 'text-yellow-400',
                'Late': 'text-red-400',
              };

              return (
                <div 
                  key={pick.id}
                  className={`rounded-xl border p-4 ${roundColors[pick.pick_round] || 'border-slate-700/50 bg-slate-800/50'}`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-lg font-bold text-white">{pick.pick_type}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                          pick.pick_round === 1 ? 'bg-yellow-500/20 text-yellow-400' :
                          pick.pick_round === 2 ? 'bg-blue-500/20 text-blue-400' :
                          pick.pick_round === 3 ? 'bg-green-500/20 text-green-400' :
                          'bg-slate-500/20 text-slate-400'
                        }`}>
                          Round {pick.pick_round}
                        </span>
                        {pick.pick_tier && (
                          <span className={`text-xs font-medium ${tierColors[pick.pick_tier] || 'text-slate-400'}`}>
                            {pick.pick_tier}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-purple-400">{pick.value.toLocaleString()}</div>
                      {pick.rank && (
                        <div className="text-xs text-slate-400">Rank #{pick.rank}</div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredPicks.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No pick values found. Try syncing KTC values.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
