import type { ComponentType } from 'react';
import { Link } from 'react-router-dom';

export interface SectionTab {
  label: string;
  to: string;
  active: boolean;
  icon: ComponentType<{ className?: string }>;
}

/**
 * Section-level sub-navigation rendered as links (not in-page tabs), so a
 * "section" like League or Players can span several routes while still reading
 * as one destination with tabs — the GitHub repo-tabs pattern. Scrolls
 * horizontally on narrow screens instead of squishing labels.
 */
export function SectionTabs({ tabs }: { tabs: SectionTab[] }) {
  return (
    <div className="flex gap-1 bg-[#141419] border border-[#22222b] rounded-xl p-1 overflow-x-auto no-scrollbar mb-4">
      {tabs.map(({ label, to, active, icon: Icon }) => (
        <Link
          key={to}
          to={to}
          aria-current={active ? 'page' : undefined}
          className={`relative shrink-0 flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-lg text-[12px] sm:text-[13px] font-medium transition-all ${
            active
              ? 'bg-[#20202a] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]'
              : 'text-[#75757f] hover:text-[#c8c8d0] hover:bg-[#1a1a20]'
          }`}
        >
          <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-accent-400' : ''}`} />
          <span className="truncate">{label}</span>
        </Link>
      ))}
    </div>
  );
}
