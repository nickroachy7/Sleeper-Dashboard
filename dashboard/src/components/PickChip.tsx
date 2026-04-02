const roundStyles: Record<number, string> = {
  1: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  2: 'bg-[#161616] text-[#888888] border-[#2a2a2a]',
  3: 'bg-orange-500/15 text-orange-400 border-orange-500/25',
  4: 'bg-stone-500/15 text-stone-400 border-stone-500/25',
};

interface PickChipProps {
  season: string | number;
  round: number;
  originalOwner?: string;
  isAcquired?: boolean;
  value?: number;
  size?: 'sm' | 'md';
}

export function PickChip({ season, round, originalOwner, isAcquired, value, size = 'sm' }: PickChipProps) {
  const style = roundStyles[round] || roundStyles[4];
  const sizeClass = size === 'sm' ? 'px-2 py-1 text-[11px]' : 'px-3 py-1.5 text-xs';

  return (
    <div className={`inline-flex flex-col items-start rounded-lg border ${style} ${sizeClass} ${isAcquired ? 'ring-1 ring-emerald-500/50' : ''}`}>
      <span className={isAcquired ? 'font-bold' : 'font-medium'}>
        {season} Rd {round}
      </span>
      {isAcquired && originalOwner && (
        <span className="text-[9px] opacity-60 mt-0.5">
          via {originalOwner}
        </span>
      )}
      {value !== undefined && value > 0 && (
        <span className="text-[9px] opacity-50 mt-0.5">
          {value.toLocaleString()}
        </span>
      )}
    </div>
  );
}
