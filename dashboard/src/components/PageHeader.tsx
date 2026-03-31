import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  sectionLabel?: string;
  backTo?: string;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}

export function PageHeader({ title, subtitle, sectionLabel, backTo, icon, children }: PageHeaderProps) {
  const navigate = useNavigate();

  return (
    <div className="mb-5 sm:mb-7 pb-5 sm:pb-7 border-b border-[#151515]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 sm:gap-3 mb-2">
            {backTo && (
              <button
                onClick={() => navigate(backTo)}
                className="flex-shrink-0 p-1.5 -ml-1.5 rounded-lg text-[#555555] hover:text-[#888888] hover:bg-[#111111] transition-colors"
                aria-label="Go back"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}
            {icon && (
              <div className="flex-shrink-0 hidden sm:flex items-center justify-center w-10 h-10 rounded-md bg-accent-500/20">
                {icon}
              </div>
            )}
          </div>
          {sectionLabel && (
            <p className="text-[10px] font-bold text-[#555555] tracking-[3px] uppercase mb-2">
              {sectionLabel}
            </p>
          )}
          <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight truncate">
            {title}
          </h1>
          {subtitle && (
            <p className="text-[13px] text-[#666666] mt-1.5">
              {subtitle}
            </p>
          )}
        </div>
        {children && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
