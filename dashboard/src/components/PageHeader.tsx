interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** @deprecated no longer rendered — the title itself is now the compact label. */
  sectionLabel?: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  stats?: React.ReactNode;
}

/**
 * Minimal page header: the title renders as a single compact accent label
 * (e.g. "TRANSACTIONS") — no oversized heading. Page-level tabs are a separate
 * concern: use the shared <TabBar/> below the header for a consistent look.
 */
export function PageHeader({
  title,
  subtitle,
  children,
  actions,
  stats,
}: PageHeaderProps) {
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between gap-3 min-h-[34px]">
        <h1 className="text-[13px] font-bold text-accent-500 tracking-[0.18em] uppercase truncate">
          {title}
        </h1>
        {(actions || children) && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {actions}
            {children}
          </div>
        )}
      </div>

      {subtitle && (
        <p className="text-[12px] text-[#75757f] mt-1.5 leading-snug">{subtitle}</p>
      )}

      {stats && <div className="mt-2.5">{stats}</div>}
    </div>
  );
}
