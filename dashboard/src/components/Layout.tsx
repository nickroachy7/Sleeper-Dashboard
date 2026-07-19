import { NavLink, Outlet, useLocation, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Scale,
  Settings,
  TrendingUp,
  Trophy,
  Search,
  MessageSquarePlus,
} from 'lucide-react';
import { useRealtimeSync } from '../hooks/useRealtimeSync';
import { LookupSearch } from './LookupSearch';
import { TopBar } from './TopBar';
import { LeagueSwitcher } from './LeagueSwitcher';
import { ProfileMenu } from './ProfileMenu';
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

// Primary destinations — desktop sidebar + mobile top tab strip. The
// assistant no longer has a tab: it lives inside the search palette ("search
// or ask"), reached from the search button in the header/top bar.
const primaryNav: NavItem[] = [
  { to: '/', icon: LayoutDashboard, label: 'Home' },
  { to: '/league', icon: Trophy, label: 'League' },
  { to: '/players', icon: TrendingUp, label: 'Players', match: ['/value-vote'] },
  { to: '/trade', icon: Scale, label: 'Tools' },
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
  // Flat, modern row: bare icon + label, one soft highlight for the active item
  // (no per-icon tile, no separate accent bar). Icon picks up the accent when
  // active. Shared by the primary group and the footer for a consistent look.
  const renderSidebarItem = ({ to, icon: Icon, iconImage, label, match }: NavItem) => {
    const sectionActive = match?.some((p) => location.pathname.startsWith(p)) ?? false;
    return (
      <NavLink
        key={to}
        to={to}
        end={to === '/'}
        className={({ isActive }) =>
          `group flex items-center gap-3 px-3 h-9 rounded-lg text-[14px] transition-colors duration-150 ${
            isActive || sectionActive
              ? 'bg-white/[0.06] text-white font-semibold'
              : 'text-[#80808c] hover:text-[#d6d6de] hover:bg-white/[0.03] font-medium'
          }`
        }
      >
        {({ isActive: navActive }) => {
          const isActive = navActive || sectionActive;
          return (
            <>
              {iconImage ? (
                <img src={iconImage} alt="" className="h-[18px] w-[18px] object-contain shrink-0" />
              ) : (
                <Icon className={`h-[18px] w-[18px] shrink-0 transition-colors ${isActive ? 'text-accent-500' : 'text-[#6c6c76] group-hover:text-[#9c9ca7]'}`} />
              )}
              <span>{label}</span>
            </>
          );
        }}
      </NavLink>
    );
  };

  return (
    <div className="min-h-dvh">
      {/* ── Mobile Header: logo + league switcher + search, then a persistent
          tab strip. ── */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-[80] bg-[#0d0d11]/90 backdrop-blur-xl border-b border-[#2a2a34] pt-[env(safe-area-inset-top)]">
        {/* Row 1 — search (left) · logo (center → dashboard) · profile (right).
            The profile sheet carries identity, league switching, and account
            actions (the old compact league switcher's job). */}
        <div className="relative flex items-center justify-between h-14 px-3">
          <button
            onClick={() => openLookup()}
            aria-label="Search or ask"
            className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-[#9c9ca7] hover:text-white hover:bg-[#1b1b22] active:bg-[#22222b] transition-colors"
          >
            <Search className="h-[20px] w-[20px]" />
          </button>
          <Link
            to="/"
            aria-label="Home"
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 active:opacity-70 transition-opacity"
          >
            <img src="/yapsports-logo.webp" alt="Sleeper Dashboard" className="h-7 w-auto" />
          </Link>
          <ProfileMenu />
        </div>

        {/* Row 2 — persistent tab strip. Primary destinations only; Settings &
            Feedback live in the league-switcher menu (top-right avatar). Tabs
            share the row equally (flex-1) so all five fit with no side-scroll. */}
        <nav className="flex items-stretch h-12 border-t border-[#1b1b22]">
          {primaryNav.map(({ to, label, match }) => {
            const active = isNavItemActive(to, match);
            return (
              <Link
                key={to}
                to={to}
                className={`flex-1 min-w-0 flex items-center justify-center text-[13px] whitespace-nowrap border-b-2 transition-colors ${
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
      <aside className="hidden lg:flex fixed top-0 left-0 z-50 h-full w-64 bg-[#0f0f13] border-r border-[#1f1f27] flex-col">
        {/* Logo */}
        <div className="h-16 flex items-center px-5 shrink-0">
          <img src="/yapsports-logo.webp" alt="Sleeper Dashboard" className="h-9 w-auto" />
        </div>

        {/* League Identity + Switcher */}
        <div className="px-3 pb-3 shrink-0">
          <div className="px-2 py-3 rounded-xl bg-white/[0.03] border border-[#1f1f27]">
            <LeagueSwitcher />
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 overflow-y-auto">
          <p className="px-3 pt-1 pb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#5a5a64]">Menu</p>
          <div className="space-y-0.5">
            {primaryNav.map((item) => renderSidebarItem(item))}
          </div>
        </nav>

        {/* Sidebar Footer */}
        <div className="px-3 py-3 border-t border-[#1b1b22] shrink-0 space-y-0.5">
          {secondaryNav.map((item) => renderSidebarItem(item))}
          <p className="text-[10px] text-[#5a5a64] pt-2 px-3">
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
