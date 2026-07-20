import type { ComponentType } from 'react';
import { Switch } from './Switch';

// ── Toggle ────────────────────────────────────────────────────────────────
// Inline label + Switch in a pill — the filter-bar toggle shape (e.g. "IDP").
// Uses the soft-tint active treatment shared with the pill/segmented control,
// and the canonical control height so it lines up with search + pills.

interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  title?: string;
}

export function Toggle({ checked, onChange, label, icon: Icon, title }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      title={title}
      className={`shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-[13px] font-medium border transition-colors ${
        checked
          ? 'bg-accent-500/15 border-accent-500/40 text-accent-300'
          : 'bg-surface border-line text-muted hover:text-white hover:border-line-strong'
      }`}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {label}
      <Switch checked={checked} size="sm" />
    </button>
  );
}
