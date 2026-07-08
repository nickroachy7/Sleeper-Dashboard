import { useState } from 'react';
import { NavLink, Outlet, useLocation, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  ArrowLeftRight,
  Scale,
  Settings,
  TrendingUp,
  Sparkles,
  Layers,
  Menu,
  X,
  Search,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useRealtimeSync } from '../hooks/useRealtimeSync';
import { LookupSearch } from './LookupSearch';
import { TopBar } from './TopBar';
import { openLookup } from '../lib/lookup';

// ── Nav Configuration ───────────────────────────────────────────────

interface NavItem {
  to: string;
  icon: typeof LayoutDashboard;
  iconImage?: string;
  label: string;
}

const primaryNav: NavItem[] = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/trade', icon: Scale, label: 'Trade Tools' },
  { to: '/ktc-values', icon: TrendingUp, iconImage: '/ktc-logo.png', label: 'KTC Values' },
  { to: '/chat', icon: Sparkles, label: 'League Chat' },
];

const secondaryNav: NavItem[] = [
  { to: '/transactions', icon: ArrowLeftRight, label: 'Transactions' },
];

// Full nav for the mobile drawer (every page, in order).
const drawerNav: NavItem[] = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/trade', icon: Scale, label: 'Trade Tools' },
  { to: '/ktc-values', icon: TrendingUp, iconImage: '/ktc-logo.png', label: 'KTC Values' },
  { to: '/chat', icon: Sparkles, label: 'League Chat' },
  { to: '/transactions', icon: ArrowLeftRight, label: 'Transactions' },
  { to: '/drafts', icon: Layers, label: 'Drafts' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

// ── Component ───────────────────────────────────────────────────────

export default function Layout() {
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  useRealtimeSync();

  const { data: league } = useQuery({
    queryKey: ['layout-league'],
    queryFn: async () => {
      const { data } = await supabase
        .from('leagues')
        .select('name, season, total_rosters, status')
        .order('season', { ascending: false })
        .limit(1);
      return data?.[0] || null;
    },
    staleTime: 5 * 60 * 1000,
  });

  const isNavItemActive = (to: string) => {
    if (to === '/') return location.pathname === '/';
    return location.pathname === to || location.pathname.startsWith(to + '/');
  };

  // ── Shared NavLink renderer ──
  const renderNavItem = ({ to, icon: Icon, iconImage, label }: NavItem, isPrimary: boolean) => (
    <NavLink
      key={to}
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `group relative flex items-center gap-3 px-3 ${isPrimary ? 'py-3' : 'py-2.5'} rounded-lg text-sm transition-all duration-200 ${
          isActive
            ? 'bg-accent-500/10 text-white'
            : 'text-[#80808c] hover:bg-[#1b1b22] hover:text-[#d6d6de]'
        }`
      }
    >
      {({ isActive }) => (
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
      )}
    </NavLink>
  );

  return (
    <div className="min-h-dvh">
      {/* ── Mobile Header ── */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-[#0d0d11]/90 backdrop-blur-xl border-b border-[#2a2a34] pt-[env(safe-area-inset-top)]">
        <div className="relative flex items-center justify-between h-14 px-2">
          <button
            onClick={() => setNavOpen(true)}
            aria-label="Open menu"
            className="w-10 h-10 rounded-lg flex items-center justify-center text-[#9c9ca7] hover:text-white hover:bg-[#1b1b22] active:bg-[#22222b] transition-colors"
          >
            <Menu className="h-[22px] w-[22px]" />
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

      {/* ── Mobile Nav Drawer ── */}
      {navOpen && (
        <div className="lg:hidden fixed inset-0 z-[70]" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setNavOpen(false)} />
          <div className="absolute top-0 left-0 bottom-0 w-[82%] max-w-xs bg-[#141419] border-r border-[#2a2a34] flex flex-col pt-[env(safe-area-inset-top)] shadow-2xl">
            <div className="flex items-center justify-between h-14 px-4 border-b border-[#1b1b22] shrink-0">
              <img src="/yapsports-logo.webp" alt="Sleeper Dashboard" className="h-7 w-auto" />
              <button
                onClick={() => setNavOpen(false)}
                aria-label="Close menu"
                className="w-9 h-9 -mr-1 rounded-lg flex items-center justify-center text-[#9c9ca7] hover:text-white active:bg-[#1b1b22] transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {league && (
              <div className="px-4 py-3 border-b border-[#1b1b22] shrink-0">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${
                    league.status === 'in_season' || league.status === 'drafting' ? 'bg-emerald-500'
                      : league.status === 'complete' ? 'bg-[#75757f]' : 'bg-amber-500'
                  }`} />
                  <span className="text-[13px] font-bold text-white truncate">{league.name}</span>
                </div>
                <p className="text-[11px] text-[#75757f] pl-4">{league.season} Season · {league.total_rosters} Teams</p>
              </div>
            )}

            <nav className="flex-1 overflow-y-auto p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
              {drawerNav.map(({ to, icon: Icon, iconImage, label }) => {
                const active = isNavItemActive(to);
                return (
                  <Link
                    key={to}
                    to={to}
                    onClick={() => setNavOpen(false)}
                    className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-colors ${
                      active ? 'bg-accent-500/10 text-white' : 'text-[#9c9ca7] active:bg-[#1b1b22]'
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${active ? 'bg-accent-500/20' : 'bg-[#1b1b22]'}`}>
                      {iconImage ? (
                        <img src={iconImage} alt="" className="h-4 w-4 object-contain" />
                      ) : (
                        <Icon className={`h-[18px] w-[18px] ${active ? 'text-accent-400' : 'text-[#75757f]'}`} />
                      )}
                    </div>
                    <span className="text-[15px] font-semibold">{label}</span>
                  </Link>
                );
              })}
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

        {/* League Identity */}
        {league && (
          <div className="px-5 py-4 border-b border-[#1b1b22] shrink-0">
            <div className="flex items-center gap-2 mb-1">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  league.status === 'in_season' || league.status === 'drafting'
                    ? 'bg-emerald-500'
                    : league.status === 'complete'
                      ? 'bg-[#75757f]'
                      : 'bg-amber-500'
                }`}
              />
              <span className="text-xs font-semibold text-white truncate">{league.name}</span>
            </div>
            <p className="text-[11px] text-[#75757f] pl-4">
              {league.season} Season · {league.total_rosters} Teams
            </p>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 p-3 overflow-y-auto">
          {/* Primary Nav */}
          <div className="space-y-0.5">
            {primaryNav.map((item) => renderNavItem(item, true))}
          </div>

          {/* Secondary Nav */}
          <div className="mt-6">
            <h2 className="px-3 mb-2 text-[10px] font-bold text-[#60606a] uppercase tracking-[2px]">
              League
            </h2>
            <div className="space-y-0.5">
              {secondaryNav.map((item) => renderNavItem(item, false))}
            </div>
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
            Values via KeepTradeCut.com
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
    </div>
  );
}
