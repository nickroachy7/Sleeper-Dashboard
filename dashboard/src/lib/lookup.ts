// Cross-component channel for opening the global search palette (LookupSearch).
// The top bar and the mobile header dispatch this event; LookupSearch listens.
export const OPEN_LOOKUP_EVENT = 'open-lookup';

export function openLookup() {
  window.dispatchEvent(new CustomEvent(OPEN_LOOKUP_EVENT));
}
