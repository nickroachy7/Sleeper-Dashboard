interface Tab {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** @deprecated no longer rendered — the title itself is now the compact label. */
  sectionLabel?: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  stats?: React.ReactNode;
  tabs?: Tab[];
  activeTab?: string;
  onTabChange?: (id: string) => void;
}

/**
 * Minimal page header: the title renders as a single compact accent label
 * (e.g. "TRANSACTIONS") — no oversized heading. Any tabs/segmented control sit
 * on the same row to the right, keeping the top of every page tight.
 */
export function PageHeader({
  title,
  subtitle,
  children,
  actions,
  stats,
  tabs,
  activeTab,
  onTabChange,
}: PageHeaderProps) {
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between gap-3 min-h-[34px]">
        <h1 className="text-[13px] font-bold text-accent-500 tracking-[0.18em] uppercase truncate">
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

      {subtitle && (
        <p className="text-[12px] text-[#75757f] mt-1.5 leading-snug">{subtitle}</p>
      )}

      {stats && <div className="mt-2.5">{stats}</div>}
    </div>
  );
}
