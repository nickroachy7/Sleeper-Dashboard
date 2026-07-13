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
 * The canonical dashboard section card. One consistent header treatment (accent
 * label + muted sub, optional right slot) wrapping any content, so every section
 * on the player and team pages reads as one system.
 */
export function SectionCard({ label, sub, right, children, className, bodyClassName, flush }: SectionCardProps) {
  return (
    <section className={`bg-[#141419] rounded-2xl border border-[#22222b] ${flush ? 'overflow-hidden' : 'p-4 sm:p-5'} ${className ?? ''}`}>
      <div className={flush ? 'px-4 sm:px-5 pt-4' : ''}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-accent-500 tracking-[0.18em] uppercase">{label}</p>
            {sub != null && <p className="text-[10px] text-[#75757f] mt-0.5">{sub}</p>}
          </div>
          {right}
        </div>
      </div>
      <div className={`${flush ? 'mt-3' : 'mt-3'} ${bodyClassName ?? ''}`}>{children}</div>
    </section>
  );
}
