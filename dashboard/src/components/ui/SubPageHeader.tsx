import type { ComponentType } from 'react';
import { ChevronLeft } from 'lucide-react';

// ── SubPageHeader ────────────────────────────────────────────────────────────
// The "< Minis   ⚔ Rank 'Em" breadcrumb header for a sub-view reached from a
// landing grid (Minis → a mini). Back link on the left, current view's label +
// icon on the right, optional one-line subtitle beneath. Extracted from
// TradeTools so any future landing/detail flow reads the same.

interface SubPageHeaderProps {
  /** Back-link text (e.g. "Minis"). */
  backLabel: string;
  onBack: () => void;
  /** Current view label (e.g. "Rank 'Em"). */
  title: string;
  icon?: ComponentType<{ className?: string }>;
  subtitle?: string;
}

export function SubPageHeader({ backLabel, onBack, title, icon: Icon, subtitle }: SubPageHeaderProps) {
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 h-11 sm:h-auto -ml-1 text-[13px] font-medium text-muted hover:text-white transition-colors"
        >
          <ChevronLeft className="h-4 w-4" /> {backLabel}
        </button>
        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-white">
          {Icon && <Icon className="h-4 w-4 text-accent-400" />} {title}
        </span>
      </div>
      {subtitle && <p className="text-[12px] text-faint mt-1 leading-snug">{subtitle}</p>}
    </div>
  );
}
