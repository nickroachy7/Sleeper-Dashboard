import { NavLink, Outlet, useLocation, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Scale,
  Settings,
  TrendingUp,
  Trophy,
  Search,
  MessageSquare,
  MessageSquarePlus,
} from 'lucide-react';
import { useRealtimeSync } from '../hooks/useRealtimeSync';
import { LookupSearch } from './LookupSearch';
import { TopBar } from './TopBar';
import { LeagueSwitcher } from './LeagueSwitcher';
import { AddLeagueModal } from './AddLeagueModal';
import { SessionContributeModal } from './SessionContributeModal';
import { openLookup } from '../lib/lookup';

// ── Nav Configuration ───────────────────────────────────────────────

interface NavItem {
  to: string;
  icon: typeof LayoutDashboard;
  iconImage?: string;
  label: string;
  /** Extra path prefixes that belong to this section (keep the item highlighted
   *  when on a sibling route, e.g. Transactions/Drafts under League). */
  match?: string[];
}

// Primary destinations — desktop sidebar + mobile top tab strip.
const primaryNav: NavItem[] = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/league', icon: Trophy, label: 'League', match: ['/transactions', '/drafts'] },
  { to: '/players', icon: TrendingUp, label: 'Players', match: ['/value-vote'] },
  { to: '/trade', icon: Scale, label: 'Trade' },
  { to: '/chat', icon: MessageSquare, label: 'Chat' },
];

// Secondary destinations — desktop sidebar footer + tail of the mobile strip.
const secondaryNav: NavItem[] = [
  { to: '/settings', icon: Settings, label: 'Settings' },
  { to: '/feedback', icon: MessageSquarePlus, label: 'Feedback' },
];

// ── Component ───────────────────────────────────────────────────────

export default function Layout() {
  const location = useLocation();
  useRealtimeSync();

  const isNavItemActive = (to: string, match?: string[]) => {
    if (match?.some((p) => location.pathname.startsWith(p))) return true;
    if (to === '/') return location.pathname === '/';
    return location.pathname === to || location.pathname.startsWith(to + '/');
  };

  // ── Desktop sidebar NavLink renderer ──
  const renderSidebarItem = ({ to, icon: Icon, iconImage, label, match }: NavItem) => {
    const sectionActive = match?.some((p) => location.pathname.startsWith(p)) ?? false;
    return (
      <NavLink
        key={to}
        to={to}
        end={to === '/'}
        className={({ isActive }) =>
          `group relative flex items-center gap-3 px-3 py-3 rounded-lg text-sm transition-all duration-200 ${
            isActive || sectionActive
              ? 'bg-accent-500/10 text-white'
              : 'text-[#80808c] hover:bg-[#1b1b22] hover:text-[#d6d6de]'
          }`
        }
      >
        {({ isActive: navActive }) => {
          const isActive = navActive || sectionActive;
          return (
            <>
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-accent-500 rounded-r-full" />
              )}
              <div
                className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                  isActive ? 'bg-accent-500/20' : 'bg-[#141419] group-hover:bg-[#22222b]'
                }`}
              >
                {iconImage ? (
                  <img src={iconImage} alt="" className="h-4 w-4 object-contain" />
                ) : (
                  <Icon className={`h-[18px] w-[18px] ${isActive ? 'text-accent-400' : 'text-[#75757f]'}`} />
                )}
              </div>
              <span className="font-medium text-[14px]">{label}</span>
            </>
          );
        }}
      </NavLink>
    );
  };

  return (
    <div className="min-h-dvh">
      {/* ── Mobile Header: logo + league switcher + search, then a persistent tab strip ── */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-[80] bg-[#0d0d11]/90 backdrop-blur-xl border-b border-[#2a2a34] pt-[env(safe-area-inset-top)]">
        {/* Row 1 — search (left) · logo (center → dashboard) · league switcher (right) */}
        <div className="relative flex items-center justify-between h-14 px-3">
          <button
            onClick={openLookup}
            aria-label="Search or ask"
            className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-[#9c9ca7] hover:text-white hover:bg-[#1b1b22] active:bg-[#22222b] transition-colors"
          >
            <Search className="h-[20px] w-[20px]" />
          </button>
          <Link
            to="/"
            aria-label="Dashboard"
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 active:opacity-70 transition-opacity"
          >
            <img src="/yapsports-logo.webp" alt="Sleeper Dashboard" className="h-7 w-auto" />
          </Link>
          <LeagueSwitcher compact />
        </div>

        {/* Row 2 — persistent tab strip (primary destinations, then settings/feedback) */}
        <nav className="flex items-stretch h-12 px-1 overflow-x-auto no-scrollbar border-t border-[#1b1b22]">
          {[...primaryNav, ...secondaryNav].map(({ to, label, match }) => {
            const active = isNavItemActive(to, match);
            return (
              <Link
                key={to}
                to={to}
                className={`shrink-0 flex items-center px-3.5 text-[13.5px] whitespace-nowrap border-b-2 transition-colors ${
                  active
                    ? 'text-accent-500 border-accent-500 font-semibold'
                    : 'text-[#80808c] border-transparent font-medium active:text-white'
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </header>

      {/* ── Desktop Sidebar ── */}
      <aside className="hidden lg:flex fixed top-0 left-0 z-50 h-full w-64 bg-[#141419] border-r border-[#2a2a34] flex-col">
        {/* Logo */}
        <div className="h-16 flex items-center px-5 border-b border-[#2a2a34] shrink-0">
          <img src="/yapsports-logo.webp" alt="Sleeper Dashboard" className="h-10 w-auto" />
        </div>

        {/* League Identity + Switcher */}
        <div className="px-5 py-4 border-b border-[#1b1b22] shrink-0">
          <LeagueSwitcher />
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 overflow-y-auto">
          <div className="space-y-0.5">
            {primaryNav.map((item) => renderSidebarItem(item))}
          </div>
        </nav>

        {/* Sidebar Footer */}
        <div className="px-5 py-3 border-t border-[#1b1b22] shrink-0">
          {secondaryNav.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-2 py-2 rounded-lg text-[13px] transition-all ${
                  isActive
                    ? 'text-white bg-[#1b1b22]'
                    : 'text-[#75757f] hover:text-[#9c9ca7] hover:bg-[#17171d]'
                }`
              }
            >
              <Icon className="h-4 w-4" />
              <span className="font-medium">{label}</span>
            </NavLink>
          ))}
          <p className="text-[10px] text-[#75757f] mt-2 px-2">
            Community-powered values
          </p>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <div className="sidebar-layout-main">
        <TopBar />
        <main className="min-h-dvh pt-[calc(104px+env(safe-area-inset-top))] lg:pt-0">
          <Outlet />
        </main>
        <LookupSearch />
      </div>
      <AddLeagueModal />
      <SessionContributeModal />
    </div>
  );
}
