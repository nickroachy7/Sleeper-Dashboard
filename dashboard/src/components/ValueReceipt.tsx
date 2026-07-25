import { TrendingUp, TrendingDown, Minus, Receipt } from 'lucide-react';
import type { ValueReceipt as Receipt_t } from '../hooks/useValueReceipt';

// ── Value-move receipt card ──────────────────────────────────────────────────
// The transparent "why this value moved" panel — YAP's answer to the black-box
// value. Shows the 7d/30d change, the rank move, and (when the counts RPC is
// live) the trades + votes behind it.

function Delta({ label, value }: { label: string; value: number | null }) {
  if (value == null) return null;
  const up = value > 0, down = value < 0;
  const tone = up ? 'text-accent-400' : down ? 'text-red-400' : 'text-faint';
  const Icon = up ? TrendingUp : down ? TrendingDown : Minus;
  return (
    <span className={`inline-flex items-center gap-1 ${tone} font-semibold tabular-nums`}>
      <Icon className="h-3.5 w-3.5" />
      {up ? '+' : ''}{value.toLocaleString()}
      <span className="text-faint font-normal">{label}</span>
    </span>
  );
}

export function ValueReceipt({ receipt }: { receipt: Receipt_t | null }) {
  if (!receipt) return null;
  const { d7, d30, rankNow, rankPast, why, direction } = receipt;

  // Nothing worth a receipt if the value hasn't moved and we've no attribution.
  const moved = (d7 ?? 0) !== 0 || (d30 ?? 0) !== 0;
  if (!moved && !why) return null;

  const rankMoved = rankNow != null && rankPast != null && rankNow !== rankPast;
  // Lower rank number = more valuable, so rankPast > rankNow means "climbed".
  const climbed = rankMoved && rankPast! > rankNow!;

  return (
    <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex items-center gap-1.5 mb-3">
        <Receipt className="h-3.5 w-3.5 text-accent-500" />
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent-500">Why the value moved</p>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
        <Delta label="7d" value={d7} />
        <Delta label="30d" value={d30} />
        {rankMoved && (
          <span className={`inline-flex items-center gap-1 font-semibold ${climbed ? 'text-accent-400' : 'text-red-400'}`}>
            {climbed ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            #{rankPast} → #{rankNow}
            <span className="text-faint font-normal">overall</span>
          </span>
        )}
        {!moved && <span className="text-faint">Value held steady.</span>}
      </div>

      {/* Attribution — only when the counts RPC is deployed. */}
      {why && (why.trades > 0 || why.votes > 0) && (
        <p className="mt-3 text-[12px] text-muted leading-snug">
          {direction === 'up' ? 'Leaning up' : direction === 'down' ? 'Leaning down' : 'Active'} this week:{' '}
          <span className="text-ink-soft font-semibold">
            {why.trades > 0 && `${why.trades.toLocaleString()} real trade${why.trades === 1 ? '' : 's'}`}
            {why.trades > 0 && why.votes > 0 && ' + '}
            {why.votes > 0 && `${why.votes.toLocaleString()} vote${why.votes === 1 ? '' : 's'}`}
          </span>{' '}
          moved the market.
        </p>
      )}
    </section>
  );
}
