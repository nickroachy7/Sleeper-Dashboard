import { SubjectAvatar } from './SubjectAvatar';
import type { Subject } from '../../lib/debates/types';

// ── SubjectVersus ────────────────────────────────────────────────────────────
// The core contribution surface: two subjects, tap the one you'd take. Mirrors
// the dynasty PlayerVersus 'vote' variant but for arbitrary subjects — two
// tappable columns with a center "VS", each showing the subject's blurb + case.
// The caller owns what a pick does (records a debate vote); this is pure UI.

export function SubjectVersus({
  a,
  b,
  disabled = false,
  pickedId = null,
  onPick,
}: {
  a: Subject;
  b: Subject;
  disabled?: boolean;
  /** Flash the picked side briefly before the caller advances. */
  pickedId?: string | null;
  onPick: (winnerId: string, loserId: string) => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-2 sm:gap-3">
      <SubjectColumn subject={a} side="left" disabled={disabled} picked={pickedId === a.id} dimmed={pickedId != null && pickedId !== a.id} onPick={() => onPick(a.id, b.id)} />
      <div className="flex items-center justify-center">
        <span className="font-display font-bold text-[13px] text-faint tracking-wide select-none">VS</span>
      </div>
      <SubjectColumn subject={b} side="right" disabled={disabled} picked={pickedId === b.id} dimmed={pickedId != null && pickedId !== b.id} onPick={() => onPick(b.id, a.id)} />
    </div>
  );
}

function SubjectColumn({
  subject,
  disabled,
  picked,
  dimmed,
  onPick,
}: {
  subject: Subject;
  side: 'left' | 'right';
  disabled: boolean;
  picked: boolean;
  dimmed: boolean;
  onPick: () => void;
}) {
  return (
    <button
      onClick={onPick}
      disabled={disabled}
      className={`group yap-card yap-card-interactive flex flex-col items-center text-center gap-3 px-3 py-5 sm:px-4 sm:py-6 rounded-2xl transition-all
        ${picked ? 'border-accent-500 ring-2 ring-accent-500/40' : ''}
        ${dimmed ? 'opacity-45' : ''}
        ${disabled ? 'cursor-default' : 'hover:border-accent-500/50'}`}
    >
      <SubjectAvatar subject={subject} size={84} className="sm:!w-[104px] sm:!h-[104px] transition-transform group-hover:scale-[1.03]" />
      <div className="min-w-0">
        <p className="font-display font-bold text-[16px] sm:text-[18px] text-white leading-tight">{subject.name}</p>
        {subject.subtitle && <p className="text-[11.5px] text-muted mt-0.5">{subject.subtitle}</p>}
      </div>
      {subject.blurb && (
        <p className="text-[12px] leading-snug text-faint line-clamp-3">{subject.blurb}</p>
      )}
      <span
        className={`mt-auto inline-flex items-center justify-center h-8 px-4 rounded-lg text-[12.5px] font-semibold transition-colors
          ${picked ? 'bg-accent-500 text-[#06110a]' : 'bg-elevated text-ink-soft group-hover:bg-accent-500 group-hover:text-[#06110a]'}`}
      >
        {picked ? 'Locked in' : 'Take them'}
      </span>
    </button>
  );
}
