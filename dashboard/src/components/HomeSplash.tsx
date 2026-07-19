import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { openAddLeague } from '../lib/add-league-modal';
import { openAuth } from '../lib/auth-modal';
import { useAuth } from '../lib/auth';

// ─── Types ───────────────────────────────────────────────────────────

export interface SplashAction {
  /** Navigation target. Omit when using `onClick` (e.g. open the command bar). */
  to?: string;
  label: string;
  onClick?: () => void;
}

interface HomeSplashProps {
  /** Big headline — the league name, or a generic product line when logged out. */
  title: string;
  /** Punchy accent line under the title. */
  tagline?: string;
  /** Eyebrow above the title (e.g. "In Season · 2026 Season" or a generic line). */
  eyebrow: string;
  /** Show the live (green) status dot in the eyebrow. */
  live?: boolean;
  /** Supporting paragraph under the title. */
  description: string;
  /** Primary action buttons (dark, outlined). */
  actions: readonly SplashAction[];
  /** When set, render an accent "Add your league" CTA at the BOTTOM of the buttons. */
  addLeagueCta?: boolean;
  /** Optional background image URL. Drop a file in /public and pass its path. */
  heroImage?: string;
}

// ─── Component ───────────────────────────────────────────────────────

export function HomeSplash({
  title,
  tagline = 'Superflex dynasty, decoded.',
  eyebrow,
  live = true,
  description,
  actions,
  addLeagueCta = false,
  heroImage,
}: HomeSplashProps) {
  const { user } = useAuth();
  return (
    <section className="relative overflow-hidden rounded-2xl border border-[#22222b] bg-gradient-to-br from-[#16161c] via-[#121218] to-[#0e0e13]">
      {/* Optional background image with a legibility scrim */}
      {heroImage && (
        <>
          <img src={heroImage} alt="" aria-hidden className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-25" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0e0e13] via-[#0e0e13]/80 to-[#0e0e13]/40" />
        </>
      )}

      {/* Ambient accent glows for depth */}
      <div className="pointer-events-none absolute -top-28 -right-20 h-72 w-72 rounded-full bg-accent-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-[#8b5cf6]/[0.07] blur-3xl" />

      <div className="relative px-5 py-10 sm:px-8 sm:py-14 lg:py-16">
        <div className="mx-auto max-w-2xl text-center">
          {/* Eyebrow */}
          <div className="inline-flex items-center gap-2 rounded-full border border-[#26262f] bg-[#101015]/70 px-3 py-1 backdrop-blur-sm">
            {live && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(34,197,94,0.7)]" />}
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent-500">{eyebrow}</span>
          </div>

          {/* Identity */}
          <h1 className="font-display mt-5 text-4xl font-bold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl">
            {title}
          </h1>
          <p className="font-display mt-2 text-3xl font-bold leading-[1.05] tracking-tight text-accent-500 sm:text-4xl lg:text-5xl">
            {tagline}
          </p>
          <p className="mx-auto mt-5 max-w-md text-[14px] leading-relaxed text-[#9c9ca7] sm:text-[15px]">
            {description}
          </p>

          {/* Action buttons */}
          <div className="mx-auto mt-8 flex max-w-md flex-col gap-2.5">
            {actions.map(({ to, label, onClick }) => {
              const cls =
                'group relative flex items-center justify-center rounded-xl border border-[#2a2a34] bg-gradient-to-b from-[#1b1b22] to-[#141419] px-5 py-3.5 text-[15px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all hover:border-accent-500/50 hover:from-[#1f1f27] hover:to-[#17171d]';
              const underline = (
                <span className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-accent-500/60 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
              );
              return to ? (
                <Link key={label} to={to} className={cls}>
                  {underline}
                  {label}
                </Link>
              ) : (
                <button key={label} onClick={onClick} className={cls}>
                  {underline}
                  {label}
                </button>
              );
            })}

            {/* Add-league CTA — the primary action for a fresh visitor. For
                guests it opens the sign-up wizard (account → leagues → teams);
                the guest path stays one click behind it. Signed-in users with
                no leagues get the plain add-league modal. */}
            {addLeagueCta && (
              <>
                <button
                  onClick={user ? openAddLeague : openAuth}
                  className="group mt-1 flex items-center justify-center gap-2 rounded-xl bg-accent-500 px-5 py-3.5 text-[15px] font-bold text-[#06110a] shadow-[0_0_20px_rgba(34,197,94,0.18)] transition-all hover:bg-accent-400"
                >
                  <Plus className="h-[18px] w-[18px]" />
                  {user ? 'Add your league' : 'Get started'}
                </button>
                {!user && (
                  <button
                    onClick={openAddLeague}
                    className="text-[12px] text-[#75757f] hover:text-[#9c9ca7] transition-colors py-1"
                  >
                    Just browse with a league — no account
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
