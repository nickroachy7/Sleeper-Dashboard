import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { clearGuestLeagueState } from './account-league-store';

// ── Auth context ──────────────────────────────────────────────────
// Optional accounts (the hybrid plan): guests use the app fully without one;
// signing in only changes where the league list persists (localStorage vs the
// user_leagues table). Email + password with "Confirm email" disabled in the
// Supabase dashboard — accounts work immediately, no verification step.

interface AuthValue {
  /** Signed-in user, or null for guests. */
  user: User | null;
  /** The user's chosen display handle (from sign-up), or null. */
  username: string | null;
  /** Profile picture URL — their Sleeper avatar, captured during onboarding. */
  avatarUrl: string | null;
  /** True until the initial getSession() resolves — gate store swaps on this. */
  loading: boolean;
  signUp: (email: string, password: string, username: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Merge fields into auth user_metadata (best-effort; resolves on completion). */
  updateProfile: (fields: { avatarUrl?: string | null; sleeperUserId?: string }) => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

/** Rewrite Supabase auth errors into plain language for the sign-in form. */
function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Wrong email or password.';
  if (m.includes('already registered')) return 'That email already has an account — sign in instead.';
  if (m.includes('at least 6 characters')) return 'Password must be at least 6 characters.';
  if (m.includes('rate limit')) return 'Too many attempts — wait a moment and try again.';
  return message;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const user = session?.user ?? null;

  // Self-heal: accounts created before the profiles table shipped have a
  // username in auth metadata but no public profiles row, so /u/<username>
  // 404s. Upsert it once per session. (ON CONFLICT via upsert keeps this a
  // no-op for healthy accounts.)
  const healUserId = user?.id ?? null;
  const healUsername = typeof user?.user_metadata?.username === 'string' ? user.user_metadata.username : null;
  const healAvatar = typeof user?.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url : null;
  useEffect(() => {
    if (!healUserId || !healUsername) return;
    supabase
      .from('profiles')
      .upsert(
        { user_id: healUserId, username: healUsername, avatar_url: healAvatar },
        { onConflict: 'user_id' }
      )
      .then(({ error }) => {
        if (error) console.warn('profile self-heal failed:', error.message);
      });
  }, [healUserId, healUsername, healAvatar]);

  const value: AuthValue = {
    user,
    // Username + avatar live in auth user_metadata — no extra table needed;
    // they're display fields, not identity (login stays email-based).
    username: typeof user?.user_metadata?.username === 'string' ? user.user_metadata.username : null,
    avatarUrl: typeof user?.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url : null,
    loading,

    async signUp(email, password, username) {
      // Usernames are public identity (/u/<username>) — check availability
      // before burning the email on an account.
      const { data: taken } = await supabase
        .from('profiles')
        .select('user_id')
        .ilike('username', username)
        .maybeSingle();
      if (taken) throw new Error('That username is taken — try another.');

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { username } },
      });
      if (error) throw new Error(friendlyAuthError(error.message));
      // Supabase obfuscates existing emails: sign-up "succeeds" with a
      // userless/identity-less response instead of erroring.
      if (data.user && data.user.identities?.length === 0) {
        throw new Error('That email already has an account — sign in instead.');
      }
      // No session ⇒ the project still has "Confirm email" enabled. The app
      // is designed for confirmations OFF (Supabase dashboard → Auth →
      // Sign In / Up); surface it rather than silently staying a guest.
      if (!data.session) {
        throw new Error('Account created, but email confirmation is required by the server. Check your inbox, then sign in.');
      }
      // Public profile row — the shareable /u/<username> identity. Best-effort:
      // a unique-index race just means the page 404s until support fixes it.
      if (data.user) {
        const { error: pErr } = await supabase
          .from('profiles')
          .insert({ user_id: data.user.id, username });
        if (pErr) console.warn('profile create failed:', pErr.message);
      }
    },

    async signIn(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error(friendlyAuthError(error.message));
    },

    async signOut() {
      // Guest state after sign-out should be empty, not the pre-sign-in
      // leftovers — those were merged into the account. Clear before the
      // auth event so the store swap doesn't resurrect them.
      clearGuestLeagueState();
      await supabase.auth.signOut();
    },

    async updateProfile(fields) {
      const data: Record<string, unknown> = {};
      if ('avatarUrl' in fields) data.avatar_url = fields.avatarUrl;
      if (fields.sleeperUserId) data.sleeper_user_id = fields.sleeperUserId;
      if (Object.keys(data).length === 0) return;
      const { error } = await supabase.auth.updateUser({ data });
      if (error) console.warn('profile update failed:', error.message);
      // Mirror the avatar onto the public profile (/u/<username>).
      if ('avatarUrl' in fields && user) {
        await supabase.from('profiles').update({ avatar_url: fields.avatarUrl }).eq('user_id', user.id);
      }
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
