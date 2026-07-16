// Cross-component channel for opening the global command palette (LookupSearch).
// The top bar / mobile header dispatch this; LookupSearch listens. Chat is now
// its own /chat route — the palette navigates there when a question is asked.
export const OPEN_LOOKUP_EVENT = 'open-lookup';

/** Open the palette in search mode (find / navigate / ask). */
export function openLookup() {
  window.dispatchEvent(new CustomEvent(OPEN_LOOKUP_EVENT));
}
