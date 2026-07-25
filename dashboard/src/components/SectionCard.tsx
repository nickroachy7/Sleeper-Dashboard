import type { ReactNode } from 'react';

interface SectionCardProps {
  label: string;
  /** Optional one-line description under the header. */
  sub?: ReactNode;
  /** Optional right-aligned header slot (season pills, toggles, counts). */
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /**
   * Edge-to-edge body (for list/table cards): the card gets no inner padding and
   * only the header is padded, so rows can span the full width. Body children own
   * their own horizontal padding.
   */
  flush?: boolean;
}

/**
 * The canonical dashboard section card. One consistent header treatment — an
 * accent tick + uppercase eyebrow label + muted sub, optional right slot —
 * wrapping any content on a raised, softly-shadowed panel (see `.yap-card`), so
 * every section across the app reads as one elevated system.
 */
export function SectionCard({ label, sub, right, children, className, bodyClassName, flush }: SectionCardProps) {
  return (
    <section className={`yap-card ${flush ? 'overflow-hidden' : 'p-4 sm:p-5'} ${className ?? ''}`}>
      <div className={flush ? 'px-4 sm:px-5 pt-4' : ''}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex items-start gap-2.5">
            {/* Accent tick — a small vertical bar anchoring the eyebrow, for a
                deliberate editorial start to every section header. */}
            <span className="mt-0.5 h-3.5 w-1 rounded-full bg-accent-500 shrink-0" aria-hidden />
            <div className="min-w-0">
              <p className="yap-eyebrow">{label}</p>
              {sub != null && <p className="text-[11px] text-faint mt-1 leading-snug">{sub}</p>}
            </div>
          </div>
          {right}
        </div>
      </div>
      <div className={`mt-3 ${bodyClassName ?? ''}`}>{children}</div>
    </section>
  );
}
