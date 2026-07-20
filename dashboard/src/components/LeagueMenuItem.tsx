import type { ReactNode } from 'react';

/**
 * One row in a league dropdown menu — shared by LeaguePicker and LeagueSwitcher
 * so the two menus read identically: a status/selection dot, the league name,
 * a muted sub-line (season), and an optional trailing node (e.g. a check).
 */
export function LeagueMenuItem({
  name,
  sub,
  active,
  onClick,
  trailing,
}: {
  name: string;
  sub: ReactNode;
  active: boolean;
  onClick: () => void;
  trailing?: ReactNode;
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-elevated transition-colors"
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${active ? 'bg-accent-500' : 'bg-line-strong'}`} />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-white truncate">{name}</p>
        <p className="text-[11px] text-faint">{sub}</p>
      </div>
      {trailing}
    </button>
  );
}
