import { useSyncExternalStore } from 'react';

// Shared open-state for the global command palette (LookupSearch). The mobile
// header's search button and the overlay both read this store, so the button
// can reflect open/closed (Search ↔ X) and toggle it — the header stays
// visible while search is open. An optional `seed` opens straight into the
// assistant conversation; `nonce` bumps on every open request so the overlay
// can react even when it's already open (e.g. a new seeded question).

export interface LookupState {
  open: boolean;
  seed?: string;
  nonce: number;
}

export interface OpenLookupDetail {
  /** When set, the palette opens in chat mode and asks this question. */
  seed?: string;
}

let state: LookupState = { open: false, nonce: 0 };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Open the palette (search mode, or chat mode when a seed is given). */
export function openLookup(detail?: OpenLookupDetail) {
  state = { open: true, seed: detail?.seed, nonce: state.nonce + 1 };
  emit();
}

/** Close the palette. */
export function closeLookup() {
  if (!state.open) return;
  state = { open: false, seed: undefined, nonce: state.nonce };
  emit();
}

/** Toggle open/closed — the header search button's action. */
export function toggleLookup() {
  if (state.open) closeLookup();
  else openLookup();
}

/** Open the palette straight into the assistant with a seeded question. */
export function openAsk(seed: string) {
  openLookup({ seed });
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
function getSnapshot() {
  return state;
}

export function useLookupState(): LookupState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
