import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, ArrowRight } from 'lucide-react';
import { usePlayers, usePlayerValuesList } from '../hooks/queries';
import { getPlayerImageUrl } from '../lib/trade-shared';
import { PositionBadge } from './PositionBadge';
import { recordPairwiseVote, recordCalculatorVote } from '../lib/community-events';
import { useShowIdp } from '../lib/idp-store';
import { isVisiblePosition } from '../lib/positions';
import type { Player } from '../types/domain';

// Once per browser session (cleared when the tab/browser closes), we ask two
// quick questions whose answers feed straight into the community value engine
// (value_events → Glicko). The user can skip at any time.
const SESSION_KEY = 'sleeper_dash.contributed';

interface Trade { a: Player[]; b: Player[] }

/** Q1 matchup: a player and a nearby-value opponent (a real coin-flip). */
function makePair(pool: Player[]): [Player, Player] | null {
  if (pool.length < 2) return null;
  const i = Math.floor(Math.random() * pool.length);
  const window = 12;
  const lo = Math.max(0, i - window);
  const hi = Math.min(pool.length - 1, i + window);
  let j = lo + Math.floor(Math.random() * (hi - lo + 1));
  if (j === i) j = j === hi ? Math.max(lo, i - 1) : j + 1;
  return [pool[i], pool[j]];
}

/** Q2 trade: one player vs two players whose combined value is close, so the
 *  "who won?" call teaches cross-player relationships. Sides are randomized so
 *  the stud isn't always on the same side. */
function makeTrade(pool: Player[], valueMap: Map<string, number>): Trade | null {
  if (pool.length < 8) return null;
  const A = pool[Math.floor(Math.random() * Math.floor(pool.length * 0.5))];
  const V = valueMap.get(A.player_id) ?? 0;
  if (V <= 0) return null;
  const cands = pool.filter((p) => {
    if (p.player_id === A.player_id) return false;
    const v = valueMap.get(p.player_id) ?? 0;
    return v >= 0.3 * V && v <= 0.75 * V;
  });
  if (cands.length < 2) return null;
  const b1 = cands[Math.floor(Math.random() * cands.length)];
  const target = V - (valueMap.get(b1.player_id) ?? 0);
  let b2: Player | null = null;
  let best = Infinity;
  for (const p of cands) {
    if (p.player_id === b1.player_id) continue;
    const d = Math.abs((valueMap.get(p.player_id) ?? 0) - target);
    if (d < best) { best = d; b2 = p; }
  }
  if (!b2) return null;
  return Math.random() < 0.5 ? { a: [A], b: [b1, b2] } : { a: [b1, b2], b: [A] };
}

