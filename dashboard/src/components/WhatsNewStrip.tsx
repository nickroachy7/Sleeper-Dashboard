import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, TrendingUp, TrendingDown, X } from 'lucide-react';
import { useWhatsNew } from '../hooks/useWhatsNew';

// ── "Since you were away" strip ──────────────────────────────────────────────
// The return-hook payoff at the top of the Feed: how the crowd moved on the
// players YOU have takes on since your last visit — framed as "toward" or "away
// from" your read. This is the client-side ancestor of real notifications.

export function WhatsNewStrip() {
  const { since, items, markSeen } = useWhatsNew();
  const [dismissed, setDismissed] = useState(false);

  // On the very first visit there's no `since` baseline yet, so nothing renders
  // and the query stays idle — but we still stamp "seen" so the NEXT visit has a
  // window to measure from. Only stamps once a baseline is absent.
  useEffect(() => {
    if (since === null) markSeen();
  }, [since, markSeen]);

  if (dismissed || since === null || items.length === 0) return null;

  const toward = items.filter((i) => i.towardYou).length;
  const away = items.length - toward;

  return (
    <section className="relative overflow-hidden rounded-2xl border border-accent-500/20 bg-accent-500/[0.05]">
      <div className="pointer-events-none absolute -top-16 -right-10 h-40 w-40 rounded-full bg-accent-500/10 blur-3xl" />
      <div className="relative p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent-500" />
            <p className="text-[13px] font-bold text-white">
              Since you were away
              <span className="ml-2 font-normal text-faint">
                the crowd moved on {items.length} of your take{items.length === 1 ? '' : 's'}
                {toward > 0 && away > 0 ? ` · ${toward} toward you, ${away} against` : ''}
              </span>
            </p>
          </div>
          <button
            onClick={() => { markSeen(); setDismissed(true); }}
            className="shrink-0 -mt-0.5 -mr-1 p-1 rounded-md text-faint hover:text-white hover:bg-white/5 transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 space-y-1.5">
          {items.map((i) => {
            const up = i.crowdMove > 0;
            return (
              <Link
                key={i.playerId}
                to={`/players/${i.playerId}`}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 -mx-2 hover:bg-white/[0.04] transition-colors"
              >
                <span className={`inline-flex items-center gap-1 text-[12px] font-semibold tabular-nums w-16 shrink-0 ${up ? 'text-accent-400' : 'text-red-400'}`}>
                  {up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                  {up ? '+' : ''}{i.crowdMove.toLocaleString()}
                </span>
                <span className="text-[13px] text-white truncate flex-1 min-w-0">
                  {i.name}
                  {i.position && <span className="text-faint"> · {i.position}{i.team ? ` ${i.team}` : ''}</span>}
                </span>
                <span className={`text-[11px] font-semibold shrink-0 ${i.towardYou ? 'text-accent-400' : 'text-red-400'}`}>
                  {i.towardYou ? 'toward your take' : 'against your take'}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
