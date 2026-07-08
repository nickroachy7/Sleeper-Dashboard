import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import {
  ArrowRightLeft,
  Clock,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useMemo, useCallback } from 'react';
import { PageHeader } from '../components/PageHeader';
import { Pagination } from '../components/Pagination';
import { FilterBar, FilterPills, SortSelect } from '../components/FilterBar';

import { usePlayerMap } from '../hooks/useLeagueData';
import { usePlayerValuesList, usePickValues } from '../hooks/queries';
import { TradeCard as SharedTradeCard, type TradeSide } from '../components/TradeCard';
import { AssetRow } from '../components/AssetRow';
import { analyzeTrade } from '../lib/trade-value-adjustment';
import type { TradeAsset } from '../types/domain';
import {
  lookupPickValue,
  getProjectedPickSlot,
  getPickSlotDisplayName,
  playerMoves,
  txDraftPicks,
  type TxDraftPick,
} from '../lib/trade-shared';
import type { Roster, TransactionRow } from '../types/domain';

interface TradeTeam {
  rosterId: number;
  teamName: string;
  ownerName: string;
}

type TransactionWithTeams = TransactionRow & { teams: TradeTeam[] };

const ITEMS_PER_PAGE = 50;

export default function Transactions() {
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('recent');
  const [currentPage, setCurrentPage] = useState(1);

  const { data: players } = usePlayerMap();
  const { data: playerValues } = usePlayerValuesList();
  const { data: pickValuesData } = usePickValues();

  const { data: txData, isLoading } = useQuery({
    queryKey: ['transactions'],
    queryFn: async () => {
      let allTransactions: TransactionRow[] = [];
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

      if (!allTransactions.length) return { transactions: [] as TransactionWithTeams[], rosters: [] as Roster[] };

      const rosterToOwner = new Map<number, string>();
      const rosterList: Roster[] = (rosters || []).map((r) => ({
        roster_id: r.roster_id,
        owner_id: r.owner_id || '',
        players: r.players || [],
        wins: r.wins || 0,
        losses: r.losses || 0,
        fpts: Number(r.fpts) || 0,
        ownerName: '',
        teamName: null,
      }));
      rosters?.forEach((r) => {
        if (r.owner_id) rosterToOwner.set(r.roster_id, r.owner_id);
      });

      const txList = allTransactions.map((tx): TransactionWithTeams => {
        const rosterOwners = tx.roster_ids?.map((rosterId) => {
          const ownerId = rosterToOwner.get(rosterId);
          const owner = users?.find((u) => u.user_id === ownerId);
          const leagueUser = leagueUsers?.find((lu) => lu.user_id === ownerId);
          return {
            rosterId,
            teamName: leagueUser?.team_name || leagueUser?.display_name || owner?.display_name || `Team ${rosterId}`,
            ownerName: owner?.display_name || owner?.username || 'Unknown'
          };
        }) || [];

        return { ...tx, teams: rosterOwners };
      }).sort((a, b) => {
        const getTimestamp = (tx: TransactionWithTeams): number => {
          if (tx.created) return tx.created;
          if (tx.status_updated) return tx.status_updated;
          if (tx.created_at) return new Date(tx.created_at).getTime();
          return 0;
        };
        return getTimestamp(b) - getTimestamp(a);
      });
      return { transactions: txList, rosters: rosterList };
    },
  });

  const transactions = txData?.transactions;
  const leagueRosters = useMemo(() => txData?.rosters || [], [txData]);
  const leagueSize = leagueRosters.length;

  const getPlayer = useCallback(
    (playerId: string) => players instanceof Map ? players.get(playerId) : undefined,
    [players]
  );
  const getPlayerValue = useCallback(
    (playerId: string): number => (playerValues instanceof Map ? playerValues.get(playerId) : 0) || 0,
    [playerValues]
  );

  const currentDraftYear = new Date().getFullYear().toString();

  /** Resolve pick value and display name from roster standings.
   *  Only the current draft year gets slot-specific labels (e.g. "2026 Pick 1.03").
   *  Future years use tier labels (e.g. "2027 Early 1st"). */
  const resolvePickSlotAndValue = useCallback((pick: TxDraftPick) => {
    const isCurrentYear = pick.season === currentDraftYear;
    if (isCurrentYear && leagueSize > 0) {
      const slot = getProjectedPickSlot(pick.roster_id, leagueRosters);
      const value = lookupPickValue(pickValuesData || [], pick.season, pick.round, { slot, leagueSize });
      const name = getPickSlotDisplayName(pick.season, pick.round, slot);
      return { value, name };
    }
    // Future years: tier-based
    const value = lookupPickValue(pickValuesData || [], pick.season, pick.round);
    const name = `${pick.season} Round ${pick.round}`;
    return { value, name };
  }, [currentDraftYear, leagueSize, leagueRosters, pickValuesData]);

  /** Group a trade's adds and picks by receiving roster. */
  const getTradeAssets = useCallback((tx: TransactionWithTeams) => {
    const teamAssets: Record<number, { players: string[]; picks: TxDraftPick[]; value: number }> = {};

    tx.teams?.forEach((team) => {
      teamAssets[team.rosterId] = { players: [], picks: [], value: 0 };
    });

    Object.entries(playerMoves(tx.adds)).forEach(([playerId, rosterId]) => {
      if (teamAssets[rosterId]) {
        teamAssets[rosterId].players.push(playerId);
        teamAssets[rosterId].value += getPlayerValue(playerId);
      }
    });

    txDraftPicks(tx.draft_picks).forEach((pick) => {
      if (pick.owner_id && teamAssets[pick.owner_id]) {
        const resolved = resolvePickSlotAndValue(pick);
        teamAssets[pick.owner_id].picks.push({ ...pick, resolvedValue: resolved.value, resolvedName: resolved.name });
        teamAssets[pick.owner_id].value += resolved.value;
      }
    });

    return teamAssets;
  }, [getPlayerValue, resolvePickSlotAndValue]);

  // Stats
  const typeCounts = useMemo(() => {
    if (!transactions) return { trades: 0, waivers: 0, freeAgent: 0 };
    return {
      trades: transactions.filter((t) => t.type === 'trade').length,
      waivers: transactions.filter((t) => t.type === 'waiver').length,
      freeAgent: transactions.filter((t) => t.type === 'free_agent').length,
    };
  }, [transactions]);

  const filteredAndSortedTransactions = useMemo(() => {
    if (!transactions) return [];

    const getTransactionValueMetrics = (tx: TransactionWithTeams) => {
      if (tx.type === 'trade') {
        // Build TradeAsset arrays per side for adjusted analysis
        const teams = tx.teams || [];
        const tradeAssets = getTradeAssets(tx);
        const sideAssetArrays: TradeAsset[][] = teams.map((team) => {
          const assets = tradeAssets[team.rosterId] || { players: [], picks: [], value: 0 };
          const result: TradeAsset[] = [];
          assets.players.forEach((playerId: string) => {
            const player = players instanceof Map ? players.get(playerId) : undefined;
            result.push({
              id: `player-${playerId}`,
              type: 'player',
              name: player?.full_name || playerId,
              value: playerValues?.get(playerId) || 0,
              position: player?.position || '?',
              team: player?.team || null,
            });
          });
          assets.picks.forEach((pick) => {
            const resolved = resolvePickSlotAndValue(pick);
            result.push({
              id: `pick-${pick.season}-${pick.round}-${pick.roster_id}`,
              type: 'pick',
              name: resolved.name,
              value: resolved.value,
            });
          });
          return result;
        });

        if (sideAssetArrays.length >= 2) {
          const analysis = analyzeTrade(sideAssetArrays[0], sideAssetArrays[1]);
          const totalValue = analysis.side1.adjustedTotal + analysis.side2.adjustedTotal;
          return { totalValue, valueDiff: analysis.adjustedDifference, maxTeamGain: analysis.adjustedDifference };
        }

        return { totalValue: 0, valueDiff: 0, maxTeamGain: 0 };
      } else {
        const adds = Object.keys(playerMoves(tx.adds));
        const drops = Object.keys(playerMoves(tx.drops));

        const addedValue = adds.reduce((sum: number, playerId: string) => sum + (playerValues?.get(playerId) || 0), 0);
        const droppedValue = drops.reduce((sum: number, playerId: string) => sum + (playerValues?.get(playerId) || 0), 0);

        return {
          totalValue: addedValue + droppedValue,
          valueDiff: Math.abs(addedValue - droppedValue),
          maxTeamGain: addedValue - droppedValue
        };
      }
    };

    const filtered = typeFilter === 'all'
      ? transactions
      : transactions.filter((tx) => tx.type === typeFilter);

    if (sortBy === 'recent') return filtered;

    return [...filtered].sort((a, b) => {
      const metricsA = getTransactionValueMetrics(a);
      const metricsB = getTransactionValueMetrics(b);

      switch (sortBy) {
        case 'value-high': return metricsB.totalValue - metricsA.totalValue;
        case 'value-low': return metricsA.totalValue - metricsB.totalValue;
        case 'most-lopsided': return metricsB.valueDiff - metricsA.valueDiff;
        case 'most-even': return metricsA.valueDiff - metricsB.valueDiff;
        default: return 0;
      }
    });
  }, [transactions, typeFilter, sortBy, playerValues, players, getTradeAssets, resolvePickSlotAndValue]);

  const totalPages = Math.ceil(filteredAndSortedTransactions.length / ITEMS_PER_PAGE);
  const paginatedTransactions = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredAndSortedTransactions.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredAndSortedTransactions, currentPage]);

  const handleFilterChange = (newFilter: string) => { setTypeFilter(newFilter); setCurrentPage(1); };
  const handleSortChange = (newSort: string) => { setSortBy(newSort); setCurrentPage(1); };

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
        <div className="space-y-4 mt-12">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-[#141419] rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="skeleton w-16 h-5" />
                <div className="skeleton w-20 h-4" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="skeleton w-28 h-4" />
                  <div className="skeleton w-36 h-3" />
                  <div className="skeleton w-32 h-3" />
                </div>
                <div className="space-y-2">
                  <div className="skeleton w-28 h-4" />
                  <div className="skeleton w-36 h-3" />
                  <div className="skeleton w-32 h-3" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!transactions?.length) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 bg-[#1b1b22] rounded-2xl flex items-center justify-center mb-4">
            <ArrowRightLeft className="h-7 w-7 text-[#75757f]" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">No Transactions</h3>
          <p className="text-sm text-[#80808c] max-w-sm mb-6">
            Connect your league to see trades, waivers, and roster moves
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

  const txDate = (tx: TransactionWithTeams) => {
    const timestamp = tx.created || tx.status_updated;
    return timestamp ? new Date(timestamp) : new Date(tx.created_at ?? 0);
  };

  const formatDate = (tx: TransactionWithTeams) =>
    txDate(tx).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const getDateGroup = (tx: TransactionWithTeams) =>
    txDate(tx).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // ─── Trade Card (uses shared component) ────────────────────────────

  const TradeCard = ({ tx }: { tx: TransactionWithTeams }) => {
    const teamAssets = getTradeAssets(tx);
    const teams = tx.teams || [];
    if (teams.length < 2) return null;

    // Build TradeAsset arrays for value adjustment analysis
    const sideAssets: TradeAsset[][] = teams.map((team) => {
      const assets = teamAssets[team.rosterId] || { players: [], picks: [], value: 0 };
      const tradeAssets: TradeAsset[] = [];
      assets.players.forEach((playerId: string) => {
        const player = getPlayer(playerId);
        tradeAssets.push({
          id: `player-${playerId}`,
          type: 'player',
          name: player?.full_name || playerId,
          value: getPlayerValue(playerId),
          position: player?.position || '?',
          team: player?.team || null,
        });
      });
      assets.picks.forEach((pick) => {
        tradeAssets.push({
          id: `pick-${pick.season}-${pick.round}-${pick.roster_id}`,
          type: 'pick',
          name: pick.resolvedName || `${pick.season} Round ${pick.round}`,
          value: pick.resolvedValue ?? lookupPickValue(pickValuesData || [], pick.season, pick.round),
        });
      });
      return tradeAssets;
    });

    // Run the value adjustment analysis
    const analysis = sideAssets.length >= 2 ? analyzeTrade(sideAssets[0], sideAssets[1]) : null;

    // Convert to shared TradeSide format with adjusted values
    const sides: TradeSide[] = teams.map((team, idx) => {
      const assets = teamAssets[team.rosterId] || { players: [], picks: [], value: 0 };
      const sideResult = analysis ? (idx === 0 ? analysis.side1 : analysis.side2) : null;
      return {
        rosterId: team.rosterId,
        teamName: team.teamName,
        players: assets.players.map((playerId: string) => {
          const player = getPlayer(playerId);
          return {
            id: playerId,
            name: player?.full_name || playerId,
            position: player?.position || '?',
            team: player?.team || null,
            value: getPlayerValue(playerId),
          };
        }),
        picks: assets.picks.map((pick) => ({
          season: pick.season,
          round: pick.round,
          name: pick.resolvedName,
          value: pick.resolvedValue ?? lookupPickValue(pickValuesData || [], pick.season, pick.round),
        })),
        totalValue: assets.value,
        adjustedValue: sideResult?.adjustedTotal,
      };
    });

    return (
      <Link to={`/trades/${tx.transaction_id}`} className="block group">
        <SharedTradeCard
          sides={sides}
          date={formatDate(tx)}
          fairness={analysis?.fairness}
        />
      </Link>
    );
  };

  // ─── Roster Move Card (compact) ──────────────────────────────────

  const RosterMoveCard = ({ tx }: { tx: TransactionWithTeams }) => {
    const team = tx.teams?.[0];
    const adds = Object.keys(playerMoves(tx.adds));
    const drops = Object.keys(playerMoves(tx.drops));

    const addedValue = adds.reduce((sum, playerId) => sum + getPlayerValue(playerId), 0);
    const droppedValue = drops.reduce((sum, playerId) => sum + getPlayerValue(playerId), 0);
    const netValue = addedValue - droppedValue;

    const typeLabel = tx.type === 'free_agent' ? 'FREE AGENT' : tx.type === 'waiver' ? 'WAIVER' : tx.type.toUpperCase();
    return (
      <div className="bg-[#141419] rounded-2xl overflow-hidden animate-smooth border border-[#22222b] card-hover">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-2 text-[11px] text-[#75757f]">
            <span className="px-1.5 py-0.5 bg-[#22222b] text-[#9c9ca7] text-[9px] font-bold tracking-[1px] rounded">
              {typeLabel}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDate(tx)}
            </span>
          </div>
          {(addedValue > 0 || droppedValue > 0) && (
            <span className={`text-[11px] font-bold tabular-nums ${
              netValue > 0 ? 'text-accent-400' : netValue < 0 ? 'text-red-400' : 'text-[#75757f]'
            }`}>
              {netValue > 0 ? '+' : netValue < 0 ? '−' : ''}{Math.abs(netValue).toLocaleString()}
            </span>
          )}
        </div>

        {/* Team + Assets */}
        <div className="border-t border-[#1b1b22]">
          <div className="flex items-center gap-2 px-4 pt-3 pb-1">
            <span className="font-display text-sm font-bold text-white truncate">{team?.teamName || 'Unknown'}</span>
            <span className="text-[10px] text-[#60606a]">
              {adds.length + drops.length} move{adds.length + drops.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="pb-1.5">
            {adds.map((pid) => {
              const p = getPlayer(pid);
              const val = getPlayerValue(pid);
              return (
                <AssetRow
                  key={pid}
                  playerId={pid}
                  name={p?.full_name || pid}
                  position={p?.position}
                  team={p?.team}
                  value={val}
                  prefix={<span className="text-accent-400 font-bold text-[13px]">+</span>}
                  className="px-4"
                />
              );
            })}
            {drops.map((pid) => {
              const p = getPlayer(pid);
              const val = getPlayerValue(pid);
              return (
                <AssetRow
                  key={pid}
                  playerId={pid}
                  name={p?.full_name || pid}
                  position={p?.position}
                  team={p?.team}
                  value={val}
                  prefix={<span className="text-red-400 font-bold text-[13px]">−</span>}
                  className="px-4"
                />
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  // ─── Render ────────────────────────────────────────────────────────

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
      <PageHeader
        sectionLabel="League"
        title="Transactions"
        subtitle="Trades, waivers, and roster moves with KTC analysis"
        stats={
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-[#75757f] bg-[#141419] px-2 py-1 rounded-md">
              {typeCounts.trades} trades
            </span>
            <span className="text-[11px] text-[#75757f] bg-[#141419] px-2 py-1 rounded-md">
              {typeCounts.waivers} waivers
            </span>
            <span className="text-[11px] text-[#75757f] bg-[#141419] px-2 py-1 rounded-md">
              {typeCounts.freeAgent} free agent
            </span>
          </div>
        }
      />

      <FilterBar sticky>
        <FilterPills
          options={[
            { value: 'all', label: 'All' },
            { value: 'trade', label: 'Trades' },
            { value: 'waiver', label: 'Waivers' },
            { value: 'free_agent', label: 'Free Agent' },
            { value: 'commissioner', label: 'Commissioner' },
          ]}
          selected={typeFilter}
          onChange={handleFilterChange}
        />
        <SortSelect
          value={sortBy}
          onChange={handleSortChange}
          options={[
            { value: 'recent', label: 'Most Recent' },
            { value: 'value-high', label: 'Highest Value' },
            { value: 'value-low', label: 'Lowest Value' },
            { value: 'most-lopsided', label: 'Most Lopsided' },
            { value: 'most-even', label: 'Most Even' },
          ]}
        />
      </FilterBar>

      <div className="space-y-3">
        {paginatedTransactions.map((tx, i) => {
          const dateGroup = getDateGroup(tx);
          const prevDateGroup = i > 0 ? getDateGroup(paginatedTransactions[i - 1]) : null;
          const showDateHeader = sortBy === 'recent' && dateGroup !== prevDateGroup;

          return (
            <div key={tx.transaction_id}>
              {showDateHeader && (
                <div className="sticky top-[calc(56px+env(safe-area-inset-top))] lg:top-12 z-[5] py-2 -mx-1 px-1">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold text-[#75757f] tracking-[2px] uppercase whitespace-nowrap">
                      {dateGroup}
                    </span>
                    <div className="flex-1 h-px bg-[#2a2a34]" />
                  </div>
                </div>
              )}
              {tx.type === 'trade' ? (
                <TradeCard tx={tx} />
              ) : (
                <RosterMoveCard tx={tx} />
              )}
            </div>
          );
        })}
        {paginatedTransactions.length === 0 && (
          <div className="text-center py-12">
            <p className="text-sm text-[#75757f]">No transactions found for this filter.</p>
          </div>
        )}
      </div>

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={filteredAndSortedTransactions.length}
        itemsPerPage={ITEMS_PER_PAGE}
        onPageChange={(page) => { setCurrentPage(page); window.scrollTo({ top: 0 }); }}
      />
    </div>
  );
}
