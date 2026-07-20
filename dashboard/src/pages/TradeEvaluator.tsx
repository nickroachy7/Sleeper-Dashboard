import { useState, useMemo, useCallback, useEffect } from 'react';
import { useTradeData } from '../hooks/useLeagueData';
import {
  ArrowLeftRight,
  Plus,
  X,
  ChevronDown,
  Loader2,
  RotateCcw,
  Info,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import {
  analyzeTrade,
  calculateSideValue,
  type TradeAsset as ValueAdjustmentAsset,
} from '../lib/trade-value-adjustment';
import { recordCalculatorVote } from '../lib/community-events';
import {
  type Roster,
  type TradeAsset,
  type RosterPosition,
  buildPicksForRoster,
  buildPlayersForRoster,
  getTeamDisplayName,
  simulateTradeOnRoster,
  FAIRNESS_CONFIG,
} from '../lib/trade-shared';
import { AssetDropdown } from '../components/AssetDropdown';
import { TeamDropdown } from '../components/TeamDropdown';
import { AssetRow } from '../components/AssetRow';
import { useActiveLeague } from '../lib/active-league';

// ── Types ──────────────────────────────────────────────────────────

interface TradeSide {
  rosterId: number;
  assets: TradeAsset[];
}

export interface TradeEvaluatorProps {
  /**
   * Optional initial trade state — used when navigating in from Trade Finder's
   * "Open in Evaluator" button. The evaluator will pre-populate both sides and
   * immediately surface analysis.
   */
  initialSides?: TradeSide[];
}

// ── Main Component ─────────────────────────────────────────────────

export function TradeEvaluator({ initialSides }: TradeEvaluatorProps = {}) {
  // Global (no-league) mode: the evaluator becomes a pure value calculator —
  // add any player/pick by search instead of from a league's rosters. Sentinel
  // roster ids (1, 2) keep the per-side asset UI + analysis working without a
  // league (they're just non-zero placeholders; there are no real rosters).
  const { hasLeague } = useActiveLeague();
  const globalMode = !hasLeague;

  // NOTE: to re-seed with new initial sides, the parent should remount this
  // component by changing its `key` prop. We intentionally do not sync
  // `initialSides` into state via useEffect — that pattern fights React and
  // triggers cascading renders. See TradeTools.tsx for the remount trigger.
  const [tradeSides, setTradeSides] = useState<TradeSide[]>(
    initialSides && initialSides.length === 2
      ? initialSides
      : [
          { rosterId: globalMode ? 1 : 0, assets: [] },
          { rosterId: globalMode ? 2 : 0, assets: [] },
        ]
  );
  const [activeDropdown, setActiveDropdown] = useState<{ side: number; type: 'player' | 'pick' | 'team' } | null>(null);
  // Community feedback: the manager's own read on fairness. A real human signal
  // distinct from the calculator's math — feeds the value engine as a vote.
  const [feedbackSent, setFeedbackSent] = useState(false);

  const submitFeedback = useCallback(async (verdict: number) => {
    const sideA = tradeSides[0].assets
      .filter((a) => a.type === 'player').map((a) => a.id.replace('player-', ''));
    const sideB = tradeSides[1].assets
      .filter((a) => a.type === 'player').map((a) => a.id.replace('player-', ''));
    if (!sideA.length || !sideB.length) return;
    setFeedbackSent(true);
    try { await recordCalculatorVote({ sideA, sideB, verdict }); }
    catch { setFeedbackSent(false); }
  }, [tradeSides]);

  // A new trade composition can be rated again.
  const tradeKey = tradeSides.map((s) => s.assets.map((a) => a.id).join(',')).join('|');
  useEffect(() => { setFeedbackSent(false); }, [tradeKey]);

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

  // Global pools (no-league): every valued player + every pick tier, so the
  // evaluator works as a pure value calculator without any rosters.
  const globalPlayers = useMemo<TradeAsset[]>(() => {
    if (!globalMode) return [];
    const out: TradeAsset[] = [];
    for (const [pid, pv] of playerValues) {
      if (!pv?.value) continue;
      out.push({ id: `player-${pid}`, type: 'player', name: pv.player?.full_name ?? pid, value: pv.value, position: pv.player?.position, team: pv.player?.team ?? null });
    }
    return out.sort((a, b) => b.value - a.value);
  }, [globalMode, playerValues]);

  const globalPicks = useMemo<TradeAsset[]>(() => {
    if (!globalMode) return [];
    const ord = (r: number) => (r === 1 ? '1st' : r === 2 ? '2nd' : r === 3 ? '3rd' : `${r}th`);
    return (pickValues ?? []).map((pk) => {
      const tier = pk.pick_tier ?? 'Mid';
      return {
        id: `pick-${pk.pick_year}-${pk.pick_round}-${tier}`,
        type: 'pick' as const,
        name: `${pk.pick_year} ${tier} ${ord(pk.pick_round)}`,
        value: pk.value, pickYear: String(pk.pick_year), pickRound: pk.pick_round, pickTier: tier,
      };
    }).sort((a, b) => b.value - a.value);
  }, [globalMode, pickValues]);

  const getAvailableAssets = useCallback((sideIndex: number, type: 'player' | 'pick') => {
    const rosterId = tradeSides[sideIndex].rosterId;
    const assets = globalMode
      ? (type === 'player' ? globalPlayers : globalPicks)
      : (type === 'player' ? getPlayersOwnedByRoster(rosterId) : getPicksOwnedByRoster(rosterId));
    const addedIds = new Set(tradeSides[sideIndex].assets.filter((a) => a.type === type).map((a) => a.id));
    return assets.filter((a) => !addedIds.has(a.id));
  }, [tradeSides, globalMode, globalPlayers, globalPicks, getPlayersOwnedByRoster, getPicksOwnedByRoster]);

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

  // Post-trade roster impact: for each side, simulate what their roster looks
  // like after removing what they're giving and adding what they're receiving.
  // This is the "what does this do for my team?" answer the old UI was missing.
  const rosterImpacts = useMemo(() => {
    if (!tradeAnalysis) return null;
    if (globalMode) return null; // no rosters to simulate against
    if (tradeSides.some((s) => s.rosterId === 0)) return null;

    const side0Current = [
      ...getPlayersOwnedByRoster(tradeSides[0].rosterId),
      ...getPicksOwnedByRoster(tradeSides[0].rosterId),
    ];
    const side1Current = [
      ...getPlayersOwnedByRoster(tradeSides[1].rosterId),
      ...getPicksOwnedByRoster(tradeSides[1].rosterId),
    ];

    return [
      simulateTradeOnRoster(
        side0Current,
        tradeSides[0].assets,
        tradeSides[1].assets
      ),
      simulateTradeOnRoster(
        side1Current,
        tradeSides[1].assets,
        tradeSides[0].assets
      ),
    ];
  }, [tradeAnalysis, tradeSides, getPlayersOwnedByRoster, getPicksOwnedByRoster]);

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
  // Scale near-even threshold with trade size: small trades use the 300 floor,
  // mid-size trades widen to 3% of the larger side. Prevents a 15k vs 15.4k
  // package from reading as "lopsided" when it's actually dead even by %.
  const largerSide = tradeAnalysis
    ? Math.max(totals[0].adjustedTotal, totals[1].adjustedTotal)
    : 0;
  const nearEvenThreshold = Math.max(300, Math.round(largerSide * 0.03));
  const isNearEven = tradeAnalysis && !hasZeroSide && diff < nearEvenThreshold;

  // ── Render a single trade side ──
  const renderSide = (sideIndex: number) => {
    const side = tradeSides[sideIndex];
    const sideTotal = totals[sideIndex];
    const isWinner = winnerIdx === sideIndex;
    const isLoser = loserIdx === sideIndex;
    const roster = rosters?.find(r => r.roster_id === side.rosterId);
    const assetCount = side.assets.length;

    // Net KTC from *this side's perspective*. Each side's assets represent
    // what they're giving up, so the value this side RECEIVES is the other
    // side's total. Net gain = received − given. Positive net is a win.
    const otherTotal = totals[sideIndex === 0 ? 1 : 0]?.adjustedTotal || 0;
    const net = Math.round(otherTotal - sideTotal.adjustedTotal);

    return (
      <div>
        {/* Team header — matches TradeCard style */}
        <button
          onClick={() => { if (!globalMode) setActiveDropdown({ side: sideIndex, type: 'team' }); }}
          disabled={globalMode}
          className={`w-full flex items-center justify-between bg-elevated px-4 sm:px-5 py-2.5 group ${sideIndex > 0 ? 'border-t border-[#26262f]' : ''}`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className={`font-bold text-sm truncate ${(globalMode || roster) ? 'text-white' : 'text-faint'}`}>
              {globalMode ? `Side ${sideIndex === 0 ? 'A' : 'B'}` : roster ? getTeamDisplayName(roster) : 'Select team...'}
            </span>
            {(globalMode || roster) && tradeAnalysis && (
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
              <span className="text-[10px] text-faint">
                {assetCount} asset{assetCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {side.assets.length > 0 && tradeAnalysis && net !== 0 ? (
              <span className={`text-[11px] font-semibold tabular-nums ${
                isNearEven ? 'text-faint' : net > 0 ? 'text-emerald-400' : 'text-red-400'
              }`}>
                {net > 0 ? '+' : ''}{net.toLocaleString()} CV
              </span>
            ) : side.assets.length > 0 ? (
              <span className="text-[11px] text-faint font-medium tabular-nums">
                {sideTotal.adjustedTotal.toLocaleString()} CV
              </span>
            ) : null}
            {!globalMode && <ChevronDown className="h-4 w-4 text-[#4c4c56] group-hover:text-faint transition-colors" />}
          </div>
        </button>

        {/* Assets — with left border like TradeCard */}
        {side.rosterId > 0 && (
          <div style={{ borderLeft: `3px solid ${isWinner ? '#10b981' : '#2e2e38'}` }}>
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
                  className="group/row border-t border-line-subtle px-4 sm:px-5"
                  suffix={
                    <button
                      onClick={() => removeAsset(sideIndex, asset.id)}
                      className="p-1 rounded opacity-0 group-hover/row:opacity-100 hover:bg-red-500/10 transition-all shrink-0"
                    >
                      <X className="h-3 w-3 text-faint hover:text-red-400" />
                    </button>
                  }
                />
              );
            })}

            {/* Add buttons */}
            <div className="flex gap-2 py-2 px-4 sm:px-5 border-t border-line-subtle">
              <button
                onClick={() => setActiveDropdown({ side: sideIndex, type: 'player' })}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] text-faint hover:text-accent-400 hover:bg-accent-500/5 transition-all"
              >
                <Plus className="h-3 w-3" />
                Player
              </button>
              <button
                onClick={() => setActiveDropdown({ side: sideIndex, type: 'pick' })}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] text-faint hover:text-cyan-400 hover:bg-cyan-500/5 transition-all"
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
            className="flex items-center gap-1.5 px-3 py-1.5 text-faint hover:text-white hover:bg-elevated rounded-lg text-xs font-medium transition-all"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
        </div>
      )}

      {/* Trade builder — styled like TradeCard */}
      <div className="bg-surface border border-line rounded-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between bg-white/[0.05] px-4 sm:px-5 py-3 sm:py-4">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-white text-black text-[10px] font-extrabold tracking-[1px] rounded-sm">
              TRADE
            </span>
            <span className="text-[11px] text-faint">Evaluator</span>
          </div>
          <button
            onClick={swapSides}
            className="w-7 h-7 rounded-full bg-elevated flex items-center justify-center hover:bg-[#26262f] transition-all group"
            title="Swap sides"
          >
            <ArrowLeftRight className="w-3 h-3 text-faint group-hover:text-accent-400 transition-colors" />
          </button>
        </div>

        {/* Side 1 */}
        {renderSide(0)}

        {/* Side 2 */}
        {renderSide(1)}
      </div>

      {/* ── Empty-side hint ── */}
      {(hasZeroSide || tradeSides.some((s) => s.rosterId === 0)) && (
        <div className="mt-4 bg-surface border border-[#26262f] rounded-xl px-4 py-3 flex items-center gap-2.5">
          <Info className="h-4 w-4 text-faint shrink-0" />
          <span className="text-[11px] text-muted">
            {tradeSides.some((s) => s.rosterId === 0)
              ? 'Select a team on each side, then add players or picks to compare a trade.'
              : 'Add assets to both sides to see the trade analysis and roster impact.'}
          </span>
        </div>
      )}

      {/* ── Trade Analysis (appears automatically) ── */}
      {tradeAnalysis && (() => {
        const config = FAIRNESS_CONFIG[tradeAnalysis.fairness];
        const side1Name = rosters?.find(r => r.roster_id === tradeSides[0].rosterId);
        const side2Name = rosters?.find(r => r.roster_id === tradeSides[1].rosterId);
        const winnerName = winnerIdx !== null && winnerIdx === 0 ? side1Name : side2Name;

        const maxTotal = Math.max(totals[0].adjustedTotal, totals[1].adjustedTotal) || 1;
        const bar0Pct = (totals[0].adjustedTotal / maxTotal) * 100;
        const bar1Pct = (totals[1].adjustedTotal / maxTotal) * 100;

        return (
          <div className="mt-4 bg-surface rounded-xl p-4 sm:p-5">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white uppercase tracking-wider">Analysis</span>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${config.badge}`}>
                  {config.label}
                </span>
              </div>
              {isNearEven || winnerIdx === null ? (
                <span className="text-xs text-blue-400 font-medium">Even Trade</span>
              ) : (
                <span className="text-xs text-emerald-400 font-semibold">
                  {globalMode ? `Side ${winnerIdx === 0 ? 'A' : 'B'}` : winnerName ? getTeamDisplayName(winnerName) : ''} +{diff.toLocaleString()}
                </span>
              )}
            </div>

            {/* Value Comparison Bars — lower giving = winner (green) */}
            <div className="space-y-2">
              {tradeSides.map((side, sideIndex) => {
                const isW = !isNearEven && winnerIdx === sideIndex;
                const roster = rosters?.find(r => r.roster_id === side.rosterId);
                const pct = sideIndex === 0 ? bar0Pct : bar1Pct;
                return (
                  <div key={sideIndex}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-medium text-muted">
                        {globalMode ? `Side ${sideIndex === 0 ? 'A' : 'B'}` : roster ? getTeamDisplayName(roster) : ''}
                        <span className="text-ghost ml-1">gives</span>
                      </span>
                      <span className={`text-xs font-bold tabular-nums ${isW ? 'text-emerald-400' : 'text-muted'}`}>
                        {totals[sideIndex].adjustedTotal.toLocaleString()}
                      </span>
                    </div>
                    <div className="w-full h-2 bg-elevated rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${pct}%`,
                          background: isW
                            ? 'linear-gradient(90deg, #22c55e, rgba(34,197,94,0.4))'
                            : 'linear-gradient(90deg, #75757f, rgba(85,85,85,0.3))',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── Value Adjustment Breakdown ── */}
            {tradeAnalysis.valueAdjustment > 0 && (
              <div className="pt-3 mt-3 border-t border-line-subtle space-y-2">
                {tradeSides.map((side, sideIndex) => {
                  const sideResult = sideIndex === 0 ? tradeAnalysis.side1 : tradeAnalysis.side2;
                  const roster = rosters?.find(r => r.roster_id === side.rosterId);
                  const teamLabel = roster ? getTeamDisplayName(roster) : `Side ${sideIndex + 1}`;
                  const hasAdj = sideResult.valueAdjustment > 0;
                  return (
                    <div key={sideIndex} className="text-[10px] space-y-0.5">
                      <div className="text-[#80808c] font-semibold uppercase tracking-wider">
                        {teamLabel}
                      </div>
                      <div className="flex items-center justify-between text-faint">
                        <span>Raw value</span>
                        <span className="tabular-nums">{sideResult.rawTotal.toLocaleString()}</span>
                      </div>
                      {hasAdj && (
                        <div className="flex items-center justify-between text-emerald-400/80">
                          <span>+ Star premium</span>
                          <span className="tabular-nums">+{sideResult.valueAdjustment.toLocaleString()}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between text-white font-semibold pt-0.5 border-t border-line-subtle">
                        <span>Adjusted</span>
                        <span className="tabular-nums">{sideResult.adjustedTotal.toLocaleString()}</span>
                      </div>
                    </div>
                  );
                })}

                {tradeAnalysis.rawDifference !== tradeAnalysis.adjustedDifference && (
                  <div className="flex items-start gap-1.5 pt-1">
                    <Info className="h-3 w-3 text-ghost shrink-0 mt-0.5" />
                    <span className="text-[10px] text-faint">
                      Raw gap {tradeAnalysis.rawDifference.toLocaleString()} → adjusted {tradeAnalysis.adjustedDifference.toLocaleString()}.
                      Elite players carry a premium — one star is worth more than the sum of the pieces it takes to get them.
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Community feedback: your own read on fairness ── */}
      {tradeAnalysis && tradeSides[0].assets.some((a) => a.type === 'player')
        && tradeSides[1].assets.some((a) => a.type === 'player') && (
        <div className="mt-4 bg-surface rounded-xl p-4 sm:p-5">
          {feedbackSent ? (
            <p className="text-[12px] text-emerald-400 text-center">
              Thanks — your take was added to the community values.
            </p>
          ) : (
            <>
              <p className="text-[11px] font-bold text-white uppercase tracking-wider text-center mb-1">
                Who wins this trade?
              </p>
              <p className="text-[10px] text-faint text-center mb-3">
                Your call trains community values — separate from the math above.
              </p>
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => submitFeedback(1)}
                  className="rounded-lg border border-line-strong bg-elevated py-2 text-[11px] font-medium text-white hover:border-emerald-500 hover:bg-emerald-500/10 transition-colors">
                  Side 1
                </button>
                <button onClick={() => submitFeedback(0.5)}
                  className="rounded-lg border border-line-strong bg-elevated py-2 text-[11px] font-medium text-white hover:border-accent-500 hover:bg-accent-500/10 transition-colors">
                  Fair
                </button>
                <button onClick={() => submitFeedback(0)}
                  className="rounded-lg border border-line-strong bg-elevated py-2 text-[11px] font-medium text-white hover:border-emerald-500 hover:bg-emerald-500/10 transition-colors">
                  Side 2
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Post-Trade Roster Impact ── */}
      {tradeAnalysis && rosterImpacts && (
        <div className="mt-4 bg-surface rounded-xl p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white uppercase tracking-wider">Roster Impact</span>
              <span className="text-[10px] text-faint">After trade, by position</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {tradeSides.map((side, sideIndex) => {
              const impact = rosterImpacts[sideIndex];
              const roster = rosters?.find(r => r.roster_id === side.rosterId);
              const positions: RosterPosition[] = ['QB', 'RB', 'WR', 'TE'];
              const totalDelta = impact.delta.total;
              const pickDelta = impact.delta.picksValue;

              // Pick a scale for the position bars: use the max current value
              // across all positions on this roster so bars are comparable.
              const scale = Math.max(
                ...positions.map(p => Math.max(impact.before.byPosition[p], impact.after.byPosition[p])),
                1
              );

              return (
                <div key={sideIndex} className="space-y-2">
                  <div className="flex items-center justify-between pb-2 border-b border-line-subtle">
                    <span className="text-[11px] font-semibold text-white">
                      {roster ? getTeamDisplayName(roster) : `Side ${sideIndex + 1}`}
                    </span>
                    <div className="flex items-center gap-1">
                      {totalDelta > 0 ? (
                        <TrendingUp className="h-3 w-3 text-emerald-400" />
                      ) : totalDelta < 0 ? (
                        <TrendingDown className="h-3 w-3 text-red-400" />
                      ) : null}
                      <span className={`text-[11px] font-bold tabular-nums ${
                        totalDelta > 0 ? 'text-emerald-400' : totalDelta < 0 ? 'text-red-400' : 'text-faint'
                      }`}>
                        {totalDelta > 0 ? '+' : ''}{totalDelta.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {positions.map(pos => {
                    const before = impact.before.byPosition[pos];
                    const after = impact.after.byPosition[pos];
                    const delta = impact.delta.byPosition[pos];
                    const beforePct = (before / scale) * 100;
                    const afterPct = (after / scale) * 100;
                    const deltaColor =
                      delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-red-400' : 'text-faint';

                    return (
                      <div key={pos}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-semibold text-muted w-6">{pos}</span>
                          <div className="flex items-center gap-2 text-[10px] tabular-nums">
                            <span className="text-[#80808c]">{before.toLocaleString()}</span>
                            <span className="text-[#4c4c56]">→</span>
                            <span className="text-white">{after.toLocaleString()}</span>
                            {delta !== 0 && (
                              <span className={`${deltaColor} font-semibold w-14 text-right`}>
                                {delta > 0 ? '+' : ''}{delta.toLocaleString()}
                              </span>
                            )}
                            {delta === 0 && <span className="w-14" />}
                          </div>
                        </div>
                        {/* Stacked bars: before (grey) + after (color) */}
                        <div className="relative w-full h-1.5 bg-elevated rounded-full overflow-hidden">
                          <div
                            className="absolute inset-y-0 left-0 bg-[#363641] rounded-full"
                            style={{ width: `${beforePct}%` }}
                          />
                          <div
                            className={`absolute inset-y-0 left-0 rounded-full ${
                              delta > 0 ? 'bg-emerald-500/70' : delta < 0 ? 'bg-red-500/70' : 'bg-[#60606a]'
                            }`}
                            style={{ width: `${afterPct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}

                  {pickDelta !== 0 && (
                    <div className="flex items-center justify-between pt-2 mt-2 border-t border-line-subtle">
                      <span className="text-[10px] font-semibold text-muted">Picks</span>
                      <span className={`text-[10px] font-semibold tabular-nums ${
                        pickDelta > 0 ? 'text-emerald-400' : 'text-red-400'
                      }`}>
                        {pickDelta > 0 ? '+' : ''}{pickDelta.toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

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
