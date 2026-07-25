import type { TakeVsCrowd } from '../hooks/useTakeVsCrowd';

// ── Take chip ────────────────────────────────────────────────────────────────
// The compact, repeatable rendering of "your take vs the crowd" for one player.
// Two shapes:
//   • full  — "You WR4 · Crowd WR9 ▲5"  (detail header, roomy contexts)
//   • inline — "▲5 vs crowd"            (dense list rows, via PlayerRow `meta`)
// Renders nothing when the user has no divergence to show (same rank) unless
// `showAgree` is set, and nothing at all for a null take (guest / off-board).

export function TakeChip({
  take,
  variant = 'inline',
  showAgree = false,
}: {
  take: TakeVsCrowd | null;
  variant?: 'full' | 'inline';
  showAgree?: boolean;
}) {
  if (!take) return null;
  const { position, yourPosRank, crowdPosRank, posRankDelta } = take;
  const higher = posRankDelta > 0; // you rank them ABOVE the crowd
  const agree = posRankDelta === 0;

  if (agree && !showAgree) return null;

  const arrow = agree ? '=' : higher ? `▲${posRankDelta}` : `▼${Math.abs(posRankDelta)}`;
  const tone = agree
    ? 'text-faint'
    : higher
      ? 'text-accent-400'
      : 'text-red-400';

  if (variant === 'inline') {
    return (
      <span className={`${tone} font-semibold`} title={`You: ${position}${yourPosRank} · Crowd: ${position}${crowdPosRank}`}>
        {agree ? 'with the crowd' : `${arrow} vs crowd`}
      </span>
    );
  }

  // full
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-overlay px-2.5 py-1 text-[11px] font-semibold"
      title="Your position rank vs the community's"
    >
      <span className="text-ink-soft">You {position}{yourPosRank}</span>
      <span className="text-ghost">·</span>
      <span className="text-muted">Crowd {position}{crowdPosRank}</span>
      {!agree && <span className={tone}>{arrow}</span>}
    </span>
  );
}
