const positionStyles: Record<string, string> = {
  QB: 'bg-red-500/90 text-white',
  RB: 'bg-blue-600/90 text-white',
  WR: 'bg-amber-500/90 text-white',
  TE: 'bg-teal-500/90 text-white',
  K: 'bg-yellow-500/90 text-white',
  DEF: 'bg-purple-500/90 text-white',
  PICK: 'bg-cyan-500/90 text-white',
  FLEX: 'bg-purple-500/90 text-white',
  SUPER_FLEX: 'bg-pink-500/90 text-white',
  BN: 'bg-zinc-500/90 text-white',
  // IDP families — one hue per slot group (DL / LB / DB) so defensive players
  // read distinctly from offense once a user opts them in.
  DL: 'bg-orange-600/90 text-white',
  DE: 'bg-orange-600/90 text-white',
  DT: 'bg-orange-600/90 text-white',
  NT: 'bg-orange-600/90 text-white',
  EDGE: 'bg-orange-600/90 text-white',
  LB: 'bg-lime-600/90 text-white',
  ILB: 'bg-lime-600/90 text-white',
  OLB: 'bg-lime-600/90 text-white',
  MLB: 'bg-lime-600/90 text-white',
  DB: 'bg-sky-600/90 text-white',
  CB: 'bg-sky-600/90 text-white',
  S: 'bg-sky-600/90 text-white',
  SS: 'bg-sky-600/90 text-white',
  FS: 'bg-sky-600/90 text-white',
};

interface PositionBadgeProps {
  position: string;
  size?: 'xs' | 'sm' | 'md';
}

export function PositionBadge({ position, size = 'xs' }: PositionBadgeProps) {
  const style = positionStyles[position] || 'bg-[#1b1b22] text-[#9c9ca7]';
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
