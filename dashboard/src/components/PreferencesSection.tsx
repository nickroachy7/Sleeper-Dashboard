import { Shield, SlidersHorizontal } from 'lucide-react';
import { useShowIdp, idpStore } from '../lib/idp-store';
import { Switch } from './ui/Switch';

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
        <SlidersHorizontal className="h-4 w-4 text-faint" />
        <p className="text-[10px] font-bold text-faint tracking-[3px] uppercase">Preferences</p>
      </div>

      <div className="rounded-xl bg-surface border border-line divide-y divide-line-subtle">
        <button
          type="button"
          role="switch"
          aria-checked={showIdp}
          onClick={() => idpStore.toggle()}
          className="w-full flex items-center gap-3 px-4 py-3.5 text-left cursor-pointer"
        >
          <div className="w-9 h-9 rounded-lg bg-elevated flex items-center justify-center shrink-0">
            <Shield className="h-4 w-4 text-muted" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white">Show IDP players</p>
            <p className="text-[12px] text-faint mt-0.5">
              Include individual defensive players (DL, LB, DB) in rankings and voting. Off by default.
            </p>
          </div>
          <Switch checked={showIdp} size="md" />
        </button>
      </div>
    </section>
  );
}
