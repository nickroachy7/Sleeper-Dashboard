import { NavLink, Outlet, useLocation, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Trophy,
  Users,
  ArrowLeftRight,
  Menu,
  X,
  ChevronRight,
  FileText,
  Database,
  RefreshCw,
  Scale,
  Target,
  Wrench,
  Gamepad2,
} from 'lucide-react';
import { useState } from 'react';

// Define which routes belong to which nav section
const leagueRoutes = ['/league', '/standings', '/rosters', '/transactions', '/drafts', '/sync-status', '/setup'];
const toolsRoutes = ['/tools', '/trade-evaluator', '/trade-finder', '/ktc-values'];

interface BottomNavItem {
  to: string;
  icon: typeof LayoutDashboard;
  label: string;
}

const bottomNavItems: BottomNavItem[] = [
  { to: '/', icon: LayoutDashboard, label: 'Home' },
  { to: '/league', icon: Trophy, label: 'League' },
  { to: '/tools', icon: Wrench, label: 'Tools' },
  { to: '/minigames', icon: Gamepad2, label: 'Minigames' },
];

interface NavItem {
  to: string;
  icon?: typeof LayoutDashboard;
  iconImage?: string;
  label: string;
  description: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    title: 'Home',
    items: [
      { to: '/', icon: LayoutDashboard, label: 'Dashboard', description: 'Overview & stats' },
    ],
  },
  {
    title: 'Tools',
    items: [
      { to: '/trade-evaluator', icon: Scale, label: 'Trade Evaluator', description: 'Build & evaluate trades' },
      { to: '/trade-finder', icon: Target, label: 'Trade Finder', description: 'Find trade scenarios' },
      { to: '/ktc-values', iconImage: '/ktc-logo.png', label: 'KTC Values', description: 'Dynasty rankings' },
    ],
  },
  {
    title: 'League',
    items: [
      { to: '/standings', icon: Trophy, label: 'Standings', description: 'League rankings' },
      { to: '/rosters', icon: Users, label: 'Rosters', description: 'Team players' },
      { to: '/transactions', icon: ArrowLeftRight, label: 'Transactions', description: 'Trades & moves' },
      { to: '/drafts', icon: FileText, label: 'Drafts', description: 'Draft history & capital' },
      { to: '/sync-status', icon: RefreshCw, label: 'Sync Status', description: 'Auto-sync monitoring' },
      { to: '/setup', icon: Database, label: 'Settings', description: 'Database & settings' },
    ],
  },
];

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  // Helper to check if a nav item should be active
  const isNavItemActive = (to: string) => {
    if (to === '/') return location.pathname === '/';
    if (to === '/league') return leagueRoutes.includes(location.pathname);
    if (to === '/tools') return toolsRoutes.includes(location.pathname);
    if (to === '/minigames') return location.pathname === '/minigames';
    return location.pathname === to;
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950">
      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border-b border-slate-200/50 dark:border-zinc-800/50">
        {/* Top bar with logo and menu */}
        <div className="flex items-center justify-between h-14 px-3">
          <div className="flex items-center">
            <img 
              src="/yapsports-logo.webp" 
              alt="Sleeper Dashboard" 
              className="h-8 w-auto"
            />
          </div>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
            aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
          >
            {sidebarOpen ? (
              <X className="h-5 w-5 text-slate-600 dark:text-slate-400" />
            ) : (
              <Menu className="h-5 w-5 text-slate-600 dark:text-slate-400" />
            )}
          </button>
        </div>
        
        {/* Bottom navigation tabs */}
        <nav className="flex items-center justify-around px-4 border-t border-slate-200/50 dark:border-zinc-800/50">
          {bottomNavItems.map(({ to, label }) => {
            const isActive = isNavItemActive(to);
            return (
              <Link
                key={to}
                to={to}
                className={`flex-1 py-3 text-center text-xs font-semibold uppercase tracking-wide transition-colors relative ${
                  isActive
                    ? 'text-white'
                    : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
                }`}
              >
                {label}
                {isActive && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-0.5 bg-accent-500 rounded-full" />
                )}
              </Link>
            );
          })}
        </nav>
      </header>

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-slate-900/20 dark:bg-black/50 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-64 bg-white dark:bg-zinc-900 border-r border-slate-200/50 dark:border-zinc-800 shadow-xl shadow-slate-200/50 dark:shadow-none transition-transform duration-300 lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo */}
        <div className="h-16 flex items-center px-5 border-b border-slate-100 dark:border-zinc-800">
          <img 
            src="/yapsports-logo.webp" 
            alt="Sleeper Dashboard" 
            className="h-10 w-auto"
          />
        </div>

        {/* Navigation */}
        <nav className="p-4 overflow-y-auto" style={{ height: 'calc(100% - 4rem)' }}>
          {navSections.map((section, sectionIndex) => (
            <div key={section.title} className={sectionIndex > 0 ? 'mt-8' : ''}>
              <h2 className="px-3 mb-3 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                {section.title}
              </h2>
              <div className="space-y-2">
                {section.items.map(({ to, icon: Icon, iconImage, label }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={to === '/'}
                    onClick={() => setSidebarOpen(false)}
                    className={({ isActive }) =>
                      `group flex items-center gap-3 px-3 py-3 rounded-lg text-sm transition-all duration-200 ${
                        isActive
                          ? 'bg-accent-50 dark:bg-accent-500/10 text-accent-700 dark:text-accent-400'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-zinc-800 hover:text-slate-900 dark:hover:text-white'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <div
                          className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                            isActive
                              ? 'bg-accent-100 dark:bg-accent-500/20'
                              : 'bg-slate-100 dark:bg-zinc-800 group-hover:bg-slate-200 dark:group-hover:bg-zinc-700'
                          }`}
                        >
                          {iconImage ? (
                            <img src={iconImage} alt="" className="h-4 w-4 object-contain" />
                          ) : Icon ? (
                            <Icon
                              className={`h-4 w-4 ${
                                isActive ? 'text-accent-600 dark:text-accent-400' : 'text-slate-500 dark:text-slate-400'
                              }`}
                            />
                          ) : null}
                        </div>
                        <span className="font-medium">{label}</span>
                        {isActive && (
                          <ChevronRight className="h-4 w-4 ml-auto text-accent-400 dark:text-accent-500" />
                        )}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      {/* Main Content - uses custom CSS class for sidebar offset */}
      <div className="sidebar-layout-main">
        <main className="min-h-screen pt-[6.5rem] lg:pt-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
