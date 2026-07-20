import { Shield, SlidersHorizontal } from 'lucide-react';
import { useShowIdp, idpStore } from '../lib/idp-store';

/**
 * "Preferences" — client-side view settings that apply across the app,
 * independent of any league or account. Currently a single toggle: whether
 * individual defensive players (IDP) appear in rankings and vote pools. Off by
 * default, since most dynasty leagues run offense-only. The toggle here writes
 * the same shared store the inline Ranking toggle does, so the two stay in sync.
 */
export function PreferencesSection() {
  const showIdp = useShowIdp();

  return (
    <section className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <SlidersHorizontal className="h-4 w-4 text-[#75757f]" />
        <p className="text-[10px] font-bold text-[#75757f] tracking-[3px] uppercase">Preferences</p>
      </div>

      <div className="rounded-xl bg-[#141419] border border-[#22222b] divide-y divide-[#1f1f27]">
        <button
          type="button"
          role="switch"
          aria-checked={showIdp}
          onClick={() => idpStore.toggle()}
          className="w-full flex items-center gap-3 px-4 py-3.5 text-left cursor-pointer"
        >
          <div className="w-9 h-9 rounded-lg bg-[#1b1b22] flex items-center justify-center shrink-0">
            <Shield className="h-4 w-4 text-[#9c9ca7]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white">Show IDP players</p>
            <p className="text-[12px] text-[#75757f] mt-0.5">
              Include individual defensive players (DL, LB, DB) in rankings and voting. Off by default.
            </p>
          </div>
          <span
            aria-hidden
            className={`shrink-0 inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              showIdp ? 'bg-accent-500' : 'bg-[#33333d]'
            }`}
          >
            <span
              className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${
                showIdp ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </span>
        </button>
      </div>
    </section>
  );
}
