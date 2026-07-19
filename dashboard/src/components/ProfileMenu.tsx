import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, LogOut, MessageSquarePlus, Plus, Settings, UserRound } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useActiveLeague } from '../lib/active-league';
import { openAddLeague } from '../lib/add-league-modal';
import { openAuth } from '../lib/auth-modal';

// ── Profile menu ──────────────────────────────────────────────────
// The app's top-right identity: the user's profile picture (their Sleeper
// avatar, captured during onboarding) opening a quick sheet — who they are,
// their leagues (tap to switch), and account actions. Guests get the same
// trigger with a silhouette; their sheet leads with the sign-up pitch.
// Replaces the old compact LeagueSwitcher in the mobile header and adds the
// same affordance to the desktop top bar.

/** Round avatar trigger: image → username initial → guest silhouette. */
function AvatarFace({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const { user, username, avatarUrl } = useAuth();
  const cls = size === 'md' ? 'w-9 h-9' : 'w-8 h-8';
  if (avatarUrl) {
    return <img src={avatarUrl} alt="" className={`${cls} rounded-full object-cover`} />;
  }
  const initial = (username ?? user?.email ?? '').trim()[0]?.toUpperCase();
  return (
    <span className={`${cls} rounded-full bg-[#1b1b22] border border-[#2a2a34] flex items-center justify-center`}>
      {user && initial ? (
        <span className="text-[13px] font-bold text-white leading-none">{initial}</span>
      ) : (
        <UserRound className="h-[18px] w-[18px] text-[#9c9ca7]" />
      )}
    </span>
  );
}

export function ProfileMenu({ compact = false }: { compact?: boolean }) {
  const navigate = useNavigate();
  const { user, username, signOut } = useAuth();
  const { leagues, activeLeagueId, setActiveLeague } = useActiveLeague();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [open]);

  const go = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={user ? `Profile: ${username ?? user.email}` : 'Sign in'}
        className="rounded-full active:opacity-80 transition-opacity shrink-0"
      >
        <AvatarFace size={compact ? 'sm' : 'md'} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-[90] w-72 rounded-xl bg-[#141419] border border-[#2a2a34] shadow-2xl overflow-hidden py-1"
        >
          {/* Identity row (guests get the save-your-leagues pitch) */}
          {user ? (
            <div className="flex items-center gap-3 px-3 py-3 border-b border-[#22222b]">
              <AvatarFace />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-white truncate">{username ?? user.email}</p>
                {username && <p className="text-[11px] text-[#75757f] truncate">{user.email}</p>}
              </div>
            </div>
          ) : (
            <div className="border-b border-[#22222b]">
              {/* Guests: create-account leads to the full-page onboarding;
                  returning users get the lightweight sign-in modal. */}
              <button
                role="menuitem"
                onClick={() => go(() => navigate('/welcome'))}
                className="w-full flex items-center gap-3 px-3 pt-3 pb-2 text-left hover:bg-[#1b1b22] transition-colors"
              >
                <AvatarFace />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-white">Create an account</p>
                  <p className="text-[11px] text-[#75757f]">Save your leagues to any device</p>
                </div>
              </button>
              <button
                role="menuitem"
                onClick={() => go(openAuth)}
                className="w-full px-3 pb-2.5 pl-[60px] text-left text-[12px] text-accent-400 hover:text-accent-300 transition-colors"
              >
                Already have one? Sign in
              </button>
            </div>
          )}

          {/* Leagues — the switcher now lives here */}
          {leagues.length > 0 && (
            <div className="max-h-[38vh] overflow-y-auto py-1 border-b border-[#22222b]">
              <p className="px-3 pt-1.5 pb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[#5a5a64]">
                My leagues
              </p>
              {leagues.map((l) => {
                const isActive = l.rootLeagueId === activeLeagueId;
                return (
                  <button
                    key={l.rootLeagueId}
                    role="menuitem"
                    onClick={() => go(() => setActiveLeague(l.rootLeagueId))}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[#1b1b22] transition-colors"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isActive ? 'bg-accent-500' : 'bg-[#3a3a44]'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-white truncate">{l.name}</p>
                      <p className="text-[11px] text-[#75757f]">{l.season} Season</p>
                    </div>
                    {isActive && <Check className="h-4 w-4 text-accent-400 shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}

          {/* Actions */}
          <button
            role="menuitem"
            onClick={() => go(openAddLeague)}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-[13px] text-accent-400 hover:bg-[#1b1b22] transition-colors font-medium"
          >
            <Plus className="h-4 w-4" /> Add a league
          </button>
          <button
            role="menuitem"
            onClick={() => go(() => navigate('/settings'))}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-[13px] text-[#9c9ca7] hover:bg-[#1b1b22] transition-colors"
          >
            <Settings className="h-4 w-4" /> Settings
          </button>
          <button
            role="menuitem"
            onClick={() => go(() => navigate('/feedback'))}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-[13px] text-[#9c9ca7] hover:bg-[#1b1b22] transition-colors"
          >
            <MessageSquarePlus className="h-4 w-4" /> Feedback
          </button>
          {user && (
            <button
              role="menuitem"
              disabled={signingOut}
              onClick={async () => {
                setSigningOut(true);
                try {
                  await signOut();
                } finally {
                  setSigningOut(false);
                  setOpen(false);
                }
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-[13px] text-[#9c9ca7] hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          )}
        </div>
      )}
    </div>
  );
}
