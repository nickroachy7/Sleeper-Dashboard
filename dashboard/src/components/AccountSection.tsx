import { useState } from 'react';
import { Loader2, LogOut, UserRound } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { openAuth } from '../lib/auth-modal';

/**
 * Settings → Account. Guests get the pitch (accounts are optional; the only
 * benefit is leagues that follow you across devices). Signed-in users see
 * their email and can sign out — sign-out clears the local league state,
 * since it now lives on the account.
 */
export function AccountSection() {
  const { user, username, loading, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  return (
    <section className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <UserRound className="h-4 w-4 text-[#75757f]" />
        <p className="text-[10px] font-bold text-[#75757f] tracking-[3px] uppercase">Account</p>
      </div>

      {loading ? (
        <div className="rounded-xl bg-[#141419] border border-[#22222b] p-5 flex items-center gap-2 text-[#75757f]">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-[13px]">Checking session…</span>
        </div>
      ) : user ? (
        <div className="rounded-xl bg-[#141419] border border-[#22222b] p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-accent-500/15 flex items-center justify-center shrink-0">
            <UserRound className="h-5 w-5 text-accent-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-white truncate">{username ?? user.email}</p>
            <p className="text-[12px] text-[#75757f] truncate">
              {username ? `${user.email} · ` : ''}Your leagues are saved to this account.
            </p>
          </div>
          <button
            onClick={async () => {
              setSigningOut(true);
              try {
                await signOut();
              } finally {
                setSigningOut(false);
              }
            }}
            disabled={signingOut}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-medium text-[#9c9ca7] hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50 shrink-0"
          >
            {signingOut ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
            Sign out
          </button>
        </div>
      ) : (
        <div className="rounded-xl bg-[#141419] border border-[#22222b] p-5 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <p className="text-[13px] text-[#c4c4cd] font-medium">You're browsing as a guest</p>
            <p className="text-[12px] text-[#75757f] mt-0.5">
              Everything works without an account. Create one to keep your leagues on any device.
            </p>
          </div>
          <button
            onClick={openAuth}
            className="inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-lg bg-accent-500 text-[#06110a] text-[13px] font-semibold hover:bg-accent-400 transition-colors shrink-0"
          >
            <UserRound className="h-4 w-4" /> Sign in / create account
          </button>
        </div>
      )}
    </section>
  );
}
