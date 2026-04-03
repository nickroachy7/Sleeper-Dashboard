import { useState, useMemo, useCallback } from 'react';
import { useTradeData } from '../hooks/useLeagueData';
import {
  ArrowLeftRight,
  Plus,
  X,
  ChevronDown,
  Loader2,
  RotateCcw,
  Info,
  AlertTriangle,
} from 'lucide-react';
import {
  analyzeTrade,
  calculateSideValue,
  type TradeAsset as ValueAdjustmentAsset,
} from '../lib/trade-value-adjustment';
import {
  type Roster,
  type TradeAsset,
  buildPicksForRoster,
  buildPlayersForRoster,
  getTeamDisplayName,
  FAIRNESS_CONFIG,
} from '../lib/trade-shared';
import { AssetDropdown } from '../components/AssetDropdown';
import { TeamDropdown } from '../components/TeamDropdown';
import { AssetRow } from '../components/AssetRow';

// ── Types ──────────────────────────────────────────────────────────

interface TradeSide {
  rosterId: number;
  assets: TradeAsset[];
}

// ── Main Component ─────────────────────────────────────────────────

export function TradeEvaluator() {
  const [tradeSides, setTradeSides] = useState<TradeSide[]>([
    { rosterId: 0, assets: [] },
    { rosterId: 0, assets: [] },
  ]);
  const [activeDropdown, setActiveDropdown] = useState<{ side: number; type: 'player' | 'pick' | 'team' } | null>(null);

  const { rosters, players, playerValues, pickValues, tradedPicks, isLoading: dataLoading } = useTradeData();

  const getPicksOwnedByRoster = useCallback((rosterId: number): TradeAsset[] => {
    if (!rosters || !pickValues || !tradedPicks) return [];
    return buildPicksForRoster(rosterId, rosters, pickValues, tradedPicks);
  }, [rosters, pickValues, tradedPicks]);

  const getPlayersOwnedByRoster = useCallback((rosterId: number): TradeAsset[] => {
    if (!rosters || !playerValues) return [];
    const roster = rosters.find((r) => r.roster_id === rosterId);
    if (!roster) return [];
    return buildPlayersForRoster(roster, playerValues, players);
  }, [rosters, playerValues, players]);

  const getAvailableAssets = useCallback((sideIndex: number, type: 'player' | 'pick') => {
    const rosterId = tradeSides[sideIndex].rosterId;
    const assets = type === 'player' ? getPlayersOwnedByRoster(rosterId) : getPicksOwnedByRoster(rosterId);
    const addedIds = new Set(tradeSides[sideIndex].assets.filter((a) => a.type === type).map((a) => a.id));
    return assets.filter((a) => !addedIds.has(a.id));
  }, [tradeSides, getPlayersOwnedByRoster, getPicksOwnedByRoster]);

  const addAsset = useCallback((sideIndex: number, asset: TradeAsset) => {
    setTradeSides((prev) => {
      const updated = [...prev];
      updated[sideIndex] = { ...updated[sideIndex], assets: [...updated[sideIndex].assets, asset] };
      return updated;
    });
  }, []);

  const removeAsset = useCallback((sideIndex: number, assetId: string) => {
    setTradeSides((prev) => {
      const updated = [...prev];
      updated[sideIndex] = { ...updated[sideIndex], assets: updated[sideIndex].assets.filter((a) => a.id !== assetId) };
      return updated;
    });
  }, []);

  const setRoster = useCallback((sideIndex: number, roster: Roster) => {
    setTradeSides((prev) => {
      const updated = [...prev];
      updated[sideIndex] = { rosterId: roster.roster_id, assets: [] };
      return updated;
    });
  }, []);

  const swapSides = useCallback(() => {
    setTradeSides((prev) => [prev[1], prev[0]]);
  }, []);

  const resetTrade = useCallback(() => {
    setTradeSides([{ rosterId: 0, assets: [] }, { rosterId: 0, assets: [] }]);
    setActiveDropdown(null);
  }, []);

  const totals = useMemo(() => {
    return tradeSides.map((side) => calculateSideValue(side.assets as ValueAdjustmentAsset[]));
  }, [tradeSides]);

  const tradeAnalysis = useMemo(() => {
    if (tradeSides.some((s) => s.rosterId === 0) || tradeSides.some((s) => s.assets.length === 0)) return null;
    return analyzeTrade(
      tradeSides[0].assets as ValueAdjustmentAsset[],
      tradeSides[1].assets as ValueAdjustmentAsset[]
    );
  }, [tradeSides]);

  const getExcludedRosterIds = useCallback((currentSideIndex: number) => {
    return tradeSides.filter((_, i) => i !== currentSideIndex).map((s) => s.rosterId).filter((id) => id > 0);
  }, [tradeSides]);

  const isLoading = dataLoading;
  const hasAssets = tradeSides.some((s) => s.assets.length > 0);
  const winnerIdx = tradeAnalysis ? tradeAnalysis.winnerIndex : null;
  const loserIdx = winnerIdx !== null ? (winnerIdx === 0 ? 1 : 0) : null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-accent-500" />
      </div>
    );
  }

  // ── Helpers for trade card display ──
  const hasZeroSide = tradeSides.some(s => s.assets.length === 0 && s.rosterId > 0);
  const diff = tradeAnalysis ? Math.abs(tradeAnalysis.adjustedDifference) : 0;
  const isNearEven = tradeAnalysis && !hasZeroSide && diff < 500;

  // ── Render a single trade side ──
  const renderSide = (sideIndex: number) => {
    const side = tradeSides[sideIndex];
    const sideTotal = totals[sideIndex];
    const isWinner = winnerIdx === sideIndex;
    const isLoser = loserIdx === sideIndex;
    const roster = rosters?.find(r => r.roster_id === side.rosterId);
    const assetCount = side.assets.length;

    // Calculate net KTC like TradeCard
    const otherTotal = totals[sideIndex === 0 ? 1 : 0]?.adjustedTotal || 0;
    const net = Math.round(sideTotal.adjustedTotal - otherTotal);

    return (
      <div>
        {/* Team header — matches TradeCard style */}
        <button
          onClick={() => setActiveDropdown({ side: sideIndex, type: 'team' })}
          className={`w-full flex items-center justify-between bg-[#111111] px-4 sm:px-5 py-2.5 group ${sideIndex > 0 ? 'border-t border-[#1a1a1a]' : ''}`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className={`font-bold text-sm truncate ${roster ? 'text-white' : 'text-[#555555]'}`}>
              {roster ? getTeamDisplayName(roster) : 'Select team...'}
            </span>
            {roster && tradeAnalysis && (
              isNearEven ? (
                <span className="text-[10px] font-bold text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded leading-none">
                  =
                </span>
              ) : (
                isWinner ? (
                  <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded leading-none">
                    W
                  </span>
                ) : isLoser ? (
                  <span className="text-[10px] font-bold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded leading-none">
                    L
                  </span>
                ) : null
              )
            )}
            {assetCount > 0 && (
              <span className="text-[10px] text-[#555555]">
                {assetCount} asset{assetCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {side.assets.length > 0 && tradeAnalysis && net !== 0 ? (
              <span className={`text-[11px] font-semibold tabular-nums ${
                isNearEven ? 'text-[#555555]' : net > 0 ? 'text-emerald-400' : 'text-red-400'
              }`}>
                {net > 0 ? '+' : ''}{net.toLocaleString()} KTC
              </span>
            ) : side.assets.length > 0 ? (
              <span className="text-[11px] text-[#555555] font-medium tabular-nums">
                {sideTotal.adjustedTotal.toLocaleString()} KTC
              </span>
            ) : null}
            <ChevronDown className="h-4 w-4 text-[#333333] group-hover:text-[#555555] transition-colors" />
          </div>
        </button>

        {/* Assets — with left border like TradeCard */}
        {side.rosterId > 0 && (
          <div style={{ borderLeft: `3px solid ${isWinner ? '#10b981' : '#222222'}` }}>
            {side.assets.map((asset) => {
              const playerId = asset.type === 'player' ? asset.id.replace('player-', '') : null;
              return (
                <AssetRow
                  key={asset.id}
                  playerId={playerId}
                  name={asset.name}
                  position={asset.type === 'player' ? asset.position : 'PICK'}
                  team={asset.team}
                  value={asset.value}
                  className="group/row border-t border-[#111111] px-4 sm:px-5"
                  suffix={
                    <button
                      onClick={() => removeAsset(sideIndex, asset.id)}
                      className="p-1 rounded opacity-0 group-hover/row:opacity-100 hover:bg-red-500/10 transition-all shrink-0"
                    >
                      <X className="h-3 w-3 text-[#555555] hover:text-red-400" />
                    </button>
                  }
                />
              );
            })}

            {/* Add buttons */}
            <div className="flex gap-2 py-2 px-4 sm:px-5 border-t border-[#111111]">
              <button
                onClick={() => setActiveDropdown({ side: sideIndex, type: 'player' })}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] text-[#555555] hover:text-accent-400 hover:bg-accent-500/5 transition-all"
              >
                <Plus className="h-3 w-3" />
                Player
              </button>
              <button
                onClick={() => setActiveDropdown({ side: sideIndex, type: 'pick' })}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] text-[#555555] hover:text-cyan-400 hover:bg-cyan-500/5 transition-all"
              >
                <Plus className="h-3 w-3" />
                Pick
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      {/* Reset button */}
      {hasAssets && (
        <div className="flex justify-end mb-2">
          <button
            onClick={resetTrade}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[#555555] hover:text-white hover:bg-[#111111] rounded-lg text-xs font-medium transition-all"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
        </div>
      )}

      {/* Trade builder — styled like TradeCard */}
      <div className="bg-[#0a0a0a] rounded-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between bg-white/[0.05] px-4 sm:px-5 py-3 sm:py-4">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-white text-black text-[10px] font-extrabold tracking-[1px] rounded-sm">
              TRADE
            </span>
            <span className="text-[11px] text-[#555555]">Evaluator</span>
          </div>
          <button
            onClick={swapSides}
            className="w-7 h-7 rounded-full bg-[#111111] flex items-center justify-center hover:bg-[#1a1a1a] transition-all group"
            title="Swap sides"
          >
            <ArrowLeftRight className="w-3 h-3 text-[#555555] group-hover:text-accent-400 transition-colors" />
          </button>
        </div>

        {/* Side 1 */}
        {renderSide(0)}

        {/* Side 2 */}
        {renderSide(1)}
      </div>

      {/* ── Trade Analysis (appears automatically) ── */}
      {tradeAnalysis && (() => {
        const config = FAIRNESS_CONFIG[tradeAnalysis.fairness];
        const side1Name = rosters?.find(r => r.roster_id === tradeSides[0].rosterId);
        const side2Name = rosters?.find(r => r.roster_id === tradeSides[1].rosterId);
        const diff = Math.abs(tradeAnalysis.adjustedDifference);
        const winnerName = winnerIdx !== null && winnerIdx === 0 ? side1Name : side2Name;
        const isEvenTrade = tradeAnalysis.adjustedDifference === 0;

        const maxTotal = Math.max(totals[0].adjustedTotal, totals[1].adjustedTotal) || 1;
        const bar0Pct = (totals[0].adjustedTotal / maxTotal) * 100;
        const bar1Pct = (totals[1].adjustedTotal / maxTotal) * 100;

        return (
          <div className="mt-4 bg-[#0a0a0a] rounded-xl p-4 sm:p-5">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white uppercase tracking-wider">Analysis</span>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${config.badge}`}>
                  {config.label}
                </span>
              </div>
              {isEvenTrade ? (
                <span className="text-xs text-[#555555] font-medium">Even Trade</span>
              ) : (
                <span className="text-xs text-emerald-400 font-semibold">
                  {winnerName ? getTeamDisplayName(winnerName) : ''} +{diff.toLocaleString()}
                </span>
              )}
            </div>

            {/* Value Comparison Bars */}
            <div className="space-y-2">
              {tradeSides.map((side, sideIndex) => {
                const isW = winnerIdx === sideIndex;
                const roster = rosters?.find(r => r.roster_id === side.rosterId);
                const pct = sideIndex === 0 ? bar0Pct : bar1Pct;
                return (
                  <div key={sideIndex}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-medium text-[#888888]">
                        {roster ? getTeamDisplayName(roster) : ''}
                      </span>
                      <span className={`text-xs font-bold tabular-nums ${isW ? 'text-emerald-400' : 'text-[#888888]'}`}>
                        {totals[sideIndex].adjustedTotal.toLocaleString()}
                      </span>
                    </div>
                    <div className="w-full h-2 bg-[#111111] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${pct}%`,
                          background: isW
                            ? 'linear-gradient(90deg, #22c55e, rgba(34,197,94,0.4))'
                            : 'linear-gradient(90deg, #555555, rgba(85,85,85,0.3))',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Adjustment details */}
            {(tradeAnalysis.rawDifference !== tradeAnalysis.adjustedDifference || tradeAnalysis.tierMismatchExplanation) && (
              <div className="pt-3 mt-3 border-t border-[#111111] space-y-1.5">
                {tradeAnalysis.rawDifference !== tradeAnalysis.adjustedDifference && (
                  <div className="flex items-center gap-1.5">
                    <Info className="h-3 w-3 text-[#444444] shrink-0" />
                    <span className="text-[10px] text-[#555555]">
                      Raw: {tradeAnalysis.rawDifference.toLocaleString()} → Adjusted: {tradeAnalysis.adjustedDifference.toLocaleString()}
                    </span>
                  </div>
                )}
                {tradeAnalysis.tierMismatchExplanation && (
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="h-3 w-3 text-amber-500/60 shrink-0" />
                    <span className="text-[10px] text-amber-400/70">{tradeAnalysis.tierMismatchExplanation}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* Dropdowns */}
      {tradeSides.map((_, sideIndex) => (
        <div key={sideIndex}>
          <TeamDropdown
            isOpen={activeDropdown?.side === sideIndex && activeDropdown?.type === 'team'}
            onClose={() => setActiveDropdown(null)}
            rosters={rosters || []}
            excludeRosterIds={getExcludedRosterIds(sideIndex)}
            onSelect={(roster) => setRoster(sideIndex, roster)}
          />
          <AssetDropdown
            isOpen={activeDropdown?.side === sideIndex && activeDropdown?.type === 'player'}
            onClose={() => setActiveDropdown(null)}
            title="Add Player"
            items={getAvailableAssets(sideIndex, 'player')}
            onSelect={(asset) => addAsset(sideIndex, asset)}
            emptyMessage="No players available"
          />
          <AssetDropdown
            isOpen={activeDropdown?.side === sideIndex && activeDropdown?.type === 'pick'}
            onClose={() => setActiveDropdown(null)}
            title="Add Pick"
            items={getAvailableAssets(sideIndex, 'pick')}
            onSelect={(asset) => addAsset(sideIndex, asset)}
            emptyMessage="No picks available"
          />
        </div>
      ))}
    </div>
  );
}

export default TradeEvaluator;
