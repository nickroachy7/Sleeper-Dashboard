import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Trophy, Medal, Award, Crown, Flame, Zap, Swords, Target, Snowflake,
  Shield, Sparkles, TrendingUp, HeartCrack, Hourglass, ArrowRightLeft,
  Activity, Lock, X, type LucideIcon,
} from 'lucide-react';
import type { Trophy as TrophyDef, TrophyTier } from '../hooks/useProfileTrophies';

// ── TrophyCase ─────────────────────────────────────────────────────
// The Trophies tab: an ESPN-style shield grid of league achievements. Earned
// trophies glow in their tier metal (gold/silver/bronze); locked ones sit dim
// with a padlock and a progress hint. Tapping any trophy opens a detail sheet
// explaining how it's earned and where this manager earned it. All awards are
// derived from public league history (see useProfileTrophies).

const ICONS: Record<string, LucideIcon> = {
  trophy: Trophy, medal: Medal, award: Award, crown: Crown, flame: Flame,
  zap: Zap, swords: Swords, target: Target, snowflake: Snowflake, shield: Shield,
  sparkles: Sparkles, 'trending-up': TrendingUp, 'heart-crack': HeartCrack,
  hourglass: Hourglass, 'arrow-right-left': ArrowRightLeft, activity: Activity,
};

// Per-tier metal palette. Earned shields fill with the metal; the badge below
// (rank chip / count) borrows the same hue so the grid reads at a glance.
const TIER: Record<TrophyTier, { ring: string; grad: string; glow: string; text: string; label: string }> = {
  gold: {
    ring: 'ring-[#ffd700]/50',
    grad: 'from-[#4a3c10] via-[#2a2410] to-[#171712]',
    glow: 'shadow-[0_0_20px_-4px_rgba(255,215,0,0.45)]',
    text: 'text-[#ffd700]',
    label: 'Gold',
  },
  silver: {
    ring: 'ring-[#cbd5e1]/40',
    grad: 'from-[#2f333a] via-[#212429] to-[#171719]',
    glow: 'shadow-[0_0_18px_-6px_rgba(203,213,225,0.4)]',
    text: 'text-[#dbe2ea]',
    label: 'Silver',
  },
  bronze: {
    ring: 'ring-[#cd7f32]/45',
    grad: 'from-[#3a2814] via-[#241a10] to-[#16130f]',
    glow: 'shadow-[0_0_18px_-6px_rgba(205,127,50,0.4)]',
    text: 'text-[#e0a066]',
    label: 'Bronze',
  },
};

