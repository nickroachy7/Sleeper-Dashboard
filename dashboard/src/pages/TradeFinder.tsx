import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useTradeData } from '../hooks/useLeagueData';
import {
  Search,
  X,
  ChevronDown,
  Loader2,
  ArrowDown,
  ArrowUp,
  User,
  SlidersHorizontal,
} from 'lucide-react';
import {
  analyzeTrade,
  calculateSideValue,
  type TradeAsset as ValueAdjustmentAsset,
} from '../lib/trade-value-adjustment';
import {
  type Roster,
  type TradeAsset,
  type Fairness,
  getPositionBadgeClass,
  useClickOutside,
  buildPicksForRoster,
  getTeamDisplayName,
  getPlayerImageUrl,
  FAIRNESS_CONFIG,
} from '../lib/trade-shared';
// Note: getPositionBadgeClass still used in AssetDropdown modal
import { TeamDropdown } from '../components/TeamDropdown';
import { TradeCard, type TradeSide as TradeCardSide } from '../components/TradeCard';
import { PositionBadge } from '../components/PositionBadge';

// ── Types ──────────────────────────────────────────────────────────

interface TradeScenario {
  give: TradeAsset[];
  get: TradeAsset[];
  giveTotal: number;
  getTotal: number;
  giveAdjusted: number;
  getAdjusted: number;
  difference: number;
  adjustedDifference: number;
  differencePercent: number;
  fairness: Fairness;
  partnerRoster: Roster;
}

type TradeMode = 'dump' | 'acquire';
type AssetPreference = 'all' | 'players' | 'picks';
type MaxPieces = 1 | 2 | 3 | 0; // 0 = any
type PositionFilter = 'QB' | 'RB' | 'WR' | 'TE' | 'PICK';

// ── Multi-Select Asset Modal ───────────────────────────────────────

