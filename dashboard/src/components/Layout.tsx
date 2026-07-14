import { useState } from 'react';
import { NavLink, Outlet, useLocation, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Scale,
  Settings,
  TrendingUp,
  Sparkles,
  Trophy,
  Menu,
  X,
  Search,
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

const primaryNav: NavItem[] = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/league', icon: Trophy, label: 'League', match: ['/transactions', '/drafts'] },
  { to: '/players', icon: TrendingUp, label: 'Players', match: ['/value-vote'] },
  { to: '/trade', icon: Scale, label: 'Trade' },
  { to: '/chat', icon: Sparkles, label: 'Chat' },
];

// Full nav for the mobile drawer, grouped into editorial sections that
// mirror the desktop sidebar's hierarchy.
interface NavSection {
  heading: string;
  items: NavItem[];
}

const drawerSections: NavSection[] = [
  {
    heading: 'Main',
    items: [
      { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/league', icon: Trophy, label: 'League' },
      { to: '/players', icon: TrendingUp, label: 'Players' },
      { to: '/trade', icon: Scale, label: 'Trade' },
      { to: '/chat', icon: Sparkles, label: 'Chat' },
    ],
  },
  {
    heading: 'More',
    items: [
      { to: '/settings', icon: Settings, label: 'Settings' },
    ],
  },
];

// ── Component ───────────────────────────────────────────────────────

export default function Layout() {
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  useRealtimeSync();

  const isNavItemActive = (to: string, match?: string[]) => {
    if (match?.some((p) => location.pathname.startsWith(p))) return true;
    if (to === '/') return location.pathname === '/';
    return location.pathname === to || location.pathname.startsWith(to + '/');
  };

  // ── Shared NavLink renderer ──
  const renderNavItem = ({ to, icon: Icon, iconImage, label, match }: NavItem, isPrimary: boolean) => {
    const sectionActive = match?.some((p) => location.pathname.startsWith(p)) ?? false;
    return (
    <NavLink
      key={to}
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `group relative flex items-center gap-3 px-3 ${isPrimary ? 'py-3' : 'py-2.5'} rounded-lg text-sm transition-all duration-200 ${
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
          {/* Active indicator bar */}
          {isActive && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-accent-500 rounded-r-full" />
          )}
          <div
            className={`flex-shrink-0 ${isPrimary ? 'w-8 h-8' : 'w-7 h-7'} rounded-lg flex items-center justify-center transition-colors ${
              isActive
                ? 'bg-accent-500/20'
                : 'bg-[#141419] group-hover:bg-[#22222b]'
            }`}
          >
            {iconImage ? (
              <img src={iconImage} alt="" className="h-4 w-4 object-contain" />
            ) : (
              <Icon
                className={`${isPrimary ? 'h-[18px] w-[18px]' : 'h-4 w-4'} ${
                  isActive ? 'text-accent-400' : 'text-[#75757f]'
                }`}
              />
            )}
          </div>
          <span className={`font-medium ${isPrimary ? 'text-[14px]' : 'text-[13px]'}`}>{label}</span>
        </>
        );
      }}
    </NavLink>
    );
  };

  return (
    <div className="min-h-dvh">
      {/* ── Mobile Header (stays fixed; burger toggles the drop-down menu) ── */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-[80] bg-[#0d0d11]/90 backdrop-blur-xl border-b border-[#2a2a34] pt-[env(safe-area-inset-top)]">
        <div className="relative flex items-center justify-between h-14 px-2">
          <button
            onClick={() => setNavOpen((open) => !open)}
            aria-label={navOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={navOpen}
            className="w-10 h-10 rounded-lg flex items-center justify-center text-[#9c9ca7] hover:text-white hover:bg-[#1b1b22] active:bg-[#22222b] transition-colors"
          >
            {navOpen ? <X className="h-[22px] w-[22px]" /> : <Menu className="h-[22px] w-[22px]" />}
          </button>
          <Link to="/" aria-label="Home" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 active:opacity-70 transition-opacity">
            <img src="/yapsports-logo.webp" alt="Sleeper Dashboard" className="h-7 w-auto" />
          </Link>
          <button
            onClick={openLookup}
            aria-label="Search players and teams"
            className="w-10 h-10 rounded-lg flex items-center justify-center text-[#9c9ca7] hover:text-white hover:bg-[#1b1b22] active:bg-[#22222b] transition-colors"
          >
            <Search className="h-[20px] w-[20px]" />
          </button>
        </div>
      </header>

      {/* ── Mobile Nav Drop-Down (falls from under the fixed header) ── */}
      {navOpen && (
        <div className="lg:hidden fixed inset-0 z-[70]" role="dialog" aria-modal="true">
          {/* Backdrop starts below the header so the header stays interactive */}
          <div
            className="absolute inset-x-0 bottom-0 top-[calc(56px+env(safe-area-inset-top))] bg-black/70 backdrop-blur-sm animate-menu-fade"
            onClick={() => setNavOpen(false)}
          />
          <div className="absolute inset-x-0 top-[calc(56px+env(safe-area-inset-top))] max-h-[calc(100dvh-56px-env(safe-area-inset-top))] overflow-y-auto bg-[#0f0f14] border-b border-[#2a2a34] shadow-2xl animate-menu-drop">
            <div className="px-4 py-3.5 border-b border-[#1b1b22]">
              <LeagueSwitcher onNavigate={() => setNavOpen(false)} />
            </div>

            <nav className="px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {drawerSections.map((section, si) => (
                <div key={section.heading} className={si > 0 ? 'mt-6' : ''}>
                  <h2 className="mb-1 text-[10px] font-semibold text-[#60606a] uppercase tracking-[2px]">
                    {section.heading}
                  </h2>
                  <div>
                    {section.items.map(({ to, label, match }) => {
                      const active = isNavItemActive(to, match);
                      return (
                        <Link
                          key={to}
                          to={to}
                          onClick={() => setNavOpen(false)}
                          className={`group flex items-center py-2.5 text-[16px] tracking-tight transition-colors ${
                            active
                              ? 'text-accent-500 font-semibold'
                              : 'text-[#c4c4cd] font-medium active:text-white'
                          }`}
                        >
                          {label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>
          </div>
        </div>
      )}

      {/* ── Desktop Sidebar ── */}
      <aside className="hidden lg:flex fixed top-0 left-0 z-50 h-full w-64 bg-[#141419] border-r border-[#2a2a34] flex-col">
        {/* Logo */}
        <div className="h-16 flex items-center px-5 border-b border-[#2a2a34] shrink-0">
          <img
            src="/yapsports-logo.webp"
            alt="Sleeper Dashboard"
            className="h-10 w-auto"
          />
        </div>

        {/* League Identity + Switcher */}
        <div className="px-5 py-4 border-b border-[#1b1b22] shrink-0">
          <LeagueSwitcher />
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 overflow-y-auto">
          {/* Primary Nav */}
          <div className="space-y-0.5">
            {primaryNav.map((item) => renderNavItem(item, true))}
          </div>
        </nav>

        {/* Sidebar Footer */}
        <div className="px-5 py-3 border-t border-[#1b1b22] shrink-0">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-2 py-2 rounded-lg text-[13px] transition-all ${
                isActive
                  ? 'text-white bg-[#1b1b22]'
                  : 'text-[#75757f] hover:text-[#9c9ca7] hover:bg-[#17171d]'
              }`
            }
          >
            <Settings className="h-4 w-4" />
            <span className="font-medium">Settings</span>
          </NavLink>
          <p className="text-[10px] text-[#75757f] mt-2 px-2">
            Community-powered values
          </p>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <div className="sidebar-layout-main">
        <TopBar />
        <main className="min-h-dvh pt-[calc(56px+env(safe-area-inset-top))] lg:pt-0">
          <Outlet />
        </main>
        <LookupSearch />
      </div>
      <AddLeagueModal />
      <SessionContributeModal />
    </div>
  );
}
