import { Shield } from 'lucide-react';
import { useShowIdp, idpStore } from '../lib/idp-store';
import { Toggle } from './ui/Toggle';

/**
 * "Show IDP players" preference toggle, sized to sit inline in a FilterBar next
 * to the position pills. Thin binding of the shared Toggle primitive to the
 * idp-store, so every board and vote pool reacts at once and Settings stays in
 * sync.
 */
export function IdpToggle() {
  const showIdp = useShowIdp();
  return (
    <Toggle
      checked={showIdp}
      onChange={(v) => idpStore.set(v)}
      label="IDP"
      icon={Shield}
      title={showIdp ? 'Hide individual defensive players' : 'Show individual defensive players (IDP)'}
    />
  );
}
