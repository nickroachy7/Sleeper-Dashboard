import type { ReactNode } from 'react';

// ── MetaText ────────────────────────────────────────────────────────────────
// The one muted caption line for "Updated Jul 20 at 1:00 PM", "Showing 251–300
// of 750", "142 votes this session", "12 players". Replaces ~8 hand-rolled
// spans that used 3-4 different gray tokens and sizes.

export function MetaText({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`text-[11px] text-ghost ${className}`}>{children}</p>;
}
