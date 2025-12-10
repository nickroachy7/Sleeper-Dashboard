import { NavLink } from 'react-router-dom';
import {
  Scale,
  Target,
  ChevronRight,
} from 'lucide-react';

interface NavItem {
  to: string;
  icon?: typeof Scale;
  iconImage?: string;
  label: string;
  description: string;
}

const toolsItems: NavItem[] = [
  { to: '/trade-evaluator', icon: Scale, label: 'Trade Evaluator', description: 'Build and evaluate trades with real values' },
  { to: '/trade-finder', icon: Target, label: 'Trade Finder', description: 'Find optimal trade scenarios' },
  { to: '/ktc-values', iconImage: '/ktc-logo.png', label: 'KTC Values', description: 'KeepTradeCut dynasty rankings' },
];

export function ToolsHub() {
  return (
    <div className="p-4 lg:p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
          Tools
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mb-6">
          Dynasty trade tools and player values
        </p>

        <div className="space-y-3">
          {toolsItems.map(({ to, icon: Icon, iconImage, label, description }) => (
            <NavLink
              key={to}
              to={to}
              className="group flex items-center gap-4 p-4 bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 hover:border-accent-300 dark:hover:border-accent-600 transition-all duration-200 shadow-sm hover:shadow-md"
            >
              <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-slate-100 dark:bg-zinc-800 flex items-center justify-center group-hover:bg-accent-100 dark:group-hover:bg-accent-500/20 transition-colors">
                {iconImage ? (
                  <img src={iconImage} alt="" className="h-6 w-6 object-contain" />
                ) : Icon ? (
                  <Icon className="h-6 w-6 text-slate-500 dark:text-slate-400 group-hover:text-accent-600 dark:group-hover:text-accent-400" />
                ) : null}
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
