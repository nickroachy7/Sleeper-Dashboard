import { NavLink, Outlet, useLocation, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  ArrowLeftRight,
  Menu,
  X,
  ChevronRight,
  FileText,
  Scale,
  Settings,
} from 'lucide-react';
import { useState } from 'react';

interface NavItem {
  to: string;
  icon?: typeof LayoutDashboard;
  iconImage?: string;
  label: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    title: 'Home',
    items: [
      { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    ],
  },
  {
    title: 'Tools',
    items: [
      { to: '/trade', icon: Scale, label: 'Trade Evaluator' },
      { to: '/ktc-values', iconImage: '/ktc-logo.png', label: 'KTC Values' },
    ],
  },
  {
    title: 'League',
    items: [
      { to: '/transactions', icon: ArrowLeftRight, label: 'Transactions' },
      { to: '/drafts', icon: FileText, label: 'Draft Capital' },
      { to: '/settings', icon: Settings, label: 'Settings' },
    ],
  },
];

const bottomNavItems = [
  { to: '/', label: 'Home' },
  { to: '/trade', label: 'Trade' },
  { to: '/transactions', label: 'Activity' },
  { to: '/ktc-values', label: 'Values' },
];

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  const isNavItemActive = (to: string) => {
    if (to === '/') return location.pathname === '/';
    return location.pathname === to || location.pathname.startsWith(to + '/');
  };

  return (
    <div className="min-h-screen bg-black">
      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-black/80 backdrop-blur-xl border-b border-[#151515]">
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
            className="p-1.5 rounded-lg hover:bg-[#111111] transition-colors"
            aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
          >
            {sidebarOpen ? (
              <X className="h-5 w-5 text-[#888888]" />
            ) : (
              <Menu className="h-5 w-5 text-[#888888]" />
            )}
          </button>
        </div>

        {/* Bottom navigation tabs */}
        <nav className="flex items-center justify-around px-4 border-t border-[#151515]">
          {bottomNavItems.map(({ to, label }) => {
            const isActive = isNavItemActive(to);
            return (
              <Link
                key={to}
                to={to}
                className={`flex-1 py-3 text-center text-xs font-semibold uppercase tracking-wide transition-colors relative ${
                  isActive
                    ? 'text-white'
                    : 'text-[#555555] hover:text-[#888888]'
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
          className="lg:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-64 bg-[#0a0a0a] border-r border-[#151515] transition-transform duration-300 lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo */}
        <div className="h-16 flex items-center px-5 border-b border-[#151515]">
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
              <h2 className="px-3 mb-3 text-[10px] font-bold text-[#555555] uppercase tracking-[3px]">
                {section.title}
              </h2>
              <div className="space-y-1">
                {section.items.map(({ to, icon: Icon, iconImage, label }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={to === '/'}
                    onClick={() => setSidebarOpen(false)}
                    className={({ isActive }) =>
                      `group flex items-center gap-3 px-3 py-3 rounded-lg text-sm transition-all duration-200 ${
                        isActive
                          ? 'bg-accent-500/10 text-accent-400'
                          : 'text-[#888888] hover:bg-[#111111] hover:text-white'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <div
                          className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                            isActive
                              ? 'bg-accent-500/20'
                              : 'bg-[#111111] group-hover:bg-[#1a1a1a]'
                          }`}
                        >
                          {iconImage ? (
                            <img src={iconImage} alt="" className="h-4 w-4 object-contain" />
                          ) : Icon ? (
                            <Icon
                              className={`h-4 w-4 ${
                                isActive ? 'text-accent-400' : 'text-[#555555]'
                              }`}
                            />
                          ) : null}
                        </div>
                        <span className="font-medium">{label}</span>
                        {isActive && (
                          <ChevronRight className="h-4 w-4 ml-auto text-accent-500" />
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

      {/* Main Content */}
      <div className="sidebar-layout-main">
        <main className="min-h-screen pt-[6.5rem] lg:pt-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
