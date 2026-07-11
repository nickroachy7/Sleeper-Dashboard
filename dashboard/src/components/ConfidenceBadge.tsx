/**
 * Confidence indicator for a community value.
 *
 * Maps the Glicko rating deviation (RD) to a human label. A freshly-seeded
 * player sits at RD 350 (pure prior, unproven); real trades and votes shrink it
 * toward ~30 (heavily-evaluated, settled). This is something KTC never exposed:
 * how much the crowd has actually weighed in on a value.
 */
interface ConfidenceBadgeProps {
  rd: number | null | undefined;
  size?: 'sm' | 'md';
}

function tier(rd: number): { label: string; dot: string; text: string } {
  if (rd <= 90) return { label: 'Settled', dot: 'bg-emerald-400', text: 'text-emerald-400' };
  if (rd <= 175) return { label: 'Firming', dot: 'bg-amber-400', text: 'text-amber-400' };
  return { label: 'Unproven', dot: 'bg-[#75757f]', text: 'text-[#75757f]' };
}

export function ConfidenceBadge({ rd, size = 'md' }: ConfidenceBadgeProps) {
  if (rd == null) return null;
  const t = tier(rd);
  const dim = size === 'sm' ? 'h-1.5 w-1.5' : 'h-2 w-2';
  const txt = size === 'sm' ? 'text-[10px]' : 'text-[11px]';
  return (
    <span className={`inline-flex items-center gap-1 ${txt} font-medium ${t.text}`} title={`Rating deviation ${Math.round(rd)} — lower means more trades and votes have confirmed this value`}>
      <span className={`${dim} rounded-full ${t.dot}`} />
      {t.label}
    </span>
  );
}
