import { Shield } from 'lucide-react';
import { useShowIdp, idpStore } from '../lib/idp-store';

/**
 * Compact switch for the "show IDP players" preference, sized to sit inline in
 * a FilterBar next to the position pills. Reads/writes the shared idp-store, so
 * every board and vote pool reacts at once and Settings stays in sync.
 */
export function IdpToggle() {
  const showIdp = useShowIdp();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={showIdp}
      onClick={() => idpStore.toggle()}
      title={showIdp ? 'Hide individual defensive players' : 'Show individual defensive players (IDP)'}
      className={`shrink-0 flex items-center gap-1.5 h-9 px-2.5 rounded-lg text-[13px] font-medium border transition-all ${
        showIdp
          ? 'bg-accent-500/15 border-accent-500/50 text-accent-300'
          : 'bg-[#141419] border-[#22222b] text-[#9c9ca7] hover:text-white hover:border-[#363641]'
      }`}
    >
      <Shield className="h-3.5 w-3.5" />
      IDP
      <span
        className={`inline-flex h-4 w-7 items-center rounded-full transition-colors ${
          showIdp ? 'bg-accent-500' : 'bg-[#33333d]'
        }`}
      >
        <span
          className={`h-3 w-3 rounded-full bg-white transition-transform ${
            showIdp ? 'translate-x-3.5' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  );
}