/** One shield in the grid. */
function TrophyShield({ trophy, onOpen }: { trophy: TrophyDef; onOpen: () => void }) {
  const Icon = ICONS[trophy.icon] ?? Award;
  const t = TIER[trophy.tier];
  return (
    <button
      onClick={onOpen}
      className="group flex flex-col items-center gap-2 text-center focus:outline-none"
    >
      <div className="relative">
        {/* Shield */}
        <div
          className={`relative w-[72px] h-[80px] flex items-center justify-center transition-transform group-active:scale-95 ${
            trophy.earned ? t.glow : ''
          }`}
          style={{
            clipPath: 'polygon(50% 0, 100% 12%, 100% 62%, 50% 100%, 0 62%, 0 12%)',
          }}
        >
          <div
            className={`absolute inset-0 bg-gradient-to-b ${
              trophy.earned ? t.grad : 'from-[#1a1a20] to-[#121216]'
            }`}
          />
          {/* Inner ring/border */}
          <div
            className={`absolute inset-[3px] ring-1 ring-inset ${
              trophy.earned ? t.ring : 'ring-white/[0.04]'
            }`}
            style={{ clipPath: 'polygon(50% 0, 100% 12%, 100% 62%, 50% 100%, 0 62%, 0 12%)' }}
          />
          <Icon
            className={`relative h-7 w-7 ${
              trophy.earned ? t.text : 'text-[#33333c]'
            }`}
            strokeWidth={trophy.earned ? 2 : 1.75}
          />
          {!trophy.earned && (
            <div className="absolute bottom-3 right-3.5 w-4 h-4 rounded-full bg-[#0d0d11] border border-[#2a2a34] flex items-center justify-center">
              <Lock className="h-2.5 w-2.5 text-[#4c4c56]" />
            </div>
          )}
        </div>
        {/* Repeatable count badge (×N) */}
        {trophy.earned && (trophy.count ?? 0) > 1 && (
          <span className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-[#0d0d11] border ${t.ring} text-[10px] font-bold tabular-nums ${t.text}`}>
            ×{trophy.count}
          </span>
        )}
      </div>
      <div className="min-h-[28px]">
        <p className={`text-[11px] font-semibold leading-tight ${trophy.earned ? 'text-white' : 'text-[#5a5a64]'}`}>
          {trophy.name}
        </p>
        {trophy.earned && trophy.detail && (
          <p className={`text-[9.5px] leading-tight mt-0.5 ${t.text} opacity-80 truncate max-w-[84px] mx-auto`}>
            {trophy.detail}
          </p>
        )}
        {!trophy.earned && trophy.progress && (
          <p className="text-[9.5px] leading-tight mt-0.5 text-faint truncate max-w-[84px] mx-auto">{trophy.progress}</p>
        )}
      </div>
    </button>
  );
}

/** Tap-to-expand detail sheet for a single trophy. */
function TrophyDetail({ trophy, onClose }: { trophy: TrophyDef; onClose: () => void }) {
  const Icon = ICONS[trophy.icon] ?? Award;
  const t = TIER[trophy.tier];
  return createPortal(
    <div className="fixed inset-0 z-[80]">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-menu-fade" onClick={onClose} />
      <div
        role="dialog"
        aria-label={trophy.name}
        className="absolute inset-x-0 bottom-0 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:bottom-auto sm:top-28 sm:w-[360px]
                   rounded-t-2xl sm:rounded-2xl border border-line bg-surface shadow-2xl
                   pb-[env(safe-area-inset-bottom)] animate-menu-drop"
      >
        <div className="flex items-center justify-end px-3 pt-3">
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-faint hover:text-white hover:bg-elevated transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-6 pb-6 -mt-2 flex flex-col items-center text-center">
          <div
            className={`relative w-24 h-[104px] flex items-center justify-center ${trophy.earned ? t.glow : ''}`}
            style={{ clipPath: 'polygon(50% 0, 100% 12%, 100% 62%, 50% 100%, 0 62%, 0 12%)' }}
          >
            <div className={`absolute inset-0 bg-gradient-to-b ${trophy.earned ? t.grad : 'from-[#1a1a20] to-[#121216]'}`} />
            <div
              className={`absolute inset-[4px] ring-1 ring-inset ${trophy.earned ? t.ring : 'ring-white/[0.04]'}`}
              style={{ clipPath: 'polygon(50% 0, 100% 12%, 100% 62%, 50% 100%, 0 62%, 0 12%)' }}
            />
            <Icon className={`relative h-10 w-10 ${trophy.earned ? t.text : 'text-[#33333c]'}`} />
          </div>

          <span className={`mt-3 text-[10px] font-bold uppercase tracking-[0.14em] ${trophy.earned ? t.text : 'text-faint'}`}>
            {t.label}{trophy.earned ? ' · Earned' : ' · Locked'}
          </span>
          <h3 className="mt-1 font-display text-xl font-bold text-white tracking-tight">{trophy.name}</h3>

          {trophy.earned && trophy.detail && (
            <p className={`mt-1.5 text-[13px] font-semibold ${t.text}`}>
              {trophy.detail}{(trophy.count ?? 0) > 1 ? ` · earned ${trophy.count}×` : ''}
            </p>
          )}

          <p className="mt-3 text-[13px] text-muted leading-relaxed max-w-[260px]">{trophy.how}</p>

          {!trophy.earned && trophy.progress && (
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-elevated border border-line px-3 py-1">
              <Lock className="h-3 w-3 text-faint" />
              <span className="text-[11px] text-ink-soft font-medium">{trophy.progress}</span>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

interface TrophyCaseProps {
  trophies: TrophyDef[];
  loading?: boolean;
  /** No Sleeper link on this profile yet — trophies can't be resolved. */
  notLinked?: boolean;
  /** Linked, but the manager isn't in any tracked league. */
  noLeagues?: boolean;
  /** True when the viewer is looking at their own profile (tailors empty copy). */
  isMe?: boolean;
}

export function TrophyCase({ trophies, loading, notLinked, noLeagues, isMe }: TrophyCaseProps) {
  const [open, setOpen] = useState<string | null>(null);

  // Earned first (gold → silver → bronze), then locked in the same tier order.
  const ordered = useMemo(() => {
    const tierRank: Record<TrophyTier, number> = { gold: 0, silver: 1, bronze: 2 };
    return [...trophies].sort((a, b) =>
      Number(b.earned) - Number(a.earned) || tierRank[a.tier] - tierRank[b.tier]
    );
  }, [trophies]);

  const earnedCount = trophies.filter((t) => t.earned).length;
  const activeTrophy = ordered.find((t) => t.id === open) ?? null;

  if (loading) {
    return (
      <section className="rounded-2xl border border-line bg-surface p-5">
        <div className="grid grid-cols-3 gap-x-3 gap-y-6">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              <div className="skeleton w-[72px] h-[80px]" style={{ clipPath: 'polygon(50% 0, 100% 12%, 100% 62%, 50% 100%, 0 62%, 0 12%)' }} />
              <div className="skeleton h-3 w-16 rounded" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (notLinked) {
    return (
      <section className="rounded-2xl border border-line bg-surface p-10 text-center">
        <Trophy className="h-8 w-8 text-[#3a3a44] mx-auto mb-3" />
        <p className="text-[14px] font-semibold text-white">No trophies yet</p>
        <p className="text-[12px] text-faint mt-1 max-w-xs mx-auto leading-snug">
          {isMe
            ? 'Connect your Sleeper account in Settings to unlock league trophies from your matchups, finishes, and trades.'
            : 'This manager hasn’t connected a Sleeper account, so their league trophies aren’t available yet.'}
        </p>
      </section>
    );
  }

  if (noLeagues) {
    return (
      <section className="rounded-2xl border border-line bg-surface p-10 text-center">
        <Trophy className="h-8 w-8 text-[#3a3a44] mx-auto mb-3" />
        <p className="text-[14px] font-semibold text-white">No league history yet</p>
        <p className="text-[12px] text-faint mt-1 max-w-xs mx-auto leading-snug">
          Trophies unlock from real matchups — they’ll appear here once this manager’s league is tracked and a season is played.
        </p>
      </section>
    );
  }

  return (
    <>
      <section className="rounded-2xl border border-line bg-surface overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-line-subtle">
          <p className="text-[11px] font-bold text-accent-500 tracking-[0.18em] uppercase">Trophy Case</p>
          <span className="text-[12px] text-faint tabular-nums">
            <span className="text-white font-semibold">{earnedCount}</span> / {trophies.length} earned
          </span>
        </div>
        <div className="grid grid-cols-3 gap-x-3 gap-y-6 p-5">
          {ordered.map((trophy) => (
            <TrophyShield key={trophy.id} trophy={trophy} onOpen={() => setOpen(trophy.id)} />
          ))}
        </div>
      </section>

      {activeTrophy && <TrophyDetail trophy={activeTrophy} onClose={() => setOpen(null)} />}
    </>
  );
}