export function SessionContributeModal() {
  const { data: players } = usePlayers();
  const { data: valueMap } = usePlayerValuesList();
  const showIdp = useShowIdp();

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<0 | 1 | 2>(0); // 0 = who'd you rather, 1 = trade, 2 = thanks
  const [pending, setPending] = useState(false);
  const [pair, setPair] = useState<[Player, Player] | null>(null);
  const [trade, setTrade] = useState<Trade | null>(null);

  const pool = useMemo(() => {
    if (!players || !valueMap) return [] as Player[];
    return players
      .filter((p) => isVisiblePosition(p.position, showIdp) && valueMap.has(p.player_id))
      .sort((a, b) => (valueMap.get(b.player_id) ?? 0) - (valueMap.get(a.player_id) ?? 0));
  }, [players, valueMap, showIdp]);

  // Build the two matchups once the value pool is ready.
  useEffect(() => {
    if (pair || !valueMap || pool.length < 8) return;
    setPair(makePair(pool));
    setTrade(makeTrade(pool, valueMap));
  }, [pool, valueMap, pair]);

  // Show once per session, only after both matchups exist.
  useEffect(() => {
    if (open || sessionStorage.getItem(SESSION_KEY)) return;
    if (!pair || !trade) return;
    sessionStorage.setItem(SESSION_KEY, '1');
    setOpen(true);
  }, [pair, trade, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open || !pair || !trade) return null;

  const skip = () => setOpen(false);

  const answerPair = async (winner: Player, loser: Player) => {
    if (pending) return;
    setPending(true);
    try { await recordPairwiseVote({ winnerId: winner.player_id, loserId: loser.player_id }); } catch { /* non-fatal */ }
    setPending(false);
    setStep(1);
  };

  // side === 'a' → side A preferred (verdict 1); 'b' → verdict 0.
  const answerTrade = async (side: 'a' | 'b') => {
    if (pending) return;
    setPending(true);
    try {
      await recordCalculatorVote({
        sideA: trade.a.map((p) => p.player_id),
        sideB: trade.b.map((p) => p.player_id),
        verdict: side === 'a' ? 1 : 0,
      });
    } catch { /* non-fatal */ }
    setPending(false);
    setStep(2);
    setTimeout(() => setOpen(false), 1400);
  };

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={skip} />

      <div className="relative w-full max-w-lg rounded-2xl border border-[#2a2a34] bg-[#0f0f14] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-[#1b1b22]">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-[15px] font-bold text-white">Train the community values</h2>
              {step < 2 && (
                <span className="text-[10px] font-bold uppercase tracking-wider text-accent-500">{step + 1} of 2</span>
              )}
            </div>
            <p className="text-[12px] text-[#75757f]">Two quick calls — your picks move everyone's player values.</p>
          </div>
          <button onClick={skip} aria-label="Close"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#9c9ca7] hover:text-white hover:bg-[#1b1b22] transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5">
          {step === 0 && (
            <>
              <p className="text-center text-[13px] font-semibold text-white mb-4">Who would you rather have?</p>
              <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-2.5 sm:gap-4">
                <PlayerPick player={pair[0]} disabled={pending} onClick={() => answerPair(pair[0], pair[1])} />
                <div className="flex items-center justify-center text-[#60606a] text-[11px] font-medium tracking-widest uppercase">or</div>
                <PlayerPick player={pair[1]} disabled={pending} onClick={() => answerPair(pair[1], pair[0])} />
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <p className="text-center text-[13px] font-semibold text-white mb-1">Which side wins this trade?</p>
              <p className="text-center text-[11px] text-[#75757f] mb-4">Tap the side you'd rather receive.</p>
              <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-2.5 sm:gap-4">
                <TradeSide players={trade.a} disabled={pending} onClick={() => answerTrade('a')} />
                <div className="flex items-center justify-center text-[#60606a] text-[11px] font-medium tracking-widest uppercase">vs</div>
                <TradeSide players={trade.b} disabled={pending} onClick={() => answerTrade('b')} />
              </div>
            </>
          )}

          {step === 2 && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="w-12 h-12 rounded-full bg-accent-500/15 flex items-center justify-center mb-3">
                <Check className="h-6 w-6 text-accent-400" />
              </div>
              <p className="text-[15px] font-bold text-white">Thanks — that's in.</p>
              <p className="text-[12px] text-[#75757f] mt-1">Your calls just nudged the community values.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        {step < 2 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-[#1b1b22]">
            <span className="text-[11px] text-[#60606a]">Anonymous · feeds the shared value engine</span>
            <button onClick={skip} disabled={pending}
              className="flex items-center gap-1 text-[12px] font-medium text-[#9c9ca7] hover:text-white transition-colors disabled:opacity-40">
              Skip <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

function PlayerPick({ player, disabled, onClick }: { player: Player; disabled: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="group flex flex-col items-center rounded-xl border border-[#22222b] bg-[#141419] p-4 transition-all hover:border-accent-500 hover:bg-[#1b1b22] disabled:opacity-60">
      <img src={getPlayerImageUrl(player.player_id)} alt={player.full_name} loading="lazy"
        className="h-20 w-20 rounded-full object-cover object-top bg-[#101015] mb-2.5" />
      <span className="text-[14px] font-medium text-center leading-tight mb-1.5 text-white">{player.full_name}</span>
      <span className="flex items-center gap-1.5 text-muted">
        <PositionBadge position={player.position} />
        {player.team && <span className="text-[12px] text-[#75757f]">{player.team}</span>}
      </span>
    </button>
  );
}

function TradeSide({ players, disabled, onClick }: { players: Player[]; disabled: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="group flex flex-col items-stretch gap-2 rounded-xl border border-[#22222b] bg-[#141419] p-3 transition-all hover:border-accent-500 hover:bg-[#1b1b22] disabled:opacity-60">
      {players.map((p) => (
        <div key={p.player_id} className="flex items-center gap-2.5 min-w-0">
          <img src={getPlayerImageUrl(p.player_id)} alt={p.full_name} loading="lazy"
            className="h-9 w-9 rounded-full object-cover object-top bg-[#101015] shrink-0" />
          <div className="min-w-0 text-left">
            <div className="text-[13px] font-medium text-white truncate leading-tight">{p.full_name}</div>
            <div className="flex items-center gap-1.5"><PositionBadge position={p.position} />{p.team && <span className="text-[11px] text-[#75757f]">{p.team}</span>}</div>
          </div>
        </div>
      ))}
    </button>
  );
}
