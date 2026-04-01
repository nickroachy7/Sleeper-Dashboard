import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import {
  ArrowRightLeft,
  Loader2,
  Clock,
  Filter,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown
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

interface PlayerValue {
  player_id: string;
  value: number;
}

interface LeagueUser {
  user_id: string;
  team_name: string | null;
  display_name: string | null;
}

const ITEMS_PER_PAGE = 50;

export default function Transactions() {
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('recent');
  const [currentPage, setCurrentPage] = useState(1);

  const { data: players } = useQuery({
    queryKey: ['players'],
    queryFn: async () => {
      const { data } = await supabase.from('players').select('*');
      const playerMap = new Map<string, Player>();
      (data as Player[] || []).forEach(p => playerMap.set(p.player_id, p));
      return playerMap;
    },
  });

  const { data: playerValues } = useQuery({
    queryKey: ['playerValuesMap'],
    queryFn: async () => {
      const { data } = await supabase.from('player_values').select('player_id, value');
      const valueMap = new Map<string, number>();
      (data as PlayerValue[] || []).forEach(pv => valueMap.set(pv.player_id, pv.value));
      return valueMap;
    },
  });

  const { data: transactions, isLoading } = useQuery({
    queryKey: ['transactions'],
    queryFn: async () => {
      let allTransactions: any[] = [];
      let from = 0;
      const pageSize = 1000;

      while (true) {
        const { data, error } = await supabase
          .from('transactions')
          .select('*')
          .range(from, from + pageSize - 1)
          .order('created', { ascending: false, nullsFirst: false });

        if (error || !data || data.length === 0) break;
        allTransactions = [...allTransactions, ...data];
        if (data.length < pageSize) break;
        from += pageSize;
      }

      const { data: users } = await supabase.from('users').select('*');
      const { data: rosters } = await supabase.from('rosters').select('*');
      const { data: leagueUsers } = await supabase.from('league_users').select('user_id, team_name, display_name');

      if (!allTransactions.length) return [];

      const rosterToOwner = new Map<number, string>();
      (rosters as any[])?.forEach((r: any) => {
        rosterToOwner.set(r.roster_id, r.owner_id);
      });

      return allTransactions.map((tx: any) => {
        const rosterOwners = tx.roster_ids?.map((rosterId: number) => {
          const ownerId = rosterToOwner.get(rosterId);
          const owner = (users as any[])?.find((u: any) => u.user_id === ownerId);
          const leagueUser = (leagueUsers as LeagueUser[])?.find((lu: LeagueUser) => lu.user_id === ownerId);
          return {
            rosterId,
            teamName: leagueUser?.team_name || leagueUser?.display_name || owner?.display_name || `Team ${rosterId}`,
            ownerName: owner?.display_name || owner?.username || 'Unknown'
          };
        }) || [];

        return { ...tx, teams: rosterOwners };
      }).sort((a: any, b: any) => {
        const getTimestamp = (tx: any): number => {
          if (tx.created) return tx.created;
          if (tx.status_updated) return tx.status_updated;
          if (tx.created_at) return new Date(tx.created_at).getTime();
          return 0;
        };
        return getTimestamp(b) - getTimestamp(a);
      });
    },
  });

  const getPlayer = (playerId: string): Player | undefined => {
    return players?.get(playerId);
  };

  const getPlayerValue = (playerId: string): number => {
    return playerValues?.get(playerId) || 0;
  };

  const filteredAndSortedTransactions = useMemo(() => {
    if (!transactions) return [];

    const getTransactionValueMetrics = (tx: any) => {
      if (tx.type === 'trade') {
        const teamValues: Record<number, { received: number; gave: number }> = {};

        if (tx.adds) {
          Object.entries(tx.adds).forEach(([playerId, rosterId]) => {
            const rId = rosterId as number;
            if (!teamValues[rId]) teamValues[rId] = { received: 0, gave: 0 };
            teamValues[rId].received += playerValues?.get(playerId) || 0;
          });
        }

        if (tx.drops) {
          Object.entries(tx.drops).forEach(([playerId, rosterId]) => {
            const rId = rosterId as number;
            if (!teamValues[rId]) teamValues[rId] = { received: 0, gave: 0 };
            teamValues[rId].gave += playerValues?.get(playerId) || 0;
          });
        }

        if (tx.draft_picks && Array.isArray(tx.draft_picks)) {
          tx.draft_picks.forEach((pick: any) => {
            const pickValue = pick.round === 1 ? 5000 : pick.round === 2 ? 2000 : pick.round === 3 ? 800 : 400;
            if (pick.owner_id) {
              if (!teamValues[pick.owner_id]) teamValues[pick.owner_id] = { received: 0, gave: 0 };
              teamValues[pick.owner_id].received += pickValue;
            }
            if (pick.previous_owner_id) {
              if (!teamValues[pick.previous_owner_id]) teamValues[pick.previous_owner_id] = { received: 0, gave: 0 };
              teamValues[pick.previous_owner_id].gave += pickValue;
            }
          });
        }

        let totalValue = 0;
        let maxGain = -Infinity;
        let maxLoss = Infinity;

        Object.values(teamValues).forEach(team => {
          totalValue += team.received;
          const netGain = team.received - team.gave;
          if (netGain > maxGain) maxGain = netGain;
          if (netGain < maxLoss) maxLoss = netGain;
        });

        const valueDiff = maxGain - maxLoss;

        return { totalValue, valueDiff, maxTeamGain: maxGain === -Infinity ? 0 : maxGain };
      } else {
        const adds = tx.adds ? Object.keys(tx.adds) : [];
        const drops = tx.drops ? Object.keys(tx.drops) : [];

        const addedValue = adds.reduce((sum: number, playerId: string) => sum + (playerValues?.get(playerId) || 0), 0);
        const droppedValue = drops.reduce((sum: number, playerId: string) => sum + (playerValues?.get(playerId) || 0), 0);

        return {
          totalValue: addedValue + droppedValue,
          valueDiff: Math.abs(addedValue - droppedValue),
          maxTeamGain: addedValue - droppedValue
        };
      }
    };

    let filtered = typeFilter === 'all'
      ? transactions
      : transactions.filter((tx: any) => tx.type === typeFilter);

    if (sortBy === 'recent') return filtered;

    return [...filtered].sort((a: any, b: any) => {
      const metricsA = getTransactionValueMetrics(a);
      const metricsB = getTransactionValueMetrics(b);

      switch (sortBy) {
        case 'value-high':
          return metricsB.totalValue - metricsA.totalValue;
        case 'value-low':
          return metricsA.totalValue - metricsB.totalValue;
        case 'most-lopsided':
          return metricsB.valueDiff - metricsA.valueDiff;
        case 'most-even':
          return metricsA.valueDiff - metricsB.valueDiff;
        default:
          return 0;
      }
    });
  }, [transactions, typeFilter, sortBy, playerValues]);

  const totalPages = Math.ceil(filteredAndSortedTransactions.length / ITEMS_PER_PAGE);
  const paginatedTransactions = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredAndSortedTransactions.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredAndSortedTransactions, currentPage]);

  const handleFilterChange = (newFilter: string) => {
    setTypeFilter(newFilter);
    setCurrentPage(1);
  };

  const handleSortChange = (newSort: string) => {
    setSortBy(newSort);
    setCurrentPage(1);
  };

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-accent-500 mx-auto" />
            <p className="mt-4 text-[#888888] text-xs sm:text-sm">Loading transactions...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!transactions?.length) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-12 h-12 sm:w-16 sm:h-16 bg-[#111111] rounded-2xl flex items-center justify-center mb-4">
            <ArrowRightLeft className="h-6 w-6 sm:h-8 sm:w-8 text-[#888888]" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">No Transactions</h3>
          <p className="text-sm text-[#888888] max-w-sm mb-6">
            Connect your league to see trades, waivers, and roster moves
          </p>
          <Link
            to="/settings"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-accent-500 text-white text-sm font-medium rounded-md hover:bg-accent-400 transition-colors"
          >
            Connect League
          </Link>
        </div>
      </div>
    );
  }

  const formatDate = (tx: any) => {
    const timestamp = tx.created || tx.status_updated;
    const date = timestamp ? new Date(timestamp) : new Date(tx.created_at);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getTradeAssets = (tx: any) => {
    const teamAssets: Record<number, { players: string[]; picks: any[]; value: number }> = {};

    tx.teams?.forEach((team: any) => {
      teamAssets[team.rosterId] = { players: [], picks: [], value: 0 };
    });

    if (tx.adds) {
      Object.entries(tx.adds).forEach(([playerId, rosterId]) => {
        if (teamAssets[rosterId as number]) {
          teamAssets[rosterId as number].players.push(playerId);
          teamAssets[rosterId as number].value += getPlayerValue(playerId);
        }
      });
    }

    if (tx.draft_picks && Array.isArray(tx.draft_picks)) {
      tx.draft_picks.forEach((pick: any) => {
        if (pick.owner_id && teamAssets[pick.owner_id]) {
          teamAssets[pick.owner_id].picks.push(pick);
          const pickBaseValue = pick.round === 1 ? 5000 : pick.round === 2 ? 2000 : pick.round === 3 ? 800 : 400;
          teamAssets[pick.owner_id].value += pickBaseValue;
        }
      });
    }

    return teamAssets;
  };

  // ─── Trade Card (matches Home.tsx style exactly) ────────────────────

  const TradeCard = ({ tx }: { tx: any }) => {
    const teamAssets = getTradeAssets(tx);
    const teams = tx.teams || [];
    if (teams.length < 2) return null;

    // Determine winner (always pick one, or mark as even if diff is 0)
    const values = teams.map((t: any) => teamAssets[t.rosterId]?.value || 0);
    const diff = values[0] - values[1];
    const winnerId = diff !== 0 ? (diff > 0 ? teams[0].rosterId : teams[1].rosterId) : null;
    const isEvenTrade = diff === 0;

    return (
      <div className="border-b border-[#151515] pb-5 sm:pb-6">
        {/* Trade header */}
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-white text-black text-[10px] font-extrabold tracking-[1px] rounded-sm">TRADE</span>
            <span className="text-xs text-[#555555] flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDate(tx)}
            </span>
          </div>
          {isEvenTrade ? (
            <span className="text-[10px] sm:text-xs text-[#555555] font-medium">Even Trade</span>
          ) : (
            <span className="text-[10px] sm:text-xs text-emerald-400 font-medium">
              {teams.find((t: any) => t.rosterId === winnerId)?.teamName} +{Math.abs(diff).toLocaleString()}
            </span>
          )}
        </div>

        {/* Trade sides */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          {teams.map((team: any) => {
            const assets = teamAssets[team.rosterId] || { players: [], picks: [], value: 0 };
            const isWinner = team.rosterId === winnerId;
            return (
              <div
                key={team.rosterId}
                className={`pl-3 sm:pl-4 border-l-2 ${isWinner ? 'border-l-[#22c55e]' : 'border-l-[#222222]'}`}
              >
                {/* Team name + total */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-bold text-white">{team.teamName}</span>
                    {isWinner && (
                      <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">W</span>
                    )}
                  </div>
                  <span className="text-[10px] text-[#444444]">{assets.value.toLocaleString()} KTC</span>
                </div>

                {/* Assets */}
                <div className="space-y-1">
                  {assets.players.map((playerId: string) => {
                    const player = getPlayer(playerId);
                    const value = getPlayerValue(playerId);
                    return (
                      <div key={playerId} className="flex items-center gap-2 text-[13px]">
                        <img
                          src={`https://sleepercdn.com/content/nfl/players/${playerId}.jpg`}
                          alt=""
                          className="w-5 h-5 rounded-full object-cover bg-[#111111] flex-shrink-0"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                        <span className="text-[#cccccc]">{player?.full_name || playerId}</span>
                        <span className="text-[#444444]">
                          ({player?.position || '?'}{player?.team ? `, ${player.team}` : ''})
                        </span>
                        <span className="text-[#555555] text-[11px]">({value > 0 ? value.toLocaleString() : '0'})</span>
                      </div>
                    );
                  })}
                  {assets.picks.map((pick: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-2 text-[13px]">
                      <div className="w-5 h-5 rounded-full bg-[#111111] flex items-center justify-center flex-shrink-0">
                        <span className="text-[8px] font-bold text-[#555555]">PK</span>
                      </div>
                      <span className="text-[#cccccc]">{pick.season} Round {pick.round}</span>
                      <span className="text-[#555555] text-[11px]">
                        ({pick.round === 1 ? '5,000' : pick.round === 2 ? '2,000' : pick.round === 3 ? '800' : '400'})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ─── Roster Move Card (same editorial style) ──────────────────────

  const RosterMoveCard = ({ tx }: { tx: any }) => {
    const team = tx.teams?.[0];
    const adds = tx.adds ? Object.keys(tx.adds) : [];
    const drops = tx.drops ? Object.keys(tx.drops) : [];

    const addedValue = adds.reduce((sum, playerId) => sum + getPlayerValue(playerId), 0);
    const droppedValue = drops.reduce((sum, playerId) => sum + getPlayerValue(playerId), 0);
    const netValue = addedValue - droppedValue;

    const typeLabel = tx.type === 'free_agent' ? 'FREE AGENT' : tx.type.toUpperCase();
    const typeBadgeClass = tx.type === 'waiver'
      ? 'bg-amber-500/20 text-amber-400'
      : tx.type === 'free_agent'
      ? 'bg-emerald-500/20 text-emerald-400'
      : 'bg-[#111111] text-[#888888]';

    return (
      <div className="border-b border-[#151515] pb-5 sm:pb-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 text-[10px] font-extrabold tracking-[1px] rounded-sm ${typeBadgeClass}`}>
              {typeLabel}
            </span>
            <span className="text-xs text-[#555555] flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDate(tx)}
            </span>
          </div>
          {(addedValue > 0 || droppedValue > 0) && (
            <span className={`text-[10px] sm:text-xs font-medium tabular-nums ${
              netValue > 0 ? 'text-emerald-400' : netValue < 0 ? 'text-red-400' : 'text-[#555555]'
            }`}>
              {netValue > 0 ? '+' : ''}{netValue.toLocaleString()}
            </span>
          )}
        </div>

        {/* Team name */}
        <span className="text-[13px] font-bold text-white block mb-2">{team?.teamName || 'Unknown Team'}</span>

        {/* Rows */}
        <div className="space-y-1">
          {adds.map((playerId) => {
            const player = getPlayer(playerId);
            const value = getPlayerValue(playerId);
            return (
              <div key={playerId} className="flex items-center gap-2 text-[13px]">
                <span className="text-[10px] font-bold text-emerald-400 w-7 flex-shrink-0">ADD</span>
                <img
                  src={`https://sleepercdn.com/content/nfl/players/${playerId}.jpg`}
                  alt=""
                  className="w-5 h-5 rounded-full object-cover bg-[#111111] flex-shrink-0"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
                <span className="text-[#cccccc]">{player?.full_name || playerId}</span>
                <span className="text-[#444444]">
                  ({player?.position || '?'}{player?.team ? `, ${player.team}` : ''})
                </span>
                <span className="text-[#555555] text-[11px]">({value > 0 ? value.toLocaleString() : '0'})</span>
              </div>
            );
          })}
          {drops.map((playerId) => {
            const player = getPlayer(playerId);
            const value = getPlayerValue(playerId);
            return (
              <div key={playerId} className="flex items-center gap-2 text-[13px]">
                <span className="text-[10px] font-bold text-red-400 w-7 flex-shrink-0">DROP</span>
                <img
                  src={`https://sleepercdn.com/content/nfl/players/${playerId}.jpg`}
                  alt=""
                  className="w-5 h-5 rounded-full object-cover bg-[#111111] flex-shrink-0"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
                <span className="text-[#cccccc]">{player?.full_name || playerId}</span>
                <span className="text-[#444444]">
                  ({player?.position || '?'}{player?.team ? `, ${player.team}` : ''})
                </span>
                <span className="text-[#555555] text-[11px]">({value > 0 ? value.toLocaleString() : '0'})</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ─── Render ────────────────────────────────────────────────────────

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      <PageHeader sectionLabel="League" title="Transactions" subtitle="Latest completed trades with KTC value analysis" />

      <div className="flex flex-wrap items-center gap-3 mb-5 sm:mb-6">
        <div className="flex items-center gap-1.5">
          <Filter className="h-4 w-4 text-[#555555]" />
          <select
            value={typeFilter}
            onChange={(e) => handleFilterChange(e.target.value)}
            className="px-3 py-2 bg-[#0a0a0a] border border-[#151515] rounded-md text-xs font-medium focus:outline-none focus:ring-2 focus:ring-accent-500 text-white"
          >
            <option value="all">All Types</option>
            <option value="trade">Trades</option>
            <option value="waiver">Waivers</option>
            <option value="free_agent">Free Agent</option>
            <option value="commissioner">Commissioner</option>
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          <ArrowUpDown className="h-4 w-4 text-[#555555]" />
          <select
            value={sortBy}
            onChange={(e) => handleSortChange(e.target.value)}
            className="px-3 py-2 bg-[#0a0a0a] border border-[#151515] rounded-md text-xs font-medium focus:outline-none focus:ring-2 focus:ring-accent-500 text-white"
          >
            <option value="recent">Most Recent</option>
            <option value="value-high">Highest Value</option>
            <option value="value-low">Lowest Value</option>
            <option value="most-lopsided">Most Lopsided</option>
            <option value="most-even">Most Even</option>
          </select>
        </div>
      </div>

      <div className="space-y-3">
        {paginatedTransactions.map((tx) => (
          tx.type === 'trade' ? (
            <TradeCard key={tx.transaction_id} tx={tx} />
          ) : (
            <RosterMoveCard key={tx.transaction_id} tx={tx} />
          )
        ))}
        {paginatedTransactions.length === 0 && (
          <div className="text-center py-12">
            <p className="text-[#888888]">No transactions found for this filter.</p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-[#555555] order-2 sm:order-1">
            Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filteredAndSortedTransactions.length)} of {filteredAndSortedTransactions.length}
          </p>
          <div className="flex items-center gap-1 order-1 sm:order-2">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="p-2 rounded-md border border-[#151515] bg-[#0a0a0a] hover:bg-[#111111] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="h-4 w-4 text-[#888888]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-2 rounded-md border border-[#151515] bg-[#0a0a0a] hover:bg-[#111111] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-4 w-4 text-[#888888]" />
            </button>

            <div className="flex items-center gap-1">
              {(() => {
                const pages: (number | string)[] = [];
                if (totalPages <= 5) {
                  for (let i = 1; i <= totalPages; i++) pages.push(i);
                } else {
                  pages.push(1);
                  if (currentPage > 3) pages.push('...');
                  const start = Math.max(2, currentPage - 1);
                  const end = Math.min(totalPages - 1, currentPage + 1);
                  for (let i = start; i <= end; i++) {
                    if (!pages.includes(i)) pages.push(i);
                  }
                  if (currentPage < totalPages - 2) pages.push('...');
                  if (!pages.includes(totalPages)) pages.push(totalPages);
                }

                return pages.map((page, idx) => {
                  if (page === '...') {
                    return <span key={`ellipsis-${idx}`} className="px-2 text-[#555555] text-xs">…</span>;
                  }
                  return (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page as number)}
                      className={`min-w-[36px] h-9 px-3 rounded-md text-sm font-medium transition-colors ${
                        currentPage === page
                          ? 'bg-accent-500 text-white'
                          : 'bg-[#0a0a0a] border border-[#151515] text-[#888888] hover:bg-[#111111]'
                      }`}
                    >
                      {page}
                    </button>
                  );
                });
              })()}
            </div>

            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-2 rounded-md border border-[#151515] bg-[#0a0a0a] hover:bg-[#111111] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="h-4 w-4 text-[#888888]" />
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="p-2 rounded-md border border-[#151515] bg-[#0a0a0a] hover:bg-[#111111] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="h-4 w-4 text-[#888888]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
