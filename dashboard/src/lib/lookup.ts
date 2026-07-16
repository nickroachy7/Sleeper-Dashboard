// Cross-component channel for opening the global command palette (LookupSearch).
// The top bar / mobile header dispatch these; LookupSearch listens.
export const OPEN_LOOKUP_EVENT = 'open-lookup';
export const OPEN_CHAT_EVENT = 'open-chat';

/** Open the palette in search mode (find / navigate / ask). */
export function openLookup() {
  window.dispatchEvent(new CustomEvent(OPEN_LOOKUP_EVENT));
}

/** Open the palette in chat-sessions mode (new chat / resume). */
export function openChat() {
  window.dispatchEvent(new CustomEvent(OPEN_CHAT_EVENT));
}
