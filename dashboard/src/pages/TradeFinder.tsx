import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useTradeData } from '../hooks/useLeagueData';
import {
  Search,
  X,
  ChevronDown,
  Loader2,
  ArrowDown,
  ArrowUp,
  Plus,
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
} from '../lib/trade-shared';
// Note: getPositionBadgeClass still used in AssetDropdown modal
import { TeamDropdown } from '../components/TeamDropdown';
import { TradeCard, type TradeSide as TradeCardSide } from '../components/TradeCard';
import { AssetRow } from '../components/AssetRow';

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
        const newScenarios: TradeScenario[] = [];
        const selectedIds = new Set(selectedAssets.map(a => a.id));

        // Build "give" packages: the selected assets + optionally 1-2 extras from my roster
        // This lets users find trades where they add sweeteners to unlock bigger targets
        const givePackages: TradeAsset[][] = [selectedAssets];

        if (tradeMode === 'dump' && myRoster) {
          const myExtras = [
            ...getPlayersOwnedByRoster(myRoster),
            ...getPicksOwnedByRoster(myRoster.roster_id),
          ].filter(a => !selectedIds.has(a.id)).slice(0, 8); // top 8 extras by value

          // selected + 1 extra
          myExtras.forEach(extra => {
            givePackages.push([...selectedAssets, extra]);
          });
        }

        const teamsToSearch = tradeMode === 'dump'
          ? targetRoster
            ? rosters.filter(r => r.roster_id === targetRoster.roster_id)
            : rosters.filter(r => r.roster_id !== myRoster?.roster_id)
          : myRoster ? [myRoster] : [];

        // Pre-compute return combos per team (expensive, only do once)
        const seenTradeKeys = new Set<string>();
        const teamCombos = new Map<number, { combo: TradeAsset[]; value: ReturnType<typeof calculateSideValue> }[]>();

        teamsToSearch.forEach(searchRoster => {
          const searchAssets = [
            ...getPlayersOwnedByRoster(searchRoster),
            ...getPicksOwnedByRoster(searchRoster.roster_id),
          ];

          const filteredAssets = positionFilters.size > 0
            ? searchAssets.filter(a => {
                if (a.type === 'pick') return positionFilters.has('PICK');
                return a.position ? positionFilters.has(a.position as PositionFilter) : false;
              })
            : searchAssets;

          const combinations: { combo: TradeAsset[]; value: ReturnType<typeof calculateSideValue> }[] = [];
          const addCombo = (c: TradeAsset[]) => {
            const v = calculateSideValue(c as ValueAdjustmentAsset[]);
            combinations.push({ combo: c, value: v });
          };

          if (maxPieces === 0 || maxPieces >= 1) {
            filteredAssets.forEach(a => addCombo([a]));
          }
          if (maxPieces === 0 || maxPieces >= 2) {
            for (let i = 0; i < filteredAssets.length; i++) {
              for (let j = i + 1; j < filteredAssets.length; j++) {
                addCombo([filteredAssets[i], filteredAssets[j]]);
              }
            }
          }
          if (maxPieces === 0 || maxPieces >= 3) {
            const topAssets = filteredAssets.slice(0, 25);
            for (let i = 0; i < topAssets.length; i++) {
              for (let j = i + 1; j < topAssets.length; j++) {
                for (let k = j + 1; k < topAssets.length; k++) {
                  addCombo([topAssets[i], topAssets[j], topAssets[k]]);
                }
              }
            }
          }

          teamCombos.set(searchRoster.roster_id, combinations);
        });

        // Match each give package against pre-computed return combos
        givePackages.forEach(givePkg => {
          const giveValue = calculateSideValue(givePkg as ValueAdjustmentAsset[]);
          const giveAdjusted = giveValue.adjustedTotal;
          const minValue = giveAdjusted * (1 - tolerance / 100);
          const maxValue = giveAdjusted * (1 + tolerance / 100);

          teamsToSearch.forEach(searchRoster => {
            const combinations = teamCombos.get(searchRoster.roster_id) || [];

            combinations.forEach(({ combo, value: comboValue }) => {
              const comboAdjusted = comboValue.adjustedTotal;

              if (comboAdjusted >= minValue && comboAdjusted <= maxValue) {
                // Deduplicate: same give+get asset IDs = same trade
                const giveIds = givePkg.map(a => a.id).sort().join(',');
                const getIds = combo.map(a => a.id).sort().join(',');
                const tradeKey = `${giveIds}|${getIds}|${searchRoster.roster_id}`;
                if (seenTradeKeys.has(tradeKey)) return;
                seenTradeKeys.add(tradeKey);

                const analysis = tradeMode === 'dump'
                  ? analyzeTrade(givePkg as ValueAdjustmentAsset[], combo as ValueAdjustmentAsset[])
                  : analyzeTrade(combo as ValueAdjustmentAsset[], selectedAssets as ValueAdjustmentAsset[]);

                const side1Adjusted = analysis.side1.adjustedTotal;
                const side2Adjusted = analysis.side2.adjustedTotal;
                const rawDiff = comboValue.rawTotal - giveValue.rawTotal;
                const adjustedDiff = side2Adjusted - side1Adjusted;
                const diffPercent = side1Adjusted > 0 ? (adjustedDiff / side1Adjusted) * 100 : 0;

                if (tradeMode === 'dump') {
                  newScenarios.push({
                    give: givePkg,
                    get: combo,
                    giveTotal: giveValue.rawTotal,
                    getTotal: comboValue.rawTotal,
                    giveAdjusted: side1Adjusted,
                    getAdjusted: side2Adjusted,
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
                    giveAdjusted: side1Adjusted,
                    getAdjusted: side2Adjusted,
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
        });

        // Pre-compute sort metrics (avoid spreading 50K+ items)
        let maxDiff = 1;
        let maxPossibleAssetValue = 1;
        for (const s of newScenarios) {
          const d = Math.abs(s.adjustedDifference);
          if (d > maxDiff) maxDiff = d;
          const returnCombo = tradeMode === 'dump' ? s.get : s.give;
          for (const a of returnCombo) {
            if (a.value > maxPossibleAssetValue) maxPossibleAssetValue = a.value;
          }
        }

        const scoreScenario = (s: TradeScenario) => {
          const returnCombo = tradeMode === 'dump' ? s.get : s.give;
          const fairnessScore = 100 - (Math.abs(s.adjustedDifference) / maxDiff) * 100;

          let maxAssetValue = 0;
          for (const a of returnCombo) { if (a.value > maxAssetValue) maxAssetValue = a.value; }
          const qualityScore = (maxAssetValue / maxPossibleAssetValue) * 100;

          const concenScore = (1 / returnCombo.length) * 100;
          const prefScore = getPreferenceScore(returnCombo, assetPreference);

          if (assetPreference !== 'all') {
            return (fairnessScore * 0.30) + (qualityScore * 0.25) + (concenScore * 0.15) + (prefScore * 0.30);
          }
          return (fairnessScore * 0.40) + (qualityScore * 0.35) + (concenScore * 0.25);
        };

        // Split into exact trades (just selected assets) vs expanded (with extras)
        const selectedIdSet = new Set(selectedAssets.map(a => a.id));
        const giveSide = tradeMode === 'dump' ? 'give' : 'get';
        const exactTrades = newScenarios.filter(s => {
          const pkg = s[giveSide] as TradeAsset[];
          return pkg.length === selectedAssets.length && pkg.every(a => selectedIdSet.has(a.id));
        });
        const expandedTrades = newScenarios.filter(s => {
          const pkg = s[giveSide] as TradeAsset[];
          return pkg.length !== selectedAssets.length || !pkg.every(a => selectedIdSet.has(a.id));
        });

        exactTrades.sort((a, b) => scoreScenario(b) - scoreScenario(a));
        expandedTrades.sort((a, b) => scoreScenario(b) - scoreScenario(a));

        // Interleave: show exact trades first, then mix in expanded
        const topExact = exactTrades.slice(0, 25);
        const topExpanded = expandedTrades.slice(0, 25);
        const merged: TradeScenario[] = [];
        let ei = 0, xi = 0;
        // First batch: up to 10 exact trades
        while (ei < topExact.length && ei < 10) merged.push(topExact[ei++]);
        // Then alternate: 1 expanded, 1 exact
        while (merged.length < 50 && (ei < topExact.length || xi < topExpanded.length)) {
          if (xi < topExpanded.length) merged.push(topExpanded[xi++]);
          if (ei < topExact.length) merged.push(topExact[ei++]);
        }
        // Fill remaining with whatever's left
        while (merged.length < 50 && xi < topExpanded.length) merged.push(topExpanded[xi++]);

        setScenarios(merged);
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
      {/* ── Setup Card — styled like TradeCard ── */}
      <div className="bg-[#0a0a0a] rounded-xl overflow-hidden mb-4">
        {/* Header */}
        <div className="flex items-center justify-between bg-white/[0.05] px-4 sm:px-5 py-3 sm:py-4">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-white text-black text-[10px] font-extrabold tracking-[1px] rounded-sm">
              TRADE
            </span>
            <span className="text-[11px] text-[#555555]">Finder</span>
          </div>
          {/* Mode Toggle */}
          <div className="flex items-center gap-1 bg-[#111111] rounded-lg p-0.5">
            <button
              onClick={() => setTradeMode('dump')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                tradeMode === 'dump'
                  ? 'bg-[#1a1a1a] text-white'
                  : 'text-[#555555] hover:text-[#888888]'
              }`}
            >
              <ArrowUp className="h-3 w-3" />
              Away
            </button>
            <button
              onClick={() => setTradeMode('acquire')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                tradeMode === 'acquire'
                  ? 'bg-[#1a1a1a] text-white'
                  : 'text-[#555555] hover:text-[#888888]'
              }`}
            >
              <ArrowDown className="h-3 w-3" />
              Acquire
            </button>
          </div>
        </div>

        {/* Side 1: Your Team (dump) or Trade With (acquire) */}
        <button
          onClick={() => setDropdownOpen(tradeMode === 'dump' ? 'myTeam' : 'targetTeam')}
          className="w-full flex items-center justify-between bg-[#111111] px-4 sm:px-5 py-2.5 border-t border-[#1a1a1a] group"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className={`font-bold text-sm truncate ${
              (tradeMode === 'dump' ? myRoster : targetRoster) ? 'text-white' : 'text-[#555555]'
            }`}>
              {tradeMode === 'dump'
                ? (myRoster ? getTeamDisplayName(myRoster) : 'Select your team...')
                : (targetRoster ? getTeamDisplayName(targetRoster) : 'Select team to trade with...')
              }
            </span>
            {selectedAssets.length > 0 && (
              <span className="text-[10px] text-[#555555]">
                {selectedAssets.length} asset{selectedAssets.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {selectedAssets.length > 0 && (
              <span className="text-[11px] text-[#555555] font-medium tabular-nums">
                {selectedValueInfo.adjusted.toLocaleString()} KTC
              </span>
            )}
            <ChevronDown className="h-4 w-4 text-[#333333] group-hover:text-[#555555] transition-colors" />
          </div>
        </button>

        {/* Assets for side 1 */}
        {assetSourceRoster && (
          <div style={{ borderLeft: '3px solid #222222' }}>
            {selectedAssets.map(asset => {
              const playerId = asset.type === 'player' ? asset.id.replace('player-', '') : null;
              return (
                <AssetRow
                  key={asset.id}
                  playerId={playerId}
                  name={asset.name}
                  position={asset.type === 'player' ? (asset.position || '?') : 'PICK'}
                  team={asset.team}
                  value={asset.value}
                  className="group/row border-t border-[#111111] px-4 sm:px-5"
                  suffix={
                    <button
                      onClick={(e) => { e.stopPropagation(); removeAsset(asset.id); }}
                      className="p-1 rounded opacity-0 group-hover/row:opacity-100 hover:bg-red-500/10 transition-all shrink-0"
                    >
                      <X className="h-3 w-3 text-[#555555] hover:text-red-400" />
                    </button>
                  }
                />
              );
            })}

            {/* Add buttons — matches Evaluator style */}
            <div className="flex gap-2 py-2 px-4 sm:px-5 border-t border-[#111111]">
              <button
                onClick={() => setDropdownOpen('assets')}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] text-[#555555] hover:text-accent-400 hover:bg-accent-500/5 transition-all"
              >
                <Plus className="h-3 w-3" />
                Player
              </button>
              <button
                onClick={() => setDropdownOpen('assets')}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] text-[#555555] hover:text-cyan-400 hover:bg-cyan-500/5 transition-all"
              >
                <Plus className="h-3 w-3" />
                Pick
              </button>
            </div>
          </div>
        )}

        {/* Side 2: Trade With (dump) or Your Team (acquire) */}
        {((tradeMode === 'dump' && myRoster) || (tradeMode === 'acquire' && targetRoster)) && (
          <button
            onClick={() => setDropdownOpen(tradeMode === 'dump' ? 'targetTeam' : 'myTeam')}
            className="w-full flex items-center justify-between bg-[#111111] px-4 sm:px-5 py-2.5 border-t border-[#1a1a1a] group"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className={`font-bold text-sm truncate ${
                (tradeMode === 'dump' ? targetRoster : myRoster) ? 'text-white' : 'text-[#555555]'
              }`}>
                {tradeMode === 'dump'
                  ? (targetRoster ? getTeamDisplayName(targetRoster) : 'Any team')
                  : (myRoster ? getTeamDisplayName(myRoster) : 'Select your team...')
                }
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {tradeMode === 'dump' && targetRoster && (
                <button
                  onClick={(e) => { e.stopPropagation(); setTargetRoster(null); setScenarios([]); }}
                  className="p-1 rounded hover:bg-red-500/10 transition-colors"
                >
                  <X className="h-3.5 w-3.5 text-[#555555] hover:text-red-400" />
                </button>
              )}
              <ChevronDown className="h-4 w-4 text-[#333333] group-hover:text-[#555555] transition-colors" />
            </div>
          </button>
        )}

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
