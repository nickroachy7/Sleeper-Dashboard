import { Link } from 'react-router-dom';

// ─── Types ───────────────────────────────────────────────────────────

interface HomeSplashProps {
  leagueName: string;
  season: string;
  totalRosters: number;
  statusLabel?: string;
  /** Punchy accent line under the league name (editorial "who we are" tagline). */
  tagline?: string;
  /** Optional background image URL. Drop a file in /public and pass its path. */
  heroImage?: string;
}

// ─── Action buttons (the primary "what do you want to do" choices) ──

const ACTIONS = [
  { to: '/trade', label: 'Trade Tools' },
  { to: '/transactions', label: 'Transactions' },
  { to: '/chat', label: 'League Chat' },
] as const;

// ─── Component ───────────────────────────────────────────────────────

export function HomeSplash({
  leagueName,
  season,
  totalRosters,
  statusLabel,
  tagline = 'Superflex dynasty, decoded.',
  heroImage,
}: HomeSplashProps) {
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
          {/* Live status eyebrow */}
          <div className="inline-flex items-center gap-2 rounded-full border border-[#26262f] bg-[#101015]/70 px-3 py-1 backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(34,197,94,0.7)]" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent-500">
              {statusLabel ? `${statusLabel} · ` : ''}{season} Season
            </span>
          </div>

          {/* Identity */}
          <h1 className="font-display mt-5 text-4xl font-bold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl">
            {leagueName}
          </h1>
          <p className="font-display mt-2 text-3xl font-bold leading-[1.05] tracking-tight text-accent-500 sm:text-4xl lg:text-5xl">
            {tagline}
          </p>
          <p className="mx-auto mt-5 max-w-md text-[14px] leading-relaxed text-[#9c9ca7] sm:text-[15px]">
            Live KeepTradeCut values, instant trade grades, and every roster move
            your {totalRosters}-team league makes — all in one place.
          </p>

          {/* Action buttons */}
          <div className="mx-auto mt-8 flex max-w-md flex-col gap-2.5">
            {ACTIONS.map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                className="group relative flex items-center justify-center rounded-xl border border-[#2a2a34] bg-gradient-to-b from-[#1b1b22] to-[#141419] px-5 py-3.5 text-[15px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all hover:border-accent-500/50 hover:from-[#1f1f27] hover:to-[#17171d]"
              >
                {/* Accent hairline that lights up on hover */}
                <span className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-accent-500/60 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                {label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
