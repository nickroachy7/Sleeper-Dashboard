import type { ComponentType } from 'react';

export interface TabDef<T extends string> {
  id: T;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

interface TabBarProps<T extends string> {
  tabs: TabDef<T>[];
  active: T;
  onChange: (id: T) => void;
}

/**
 * Shared page-level tab bar (player + team pages). A quiet segmented control:
 * the active tab is a raised surface with an accent icon, rather than a loud
 * filled pill, so the tabs read as navigation and the content stays the focus.
 */
export function TabBar<T extends string>({ tabs, active, onChange }: TabBarProps<T>) {
  return (
    <div className="flex gap-1 bg-[#141419] border border-[#22222b] rounded-xl p-1">
      {tabs.map(({ id, label, icon: Icon }) => {
        const isActive = id === active;
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            aria-current={isActive ? 'page' : undefined}
            className={`relative flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg text-[12px] sm:text-[13px] font-medium transition-all ${
              isActive
                ? 'bg-[#20202a] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]'
                : 'text-[#75757f] hover:text-[#c8c8d0] hover:bg-[#1a1a20]'
            }`}
          >
            <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-accent-400' : ''}`} />
            <span className="truncate">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
