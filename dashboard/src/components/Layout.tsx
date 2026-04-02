import { NavLink, Outlet, useLocation, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  ArrowLeftRight,
  Scale,
  Settings,
  Home,
  TrendingUp,
  ScrollText,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

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
];

const secondaryNav: NavItem[] = [
  { to: '/transactions', icon: ArrowLeftRight, label: 'Transactions' },
];

const mobileNav = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/trade', icon: Scale, label: 'Trade' },
  { to: '/ktc-values', icon: TrendingUp, label: 'Values' },
  { to: '/transactions', icon: ScrollText, label: 'Transactions' },
];

// ── Component ───────────────────────────────────────────────────────

export default function Layout() {
  const location = useLocation();

  const { data: league } = useQuery({
    queryKey: ['layout-league'],
    queryFn: async () => {
      const { data } = await supabase
        .from('leagues')
        .select('name, season, total_rosters, status')
        .order('created_at', { ascending: false })
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
            : 'text-[#666666] hover:bg-[#111111] hover:text-[#cccccc]'
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
                : 'bg-[#0a0a0a] group-hover:bg-[#161616]'
            }`}
          >
            {iconImage ? (
              <img src={iconImage} alt="" className="h-4 w-4 object-contain" />
            ) : (
              <Icon
                className={`${isPrimary ? 'h-[18px] w-[18px]' : 'h-4 w-4'} ${
                  isActive ? 'text-accent-400' : 'text-[#555555]'
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
    <div className="min-h-screen bg-black">
      {/* ── Mobile Header + Nav ── */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-black/90 backdrop-blur-xl border-b border-[#1e1e1e]">
        <div className="flex items-center justify-center h-12 px-4">
          <img
            src="/yapsports-logo.webp"
            alt="Sleeper Dashboard"
            className="h-7 w-auto"
          />
        </div>
        <nav className="flex items-center justify-around px-2 border-t border-[#111111]">
          {mobileNav.map(({ to, icon: Icon, label }) => {
            const isActive = isNavItemActive(to);
            return (
              <Link
                key={to}
                to={to}
                className={`flex flex-col items-center gap-0.5 py-2 px-3 min-w-[56px] transition-colors ${
                  isActive ? 'text-accent-400' : 'text-[#555555]'
                }`}
              >
                <Icon className={`h-5 w-5 ${isActive ? 'text-accent-400' : 'text-[#555555]'}`} strokeWidth={isActive ? 2.5 : 1.5} />
                <span className={`text-[10px] font-semibold ${isActive ? 'text-accent-400' : 'text-[#444444]'}`}>
                  {label}
                </span>
              </Link>
            );
          })}
        </nav>
      </header>

      {/* ── Desktop Sidebar ── */}
      <aside className="hidden lg:flex fixed top-0 left-0 z-50 h-full w-64 bg-[#0a0a0a] border-r border-[#1e1e1e] flex-col">
        {/* Logo */}
        <div className="h-16 flex items-center px-5 border-b border-[#1e1e1e] shrink-0">
          <img
            src="/yapsports-logo.webp"
            alt="Sleeper Dashboard"
            className="h-10 w-auto"
          />
        </div>

        {/* League Identity */}
        {league && (
          <div className="px-5 py-4 border-b border-[#111111] shrink-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <span className="text-xs font-semibold text-white truncate">{league.name}</span>
            </div>
            <p className="text-[11px] text-[#555555] pl-4">
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
            <h2 className="px-3 mb-2 text-[10px] font-bold text-[#444444] uppercase tracking-[2px]">
              League
            </h2>
            <div className="space-y-0.5">
              {secondaryNav.map((item) => renderNavItem(item, false))}
            </div>
          </div>
        </nav>

        {/* Sidebar Footer */}
        <div className="px-5 py-3 border-t border-[#111111] shrink-0">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-2 py-2 rounded-lg text-[13px] transition-all ${
                isActive
                  ? 'text-white bg-[#111111]'
                  : 'text-[#555555] hover:text-[#888888] hover:bg-[#0d0d0d]'
              }`
            }
          >
            <Settings className="h-4 w-4" />
            <span className="font-medium">Settings</span>
          </NavLink>
          <p className="text-[10px] text-[#333333] mt-2 px-2">
            Values via KeepTradeCut.com
          </p>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <div className="sidebar-layout-main">
        <main className="min-h-screen pt-[104px] lg:pt-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
