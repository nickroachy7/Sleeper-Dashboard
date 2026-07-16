import { useLocation } from 'react-router-dom';
import { Search } from 'lucide-react';
import { openLookup } from '../lib/lookup';

const TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/league': 'League',
  '/trade': 'Trade',
  '/players': 'Players',
  '/value-vote': 'Players',
  '/chat': 'Chat',
  '/settings': 'Settings',
  '/feedback': 'Feedback',
};

function titleForPath(pathname: string): string {
  if (TITLES[pathname]) return TITLES[pathname];
  if (pathname.startsWith('/players/')) return 'Player';
  if (pathname.startsWith('/teams/')) return 'Team';
  return 'Dashboard';
}

/**
 * Desktop top bar: current-page title on the left, search box on the right.
 * The search box opens the shared LookupSearch palette. Rendered inside the
 * main content column so it aligns with the sidebar layout.
 */
export function TopBar() {
  const { pathname } = useLocation();
  const title = titleForPath(pathname);

  return (
    <div className="hidden lg:flex sticky top-0 z-30 h-14 items-center justify-between gap-4 px-6 xl:px-8 bg-[#0d0d11]/80 backdrop-blur-xl border-b border-[#1b1b22]">
      <h1 className="font-display text-[15px] font-semibold text-[#d6d6de] tracking-tight truncate">
        {title}
      </h1>

      <button
        onClick={openLookup}
        aria-label="Search or ask the assistant"
        className="group flex items-center gap-2.5 h-9 w-72 px-3 rounded-lg bg-[#141419] border border-[#26262f] text-[#75757f] hover:border-[#363641] hover:text-[#9c9ca7] transition-colors"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="text-[13px]">Search or ask…</span>
        <kbd className="ml-auto text-[10px] font-semibold text-[#60606a] bg-[#1b1b22] border border-[#26262f] rounded px-1.5 py-0.5 leading-none">
          ⌘K
        </kbd>
      </button>
    </div>
  );
}