function AssetDropdown({
  isOpen,
  onClose,
  title,
  items,
  selectedIds,
  onToggle,
  emptyMessage = 'No items available',
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  items: TradeAsset[];
  selectedIds: string[];
  onToggle: (item: TradeAsset) => void;
  emptyMessage?: string;
}) {
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useClickOutside(dropdownRef, onClose);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
    if (!isOpen) setSearch('');
  }, [isOpen]);

  const filteredItems = useMemo(() => {
    if (!search) return items;
    const query = search.toLowerCase();
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(query) ||
        item.position?.toLowerCase().includes(query) ||
        item.team?.toLowerCase().includes(query)
    );
  }, [items, search]);

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40" onClick={onClose} />
      <div
        ref={dropdownRef}
        className="fixed z-50 left-4 right-4 top-1/2 -translate-y-1/2 max-w-md mx-auto bg-[#0a0a0a] border border-[#1e1e1e] rounded-xl shadow-2xl overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-[#151515] flex items-center justify-between">
          <span className="text-sm font-semibold text-white">{title}</span>
          <div className="flex items-center gap-2">
            {selectedIds.length > 0 && (
              <span className="text-xs text-accent-400 font-medium">{selectedIds.length} selected</span>
            )}
            <button onClick={onClose} className="p-1.5 hover:bg-[#151515] rounded-lg transition-colors">
              <X className="h-4 w-4 text-[#666666]" />
            </button>
          </div>
        </div>

        <div className="p-3 border-b border-[#151515]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#555555]" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 text-sm bg-[#111111] border border-[#222222] rounded-lg text-white placeholder-[#555555] focus:outline-none focus:border-accent-500/50 transition-colors"
            />
          </div>
        </div>

        <div className="max-h-80 overflow-y-auto overscroll-contain">
          {filteredItems.length === 0 ? (
            <div className="p-8 text-sm text-[#555555] text-center">{emptyMessage}</div>
          ) : (
            <div className="divide-y divide-[#111111]">
              {filteredItems.map((item) => {
                const isSelected = selectedIds.includes(item.id);
                return (
                  <button
                    key={item.id}
                    onClick={() => onToggle(item)}
                    className={`w-full px-4 py-3 flex items-center justify-between gap-3 transition-colors ${isSelected ? 'bg-accent-500/10' : 'hover:bg-[#111111]'}`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${isSelected ? 'bg-accent-500 border-accent-500' : 'border-[#333333]'}`}>
                        {isSelected && <span className="text-white text-[10px] font-bold">&#10003;</span>}
                      </div>
                      <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded shrink-0 ${getPositionBadgeClass(item.type === 'player' ? (item.position || '') : 'PICK')}`}>
                        {item.type === 'player' ? item.position : 'PICK'}
                      </span>
                      <span className="text-sm text-white truncate">{item.name}</span>
                    </div>
                    <span className="text-xs font-semibold text-accent-400 tabular-nums shrink-0">{item.value.toLocaleString()}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-4 py-3 bg-[#080808] border-t border-[#151515]">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-accent-500 hover:bg-accent-600 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </>
  );
}

// ── Main Component ─────────────────────────────────────────────────

export function TradeFinder() {
  const [tradeMode, setTradeMode] = useState<TradeMode>('dump');
  const [myRoster, setMyRoster] = useState<Roster | null>(null);
  const [targetRoster, setTargetRoster] = useState<Roster | null>(null);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [tolerance, setTolerance] = useState(10);
  const [assetPreference, setAssetPreference] = useState<AssetPreference>('all');
  const [scenarios, setScenarios] = useState<TradeScenario[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState<'myTeam' | 'targetTeam' | 'assets' | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [maxPieces, setMaxPieces] = useState<MaxPieces>(0);
  const [positionFilters, setPositionFilters] = useState<Set<PositionFilter>>(new Set());

  // Clear selected assets only when the asset-source roster changes (or mode flips)
  // In dump mode, assets come from myRoster; in acquire mode, from targetRoster
  const assetSourceId = tradeMode === 'dump' ? myRoster?.roster_id : targetRoster?.roster_id;
  useEffect(() => {
    setSelectedAssetIds([]);
    setScenarios([]);
  }, [tradeMode, assetSourceId]);

  // ── Data ──

  const { rosters, playerValues, pickValues, tradedPicks, isLoading: dataLoading } = useTradeData();

  // ── Derived Data ──

  const getPicksOwnedByRoster = useCallback((rosterId: number): TradeAsset[] => {
    if (!rosters || !pickValues || !tradedPicks) return [];
    return buildPicksForRoster(rosterId, rosters, pickValues, tradedPicks);
  }, [rosters, pickValues, tradedPicks]);

  const getPlayersOwnedByRoster = useCallback((roster: Roster): TradeAsset[] => {
    if (!playerValues) return [];
    const assets: TradeAsset[] = [];
    (roster.players || []).forEach((pid: string) => {
      const pv = playerValues.get(pid);
      if (pv && pv.value > 0) {
        assets.push({
          id: `player-${pid}`,
          type: 'player',
          name: pv.player.full_name,
          value: pv.value,
          position: pv.player.position,
          team: pv.player.team,
        });
      }
    });
    return assets.sort((a, b) => b.value - a.value);
  }, [playerValues]);

  const availableAssets = useMemo(() => {
    const roster = tradeMode === 'dump' ? myRoster : targetRoster;
    if (!roster) return [];
    return [...getPlayersOwnedByRoster(roster), ...getPicksOwnedByRoster(roster.roster_id)];
  }, [tradeMode, myRoster, targetRoster, getPlayersOwnedByRoster, getPicksOwnedByRoster]);

  const selectedAssets = useMemo(() => {
    return availableAssets.filter(a => selectedAssetIds.includes(a.id));
  }, [availableAssets, selectedAssetIds]);

  const selectedValueInfo = useMemo(() => {
    const sideValue = calculateSideValue(selectedAssets as ValueAdjustmentAsset[]);
    return {
      raw: sideValue.rawTotal,
      adjusted: sideValue.adjustedTotal,
      breakdown: sideValue.adjustmentBreakdown,
    };
  }, [selectedAssets]);

  const handleAssetToggle = (asset: TradeAsset) => {
    setSelectedAssetIds(prev =>
      prev.includes(asset.id)
        ? prev.filter(id => id !== asset.id)
        : [...prev, asset.id]
    );
  };

  const removeAsset = (assetId: string) => {
    setSelectedAssetIds(prev => prev.filter(id => id !== assetId));
  };

  const getPreferenceScore = (combo: TradeAsset[], preference: AssetPreference): number => {
    if (preference === 'all') return 50;
    const totalValue = combo.reduce((sum, a) => sum + a.value, 0);
    if (totalValue === 0) return 0;
    const playerValue = combo.filter(a => a.type === 'player').reduce((sum, a) => sum + a.value, 0);
    const pickValue = combo.filter(a => a.type === 'pick').reduce((sum, a) => sum + a.value, 0);
    if (preference === 'players') return Math.round((playerValue / totalValue) * 100);
    if (preference === 'picks') return Math.round((pickValue / totalValue) * 100);
    return 50;
  };

  // ── Search ──

  const findTrades = useCallback(() => {
    if (!rosters || selectedAssets.length === 0) return;

    setIsSearching(true);
    setScenarios([]);

    setTimeout(() => {
      try {
        const adjustedValue = selectedValueInfo.adjusted;
        const minValue = adjustedValue * (1 - tolerance / 100);
        const maxValue = adjustedValue * (1 + tolerance / 100);
        const newScenarios: TradeScenario[] = [];

        const teamsToSearch = tradeMode === 'dump'
          ? rosters.filter(r => r.roster_id !== myRoster?.roster_id)
          : myRoster ? [myRoster] : [];

        teamsToSearch.forEach(searchRoster => {
          const searchAssets = [
            ...getPlayersOwnedByRoster(searchRoster),
            ...getPicksOwnedByRoster(searchRoster.roster_id),
          ];

          // Filter search assets by position if filters are active
          const filteredAssets = positionFilters.size > 0
            ? searchAssets.filter(a => {
                if (a.type === 'pick') return positionFilters.has('PICK');
                return a.position ? positionFilters.has(a.position as PositionFilter) : false;
              })
            : searchAssets;

          // Generate combinations respecting maxPieces
          const combinations: TradeAsset[][] = [];
          if (maxPieces === 0 || maxPieces >= 1) {
            filteredAssets.forEach(a => combinations.push([a]));
          }
          if (maxPieces === 0 || maxPieces >= 2) {
            for (let i = 0; i < filteredAssets.length; i++) {
              for (let j = i + 1; j < filteredAssets.length; j++) {
                combinations.push([filteredAssets[i], filteredAssets[j]]);
              }
            }
          }
          if (maxPieces === 0 || maxPieces >= 3) {
            const topAssets = filteredAssets.slice(0, 25);
            for (let i = 0; i < topAssets.length; i++) {
              for (let j = i + 1; j < topAssets.length; j++) {
                for (let k = j + 1; k < topAssets.length; k++) {
                  combinations.push([topAssets[i], topAssets[j], topAssets[k]]);
                }
              }
            }
          }

          combinations.forEach(combo => {
            const comboValue = calculateSideValue(combo as ValueAdjustmentAsset[]);
            const comboAdjusted = comboValue.adjustedTotal;

            if (comboAdjusted >= minValue && comboAdjusted <= maxValue) {
              const analysis = tradeMode === 'dump'
                ? analyzeTrade(selectedAssets as ValueAdjustmentAsset[], combo as ValueAdjustmentAsset[])
                : analyzeTrade(combo as ValueAdjustmentAsset[], selectedAssets as ValueAdjustmentAsset[]);

              const giveAdjusted = analysis.side1.adjustedTotal;
              const getAdjusted = analysis.side2.adjustedTotal;
              const rawDiff = comboValue.rawTotal - selectedValueInfo.raw;
              const adjustedDiff = getAdjusted - giveAdjusted;
              const diffPercent = giveAdjusted > 0 ? (adjustedDiff / giveAdjusted) * 100 : 0;

              if (tradeMode === 'dump') {
                newScenarios.push({
                  give: selectedAssets,
                  get: combo,
                  giveTotal: selectedValueInfo.raw,
                  getTotal: comboValue.rawTotal,
                  giveAdjusted,
                  getAdjusted,
                  difference: rawDiff,
                  adjustedDifference: adjustedDiff,
                  differencePercent: diffPercent,
                  fairness: analysis.fairness,
                  partnerRoster: searchRoster,
                });
              } else {
                newScenarios.push({
                  give: combo,
                  get: selectedAssets,
                  giveTotal: comboValue.rawTotal,
                  getTotal: selectedValueInfo.raw,
                  giveAdjusted,
                  getAdjusted,
                  difference: -rawDiff,
                  adjustedDifference: -adjustedDiff,
                  differencePercent: -diffPercent,
                  fairness: analysis.fairness,
                  partnerRoster: targetRoster!,
                });
              }
            }
          });
        });

        // Sort: best value match first, with quality tiebreakers
        const maxDiff = Math.max(...newScenarios.map(s => Math.abs(s.adjustedDifference)), 1);

        const scoreScenario = (s: TradeScenario) => {
          const returnCombo = tradeMode === 'dump' ? s.get : s.give;

          // Fairness: how close to even (0 diff = best)
          const fairnessScore = 100 - (Math.abs(s.adjustedDifference) / maxDiff) * 100;

          // Quality: highest single asset value in the return
          const maxAssetValue = Math.max(...returnCombo.map(a => a.value), 0);
          const allMaxValues = newScenarios.flatMap(sc => (tradeMode === 'dump' ? sc.get : sc.give).map(a => a.value));
          const maxPossible = Math.max(...allMaxValues, 1);
          const qualityScore = (maxAssetValue / maxPossible) * 100;

          // Fewer assets = slight bonus (1 = 100, 2 = 66, 3 = 50)
          const concenScore = (1 / returnCombo.length) * 100;

          // Asset preference bonus
          const prefScore = getPreferenceScore(returnCombo, assetPreference);

          if (assetPreference !== 'all') {
            return (fairnessScore * 0.30) + (qualityScore * 0.25) + (concenScore * 0.15) + (prefScore * 0.30);
          }
          return (fairnessScore * 0.40) + (qualityScore * 0.35) + (concenScore * 0.25);
        };

        newScenarios.sort((a, b) => scoreScenario(b) - scoreScenario(a));
        setScenarios(newScenarios.slice(0, 50));
      } finally {
        setIsSearching(false);
      }
    }, 100);
  }, [rosters, myRoster, targetRoster, selectedAssets, selectedValueInfo, tolerance, tradeMode, assetPreference, maxPieces, positionFilters, getPlayersOwnedByRoster, getPicksOwnedByRoster]);

  const isLoading = dataLoading;
  const canSearch = tradeMode === 'dump'
    ? myRoster && selectedAssetIds.length > 0
    : myRoster && targetRoster && selectedAssetIds.length > 0;
  const assetSourceRoster = tradeMode === 'dump' ? myRoster : targetRoster;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-accent-500" />
      </div>
    );
  }

  return (
    <div>
      {/* ── Setup Card ── */}
      <div className="bg-[#0a0a0a] rounded-xl overflow-hidden mb-4">
        {/* Mode Toggle */}
        <div className="flex border-b border-[#151515]">
          <button
            onClick={() => setTradeMode('dump')}
            className={`flex-1 py-3 flex items-center justify-center gap-2 text-sm font-medium transition-all ${
              tradeMode === 'dump'
                ? 'text-accent-400 bg-accent-500/8 border-b-2 border-accent-500 -mb-px'
                : 'text-[#555555] hover:text-[#888888]'
            }`}
          >
            <ArrowUp className="h-4 w-4" />
            Trade Away
          </button>
          <button
            onClick={() => setTradeMode('acquire')}
            className={`flex-1 py-3 flex items-center justify-center gap-2 text-sm font-medium transition-all ${
              tradeMode === 'acquire'
                ? 'text-accent-400 bg-accent-500/8 border-b-2 border-accent-500 -mb-px'
                : 'text-[#555555] hover:text-[#888888]'
            }`}
          >
            <ArrowDown className="h-4 w-4" />
            Acquire
          </button>
        </div>

        {/* Setup Steps */}
        <div className="p-4 space-y-3">
          {/* Step 1: Team selection(s) */}
          {tradeMode === 'dump' ? (
            <button
              onClick={() => setDropdownOpen('myTeam')}
              className="w-full p-3 rounded-lg border border-[#1a1a1a] hover:border-[#333333] transition-colors flex items-center justify-between"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#111111] flex items-center justify-center shrink-0">
                  <User className="h-4 w-4 text-[#555555]" />
                </div>
                <div className="text-left">
                  <span className="text-[10px] text-[#555555] block leading-tight">Your Team</span>
                  <span className={`text-sm font-medium ${myRoster ? 'text-white' : 'text-[#444444]'}`}>
                    {myRoster ? getTeamDisplayName(myRoster) : 'Select...'}
                  </span>
                </div>
              </div>
              <ChevronDown className="h-4 w-4 text-[#444444]" />
            </button>
          ) : (
            <button
              onClick={() => setDropdownOpen('targetTeam')}
              className="w-full p-3 rounded-lg border border-[#1a1a1a] hover:border-[#333333] transition-colors flex items-center justify-between"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#111111] flex items-center justify-center shrink-0">
                  <User className="h-4 w-4 text-[#555555]" />
                </div>
                <div className="text-left">
                  <span className="text-[10px] text-[#555555] block leading-tight">Trade With</span>
                  <span className={`text-sm font-medium ${targetRoster ? 'text-white' : 'text-[#444444]'}`}>
                    {targetRoster ? getTeamDisplayName(targetRoster) : 'Select...'}
                  </span>
                </div>
              </div>
              <ChevronDown className="h-4 w-4 text-[#444444]" />
            </button>
          )}

          {/* Step 2: Asset Selection */}
          {assetSourceRoster && (
            <>
              <button
                onClick={() => setDropdownOpen('assets')}
                className="w-full p-3 rounded-lg border border-[#1a1a1a] hover:border-[#333333] transition-colors flex items-center justify-between"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-[#111111] flex items-center justify-center shrink-0">
                    <Search className="h-4 w-4 text-[#555555]" />
                  </div>
                  <div className="text-left">
                    <span className="text-[10px] text-[#555555] block leading-tight">
                      {tradeMode === 'dump' ? 'Assets to Trade' : 'Assets You Want'}
                    </span>
                    <span className={`text-sm ${selectedAssets.length > 0 ? 'text-white font-medium' : 'text-[#444444]'}`}>
                      {selectedAssets.length > 0 ? `${selectedAssets.length} selected` : 'Select players or picks...'}
                    </span>
                  </div>
                </div>
                <ChevronDown className="h-4 w-4 text-[#444444] shrink-0" />
              </button>

              {/* Selected Assets — ValueWatch-style rows */}
              {selectedAssets.length > 0 && (
                <div className="divide-y divide-[#111111]">
                  {selectedAssets.map(asset => {
                    const playerId = asset.type === 'player' ? asset.id.replace('player-', '') : null;
                    return (
                      <div key={asset.id} className="flex items-center gap-2.5 py-2 group/row">
                        {asset.type === 'player' ? (
                          <img
                            src={getPlayerImageUrl(playerId!)}
                            alt=""
                            className="w-7 h-7 rounded-full object-cover bg-[#111111] shrink-0"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-[#111111] flex items-center justify-center shrink-0">
                            <span className="text-[8px] font-bold text-[#555555]">PK</span>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-semibold text-white truncate">{asset.name}</p>
                          <div className="flex items-center gap-1">
                            <PositionBadge position={asset.type === 'player' ? (asset.position || '?') : 'PICK'} size="xs" />
                            {asset.team && <span className="text-[10px] text-[#444444]">{asset.team}</span>}
                          </div>
                        </div>
                        <span className="text-[12px] font-bold text-white tabular-nums shrink-0">
                          {asset.value > 0 ? asset.value.toLocaleString() : '—'}
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); removeAsset(asset.id); }}
                          className="p-1 rounded opacity-0 group-hover/row:opacity-100 hover:bg-red-500/10 transition-all shrink-0"
                        >
                          <X className="h-3 w-3 text-[#555555] hover:text-red-400" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Value Summary */}
              {selectedAssets.length > 0 && (
                <div className="flex items-center justify-between px-3 py-2 bg-accent-500/8 rounded-lg">
                  <span className="text-xs text-[#888888]">Adjusted Value</span>
                  <span className="text-sm font-bold text-accent-400 tabular-nums">
                    {selectedValueInfo.adjusted.toLocaleString()}
                    {selectedValueInfo.raw !== selectedValueInfo.adjusted && (
                      <span className="text-[10px] text-[#555555] font-normal ml-1.5">
                        (raw {selectedValueInfo.raw.toLocaleString()})
                      </span>
                    )}
                  </span>
                </div>
              )}
            </>
          )}

          {/* Step 3 (acquire only): Your team */}
          {tradeMode === 'acquire' && targetRoster && (
            <button
              onClick={() => setDropdownOpen('myTeam')}
              className="w-full p-3 rounded-lg border border-[#1a1a1a] hover:border-[#333333] transition-colors flex items-center justify-between"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#111111] flex items-center justify-center shrink-0">
                  <User className="h-4 w-4 text-[#555555]" />
                </div>
                <div className="text-left">
                  <span className="text-[10px] text-[#555555] block leading-tight">Your Team</span>
                  <span className={`text-sm font-medium ${myRoster ? 'text-white' : 'text-[#444444]'}`}>
                    {myRoster ? getTeamDisplayName(myRoster) : 'Select...'}
                  </span>
                </div>
              </div>
              <ChevronDown className="h-4 w-4 text-[#444444]" />
            </button>
          )}
        </div>

        {/* Filters Row */}
        <div className="border-t border-[#151515]">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="w-full px-4 py-2.5 flex items-center justify-between text-xs text-[#555555] hover:text-[#888888] transition-colors"
          >
            <div className="flex items-center gap-1.5">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>Filters</span>
              {(assetPreference !== 'all' || tolerance !== 10 || maxPieces !== 0 || positionFilters.size > 0) && (
                <span className="px-1.5 py-0.5 bg-accent-500/15 text-accent-400 rounded text-[10px] font-medium">
                  {[
                    assetPreference !== 'all' ? assetPreference : '',
                    tolerance !== 10 ? `±${tolerance}%` : '',
                    maxPieces !== 0 ? `max ${maxPieces}` : '',
                    positionFilters.size > 0 ? [...positionFilters].join('/') : '',
                  ].filter(Boolean).join(' · ')}
                </span>
              )}
            </div>
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </button>

          {showFilters && (
            <div className="px-4 pb-4 pt-1 space-y-4">
              {/* Row 1: Max return pieces + Tolerance */}
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <span className="text-[10px] font-semibold text-[#555555] uppercase tracking-wider block mb-1.5">
                    Max Return Pieces
                  </span>
                  <div className="flex gap-1">
                    {([0, 1, 2, 3] as MaxPieces[]).map(n => (
                      <button
                        key={n}
                        onClick={() => setMaxPieces(n)}
                        className={`flex-1 py-1.5 px-2 rounded-md text-xs font-medium transition-all ${
                          maxPieces === n
                            ? 'bg-accent-500/15 text-accent-400'
                            : 'text-[#555555] hover:text-[#888888] hover:bg-[#111111]'
                        }`}
                      >
                        {n === 0 ? 'Any' : `${n}`}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="sm:w-40">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-semibold text-[#555555] uppercase tracking-wider">Tolerance</span>
                    <span className="text-xs font-bold text-accent-400 tabular-nums">&plusmn;{tolerance}%</span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={25}
                    step={5}
                    value={tolerance}
                    onChange={(e) => setTolerance(Number(e.target.value))}
                    className="w-full h-1.5 bg-[#222222] rounded-full appearance-none cursor-pointer accent-accent-500"
                  />
                </div>
              </div>

              {/* Row 2: Position filter + Asset type */}
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <span className="text-[10px] font-semibold text-[#555555] uppercase tracking-wider block mb-1.5">
                    Positions
                  </span>
                  <div className="flex gap-1">
                    {(['QB', 'RB', 'WR', 'TE', 'PICK'] as PositionFilter[]).map(pos => {
                      const isActive = positionFilters.has(pos);
                      const colors: Record<string, string> = {
                        QB: isActive ? 'bg-red-500/15 text-red-400' : '',
                        RB: isActive ? 'bg-blue-500/15 text-blue-400' : '',
                        WR: isActive ? 'bg-green-500/15 text-green-400' : '',
                        TE: isActive ? 'bg-teal-500/15 text-teal-400' : '',
                        PICK: isActive ? 'bg-amber-500/15 text-amber-400' : '',
                      };
                      return (
                        <button
                          key={pos}
                          onClick={() => {
                            setPositionFilters(prev => {
                              const next = new Set(prev);
                              if (next.has(pos)) next.delete(pos);
                              else next.add(pos);
                              return next;
                            });
                          }}
                          className={`flex-1 py-1.5 px-2 rounded-md text-xs font-medium transition-all ${
                            isActive
                              ? colors[pos]
                              : 'text-[#555555] hover:text-[#888888] hover:bg-[#111111]'
                          }`}
                        >
                          {pos}
                        </button>
                      );
                    })}
                  </div>
                  {positionFilters.size === 0 && (
                    <span className="text-[10px] text-[#333333] mt-1 block">All positions shown when none selected</span>
                  )}
                </div>

                <div className="sm:w-40">
                  <span className="text-[10px] font-semibold text-[#555555] uppercase tracking-wider block mb-1.5">
                    {tradeMode === 'dump' ? 'Prefer to receive' : 'Prefer to give up'}
                  </span>
                  <div className="flex gap-1">
                    {(['all', 'players', 'picks'] as AssetPreference[]).map(pref => (
                      <button
                        key={pref}
                        onClick={() => setAssetPreference(pref)}
                        className={`flex-1 py-1.5 px-2 rounded-md text-xs font-medium transition-all ${
                          assetPreference === pref
                            ? 'bg-accent-500/15 text-accent-400'
                            : 'text-[#555555] hover:text-[#888888] hover:bg-[#111111]'
                        }`}
                      >
                        {pref === 'all' ? 'Any' : pref === 'players' ? 'Plyr' : 'Pick'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Search Button */}
      <button
        onClick={findTrades}
        disabled={!canSearch || isSearching}
        className={`w-full py-3.5 rounded-xl font-semibold text-white text-sm transition-all flex items-center justify-center gap-2 mt-3 ${
          canSearch && !isSearching
            ? 'bg-accent-500 hover:bg-accent-600 shadow-[0_0_20px_rgba(34,197,94,0.15)]'
            : 'bg-[#1a1a1a] text-[#444444] cursor-not-allowed'
        }`}
      >
        {isSearching ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Searching...
          </>
        ) : (
          <>
            <Search className="h-4 w-4" />
            Find Trades
          </>
        )}
      </button>

      {/* ── Results ── */}
      {scenarios.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-white">
              Trade Scenarios
            </h2>
            <span className="text-xs text-[#555555] tabular-nums">
              {scenarios.length} found
            </span>
          </div>

          <div className="space-y-3">
            {scenarios.map((scenario, idx) => {
              const myTeamName = myRoster ? getTeamDisplayName(myRoster) : 'My Team';
              const partnerTeamName = getTeamDisplayName(scenario.partnerRoster);
              const config = FAIRNESS_CONFIG[scenario.fairness];

              // Map scenario assets to TradeCard format
              const mapAssets = (assets: TradeAsset[]) => {
                const players = assets
                  .filter(a => a.type === 'player')
                  .map(a => ({
                    id: a.id.replace('player-', ''),
                    name: a.name,
                    position: a.position || '?',
                    team: a.team || null,
                    value: a.value,
                  }));
                const picks = assets
                  .filter(a => a.type === 'pick')
                  .map(a => ({
                    season: a.name.split(' ')[0] || '',
                    round: parseInt(a.name.match(/Round (\d)/)?.[1] || '1'),
                    value: a.value,
                  }));
                return { players, picks };
              };

              const myAssets = mapAssets(scenario.get);
              const partnerAssets = mapAssets(scenario.give);

              const sides: TradeCardSide[] = [
                {
                  teamName: myTeamName,
                  players: myAssets.players,
                  picks: myAssets.picks,
                  totalValue: scenario.getAdjusted,
                },
                {
                  teamName: partnerTeamName,
                  players: partnerAssets.players,
                  picks: partnerAssets.picks,
                  totalValue: scenario.giveAdjusted,
                },
              ];

              return (
                <TradeCard
                  key={idx}
                  sides={sides}
                  fairnessLabel={config.label}
                  fairnessBadge={config.badge}
                />
              );
            })}
          </div>
        </div>
      )}

      {scenarios.length === 0 && selectedAssets.length > 0 && !isSearching && (
        <div className="mt-6 py-8 text-center">
          <p className="text-sm text-[#444444]">
            Hit "Find Trades" to discover matching scenarios
          </p>
        </div>
      )}

      {/* Dropdowns */}
      <TeamDropdown
        isOpen={dropdownOpen === 'myTeam'}
        onClose={() => setDropdownOpen(null)}
        title="Select Your Team"
        rosters={rosters || []}
        excludeRosterIds={targetRoster ? [targetRoster.roster_id] : []}
        onSelect={(roster) => setMyRoster(roster)}
      />
      <TeamDropdown
        isOpen={dropdownOpen === 'targetTeam'}
        onClose={() => setDropdownOpen(null)}
        title="Select Team to Trade With"
        rosters={rosters || []}
        excludeRosterIds={myRoster ? [myRoster.roster_id] : []}
        onSelect={(roster) => setTargetRoster(roster)}
      />
      <AssetDropdown
        isOpen={dropdownOpen === 'assets'}
        onClose={() => setDropdownOpen(null)}
        title={tradeMode === 'dump' ? 'Select Assets to Trade Away' : 'Select Assets You Want'}
        items={availableAssets}
        selectedIds={selectedAssetIds}
        onToggle={handleAssetToggle}
        emptyMessage="No players or picks available"
      />
    </div>
  );
}
