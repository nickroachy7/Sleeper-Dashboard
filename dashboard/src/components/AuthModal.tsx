import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { X, Loader2, AlertCircle, Mail, Lock, UserRound } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { OPEN_AUTH_EVENT } from '../lib/auth-modal';

/**
 * Sign-in modal — two fields, the one auth flow that works well as a pop-up.
 * New accounts go through the full-page onboarding at /welcome instead
 * (account → connect leagues → confirm teams); the link at the bottom
 * navigates there.
 */
export function AuthModal() {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onOpen = () => {
      setOpen(true);
      setError(null);
      setBusy(false);
    };
    window.addEventListener(OPEN_AUTH_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_AUTH_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy]);

  if (!open) return null;

  const close = () => {
    if (!busy) setOpen(false);
  };

  const canSubmit = email.trim().includes('@') && password.length >= 6 && !busy;

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      await signIn(email.trim(), password);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong — try again.');
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-[12vh]" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={close} />
      <div className="relative w-full max-w-sm rounded-2xl bg-[#0f0f14] border border-[#2a2a34] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1b1b22]">
          <div>
            <h2 className="text-[15px] font-bold text-white">Welcome back</h2>
            <p className="text-[12px] text-[#75757f]">Sign in to pick up your saved leagues.</p>
          </div>
          <button
            onClick={close}
            disabled={busy}
            aria-label="Close"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#9c9ca7] hover:text-white hover:bg-[#1b1b22] transition-colors disabled:opacity-40"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form
          className="p-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) submit();
          }}
        >
          <div className="space-y-2.5">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#60606a]" />
              <input
                autoFocus
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                disabled={busy}
                className="w-full h-10 pl-9 pr-3 rounded-lg bg-[#141419] border border-[#2a2a34] text-[14px] text-white placeholder:text-[#60606a] focus:outline-none focus:border-accent-500/60 disabled:opacity-50"
              />
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#60606a]" />
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                disabled={busy}
                className="w-full h-10 pl-9 pr-3 rounded-lg bg-[#141419] border border-[#2a2a34] text-[14px] text-white placeholder:text-[#60606a] focus:outline-none focus:border-accent-500/60 disabled:opacity-50"
              />
            </div>
          </div>

          {error && (
            <div className="mt-3 flex items-start gap-2 text-[12px] text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0 mt-px" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="mt-4 w-full flex items-center justify-center gap-2 h-10 rounded-lg bg-accent-500 text-[#06110a] text-[14px] font-semibold hover:bg-accent-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><UserRound className="h-4 w-4" /> Sign in</>}
          </button>

          <p className="mt-4 text-[12px] text-[#75757f] text-center">
            New here?{' '}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                navigate('/welcome');
              }}
              className="text-accent-400 hover:text-accent-300 font-medium transition-colors"
            >
              Create an account
            </button>
          </p>
        </form>
      </div>
    </div>,
    document.body
  );
}
