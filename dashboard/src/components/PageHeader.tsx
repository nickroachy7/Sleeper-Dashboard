interface Tab {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  sectionLabel?: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  stats?: React.ReactNode;
  tabs?: Tab[];
  activeTab?: string;
  onTabChange?: (id: string) => void;
}

export function PageHeader({
  title,
  subtitle,
  sectionLabel,
  children,
  actions,
  stats,
  tabs,
  activeTab,
  onTabChange,
}: PageHeaderProps) {
  return (
    <div className="mb-3">
      {sectionLabel && (
        <p className="text-[10px] font-bold text-[#555555] tracking-[3px] uppercase mb-1">
          {sectionLabel}
        </p>
      )}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight truncate">
          {title}
        </h1>
        <div className="flex items-center gap-2 flex-shrink-0">
          {tabs && onTabChange && (
            <div className="segmented-control">
              {tabs.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => onTabChange(id)}
                  className={`flex items-center gap-1.5 ${activeTab === id ? 'active' : ''}`}
                >
                  {Icon && <Icon className="h-3.5 w-3.5" />}
                  {label}
                </button>
              ))}
            </div>
          )}
          {actions}
          {children}
        </div>
      </div>
      {(subtitle || stats) && (
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {subtitle && (
            <p className="text-[13px] text-[#555555]">
              {subtitle}
            </p>
          )}
          {stats}
        </div>
      )}
    </div>
  );
}
