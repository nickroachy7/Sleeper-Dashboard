import { NavLink } from 'react-router-dom';
import {
  Trophy,
  Users,
  ArrowLeftRight,
  FileText,
  RefreshCw,
  Database,
  ChevronRight,
} from 'lucide-react';

interface NavItem {
  to: string;
  icon: typeof Trophy;
  label: string;
  description: string;
}

const leagueItems: NavItem[] = [
  { to: '/standings', icon: Trophy, label: 'Standings', description: 'League rankings and records' },
  { to: '/rosters', icon: Users, label: 'Rosters', description: 'View all team rosters' },
  { to: '/transactions', icon: ArrowLeftRight, label: 'Transactions', description: 'Trades, adds & drops' },
  { to: '/drafts', icon: FileText, label: 'Drafts', description: 'Draft history & capital' },
  { to: '/sync-status', icon: RefreshCw, label: 'Sync Status', description: 'Auto-sync monitoring' },
  { to: '/setup', icon: Database, label: 'Settings', description: 'Database & league settings' },
];

export function LeagueHub() {
  return (
    <div className="p-4 lg:p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
          League
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mb-6">
          View your league information and settings
        </p>

        <div className="space-y-3">
          {leagueItems.map(({ to, icon: Icon, label, description }) => (
            <NavLink
              key={to}
              to={to}
              className="group flex items-center gap-4 p-4 bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 hover:border-accent-300 dark:hover:border-accent-600 transition-all duration-200 shadow-sm hover:shadow-md"
            >
              <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-slate-100 dark:bg-zinc-800 flex items-center justify-center group-hover:bg-accent-100 dark:group-hover:bg-accent-500/20 transition-colors">
                <Icon className="h-6 w-6 text-slate-500 dark:text-slate-400 group-hover:text-accent-600 dark:group-hover:text-accent-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-slate-900 dark:text-white group-hover:text-accent-700 dark:group-hover:text-accent-400">
                  {label}
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {description}
                </p>
              </div>
              <ChevronRight className="h-5 w-5 text-slate-300 dark:text-slate-600 group-hover:text-accent-500 dark:group-hover:text-accent-400 transition-colors" />
            </NavLink>
          ))}
        </div>
      </div>
    </div>
  );
}
