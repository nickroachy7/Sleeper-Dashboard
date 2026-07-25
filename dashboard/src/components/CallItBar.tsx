import { useState } from 'react';
import { Check, Scale } from 'lucide-react';
import { recordCalculatorVote } from '../lib/community-events';
import type { TradeSide } from './TradeCard';

// ── "Call it" ────────────────────────────────────────────────────────────────
// The opinion-native reaction on a feed trade: who won — side A, side B, or was
// it fair? It's a REACTION that's also a data contribution — the call records a
// calculator vote into the same value engine everything else feeds. This is how
// the machine-generated feed gets a human heartbeat without a free-text layer.
//
// One call per trade per device (localStorage), so the feed doesn't turn into a
// tap-farm. Picks are ignored for the vote payload (the calculator vote model is
// player-based); a trade that's all picks simply records nothing but still shows
// the acknowledgement.

const CALLED_KEY = 'yap.calledTrades';

function readCalled(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(CALLED_KEY) || '{}') || {}; } catch { return {}; }
}
function writeCalled(id: string, verdict: number) {
  try {
    const all = readCalled();
    all[id] = verdict;
    localStorage.setItem(CALLED_KEY, JSON.stringify(all));
  } catch { /* quota */ }
}

function CallButton({ label, tone, active, locked, onClick }: {
  label: string; tone: string; active: boolean; locked: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick(); }}
      disabled={locked}
      className={`flex-1 h-8 rounded-lg border text-[12px] font-semibold transition-colors disabled:cursor-default ${
        active
          ? `${tone} border-transparent`
          : locked
            ? 'border-line text-faint opacity-50'
            : 'border-line-strong text-muted hover:text-white hover:border-accent-500/50'
      }`}
    >
      {label}
    </button>
  );
}

export function CallItBar({ tradeId, sides }: { tradeId: string; sides: TradeSide[] }) {
  const [called, setCalled] = useState<number | null>(() => {
    const v = readCalled()[tradeId];
    return typeof v === 'number' ? v : null;
  });
  const [pending, setPending] = useState(false);

  // Needs two clean sides to attribute a call.
  if (sides.length !== 2) return null;
  const nameA = sides[0].teamName || 'Side A';
  const nameB = sides[1].teamName || 'Side B';

  const call = async (verdict: number) => {
    if (pending || called !== null) return;
    setPending(true);
    setCalled(verdict);
    writeCalled(tradeId, verdict);
    // The two received packages, as player-id arrays (picks omitted — the vote
    // model is player-based). Empty sides just record nothing, harmlessly.
    const sideA = sides[0].players.map((p) => p.id);
    const sideB = sides[1].players.map((p) => p.id);
    if (sideA.length || sideB.length) {
      try {
        await recordCalculatorVote({ sideA, sideB, verdict });
      } catch {
        /* non-fatal — the call still shows as registered locally */
      }
    }
    setPending(false);
  };

  const locked = pending || called !== null;

  return (
    <div className="mt-1.5 px-1.5">
      {called !== null ? (
        <div className="flex items-center gap-1.5 px-1 text-[11px] text-faint">
          <Check className="h-3.5 w-3.5 text-accent-500" />
          You called it {called === 1 ? nameA : called === 0 ? nameB : 'fair'} — that trains the values
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.12em] text-faint shrink-0">
            <Scale className="h-3 w-3" /> Call it
          </span>
          <div className="flex items-center gap-1.5 flex-1">
            <CallButton label={`${nameA} won`} tone="bg-accent-500/20 text-accent-300" active={called === 1} locked={locked} onClick={() => call(1)} />
            <CallButton label="Fair" tone="bg-white/10 text-white" active={called === 0.5} locked={locked} onClick={() => call(0.5)} />
            <CallButton label={`${nameB} won`} tone="bg-accent-500/20 text-accent-300" active={called === 0} locked={locked} onClick={() => call(0)} />
          </div>
        </div>
      )}
    </div>
  );
}
