interface PageHeaderProps {
  title: string;
  subtitle?: string;
  sectionLabel?: string;
  children?: React.ReactNode;
}

export function PageHeader({ title, subtitle, sectionLabel, children }: PageHeaderProps) {
  return (
    <div className="mb-5 sm:mb-7">
      {sectionLabel && (
        <p className="text-[10px] font-bold text-[#555555] tracking-[3px] uppercase mb-2">
          {sectionLabel}
        </p>
      )}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight truncate">
          {title}
        </h1>
        {children && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {children}
          </div>
        )}
      </div>
      {subtitle && (
        <p className="text-[13px] text-[#666666] mt-1">
          {subtitle}
        </p>
      )}
    </div>
  );
}
