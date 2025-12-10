import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  backTo?: string;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}

export function PageHeader({ title, backTo, icon, children }: PageHeaderProps) {
  const navigate = useNavigate();

  return (
    <div className="flex items-center justify-between gap-3 mb-4 sm:mb-6">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        {backTo && (
          <button
            onClick={() => navigate(backTo)}
            className="flex-shrink-0 p-1.5 -ml-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
            aria-label="Go back"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        {icon && (
          <div className="flex-shrink-0 hidden sm:flex items-center justify-center w-10 h-10 rounded-xl bg-accent-100 dark:bg-accent-500/20">
            {icon}
          </div>
        )}
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white truncate">
          {title}
        </h1>
      </div>
      {children && (
        <div className="flex items-center gap-2 flex-shrink-0">
          {children}
        </div>
      )}
    </div>
  );
}
