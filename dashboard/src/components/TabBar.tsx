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
    // The bar never exceeds its container: it stays a full-width flex row while
    // the tabs fit, and only when they can't (a many-tab bar on a narrow screen)
    // does it scroll horizontally — instead of overflowing the page and shifting
    // the whole fixed layout sideways. `min-w-0` on the wrapper is what lets it
    // shrink to its container rather than its content. (No edge-fade mask: it
    // would clip the card's rounded right corner even when nothing scrolls.)
    <div className="min-w-0 overflow-x-auto no-scrollbar bg-surface border border-line rounded-xl p-1">
      <div className="flex gap-1 min-w-full w-max">
        {tabs.map(({ id, label, icon: Icon }) => {
          const isActive = id === active;
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              aria-current={isActive ? 'page' : undefined}
              className={`relative flex-1 shrink-0 flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg text-[12px] sm:text-[13px] font-medium whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-overlay text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]'
                  : 'text-faint hover:text-ink-soft hover:bg-elevated'
              }`}
            >
              <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-accent-400' : ''}`} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
