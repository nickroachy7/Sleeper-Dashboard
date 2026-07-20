// ── Switch ────────────────────────────────────────────────────────────────
// The one on/off track+knob for the whole app. Replaces the two hand-rolled
// switches (IdpToggle's inline pill, PreferencesSection's settings row) that
// had drifted to different sizes. Two sizes: `sm` for inline filter bars, `md`
// for settings rows. Purely presentational — callers own the state.

interface SwitchProps {
  checked: boolean;
  size?: 'sm' | 'md';
}

const SIZES = {
  sm: { track: 'h-5 w-9', knob: 'h-4 w-4', on: 'translate-x-4', off: 'translate-x-0.5' },
  md: { track: 'h-6 w-11', knob: 'h-5 w-5', on: 'translate-x-5', off: 'translate-x-0.5' },
} as const;

/** Presentational track+knob. Render inside a button/label that owns onClick +
 *  role="switch" + aria-checked (see Toggle for the common inline case). */
export function Switch({ checked, size = 'sm' }: SwitchProps) {
  const s = SIZES[size];
  return (
    <span
      aria-hidden
      className={`inline-flex ${s.track} items-center rounded-full transition-colors shrink-0 ${
        checked ? 'bg-accent-500' : 'bg-line-strong'
      }`}
    >
      <span
        className={`${s.knob} rounded-full bg-white shadow transition-transform ${checked ? s.on : s.off}`}
      />
    </span>
  );
}
