// Cross-component channel for opening the global command palette (LookupSearch).
// The top bar / mobile header dispatch this; LookupSearch listens. The palette
// is now the single "search or ask" surface: search/navigate by default, and
// an optional seed opens it straight into the assistant conversation.
export const OPEN_LOOKUP_EVENT = 'open-lookup';

export interface OpenLookupDetail {
  /** When set, the palette opens in chat mode and asks this question. */
  seed?: string;
}

/** Open the palette in search mode (find / navigate / ask). */
export function openLookup(detail?: OpenLookupDetail) {
  window.dispatchEvent(new CustomEvent(OPEN_LOOKUP_EVENT, { detail }));
}

/** Open the palette straight into the assistant with a seeded question. */
export function openAsk(seed: string) {
  openLookup({ seed });
}
