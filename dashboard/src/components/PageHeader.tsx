interface PageHeaderProps {
  title: string;
  subtitle?: string;
  sectionLabel?: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  stats?: React.ReactNode;
}

export function PageHeader({ title, subtitle, sectionLabel, children, actions, stats }: PageHeaderProps) {
  return (
    <div className="mb-6 sm:mb-8">
      {sectionLabel && (
        <p className="text-[10px] font-bold text-[#555555] tracking-[3px] uppercase mb-2">
          {sectionLabel}
        </p>
      )}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight truncate">
          {title}
        </h1>
        <div className="flex items-center gap-2 flex-shrink-0">
          {actions}
          {children}
        </div>
      </div>
      {subtitle && (
        <p className="text-[13px] text-[#555555] mt-1.5">
          {subtitle}
        </p>
      )}
      {stats && (
        <div className="flex items-center gap-3 mt-3 flex-wrap">
          {stats}
        </div>
      )}
    </div>
  );
}
