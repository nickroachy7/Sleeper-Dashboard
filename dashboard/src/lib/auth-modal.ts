// Cross-component channel for opening the sign-in/sign-up modal. The league
// switcher and Settings dispatch this; <AuthModal> (mounted in Layout) listens.
export const OPEN_AUTH_EVENT = 'open-auth';

export function openAuth() {
  window.dispatchEvent(new CustomEvent(OPEN_AUTH_EVENT));
}
