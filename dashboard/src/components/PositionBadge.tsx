const positionStyles: Record<string, string> = {
  QB: 'bg-red-500/20 text-red-400',
  RB: 'bg-emerald-500/20 text-emerald-400',
  WR: 'bg-blue-500/20 text-blue-400',
  TE: 'bg-orange-500/20 text-orange-400',
  K: 'bg-yellow-500/20 text-yellow-400',
  DEF: 'bg-purple-500/20 text-purple-400',
  PICK: 'bg-cyan-500/20 text-cyan-400',
  FLEX: 'bg-purple-500/20 text-purple-400',
  SUPER_FLEX: 'bg-pink-500/20 text-pink-400',
  BN: 'bg-zinc-500/20 text-zinc-400',
};

interface PositionBadgeProps {
  position: string;
  size?: 'xs' | 'sm' | 'md';
}

export function PositionBadge({ position, size = 'xs' }: PositionBadgeProps) {
  const style = positionStyles[position] || 'bg-[#111111] text-[#888888]';
  const sizeClass = size === 'xs'
    ? 'px-1.5 py-0.5 text-[10px]'
    : size === 'sm'
    ? 'px-2 py-0.5 text-[11px]'
    : 'px-2.5 py-1 text-xs';

  return (
    <span className={`inline-flex items-center rounded font-bold leading-none ${style} ${sizeClass}`}>
      {position === 'SUPER_FLEX' ? 'SF' : position === 'BN' ? 'Bench' : position}
    </span>
  );
}
