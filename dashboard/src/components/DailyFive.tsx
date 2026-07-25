import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Flame, Check, ChevronRight } from 'lucide-react';
import { PlayerVersus } from './PlayerVersus';
import { useVoteMatchups } from '../hooks/useVoteMatchups';
import { usePairDetails } from '../hooks/usePairDetails';
import { useCompareSide } from '../hooks/useCompareSide';
import { recordPairwiseVote } from '../lib/community-events';
import { useDailyStreak, dailyStreak, DAILY_GOAL } from '../lib/daily-streak';

// ── Daily Five ───────────────────────────────────────────────────────────────
// The habit ritual: make DAILY_GOAL quick calls a day, keep a day-streak alive.
// Replaces the once-per-session interrupt modal — this is inline, dismissible,
// and opt-in. Each call feeds the community value engine (same signal as
// Rank 'Em) and advances the local streak.
//
// Rendered on the Feed. Self-hides once today's goal is met (until tomorrow),
// and can be dismissed for the session. Works for guests (streak is local).

export function DailyFive() {
  // One Date for the whole render — render-pure (the streak store rolls over
  // against it). Captured once per mount; a session that crosses midnight just
  // rolls over on the next navigation, which is fine.
  const [now] = useState(() => new Date());
  const streak = useDailyStreak(now);
  const buildSide = useCompareSide();

  const [dismissed, setDismissed] = useState(false);
  const [index, setIndex] = useState(0);
  const [pickedIndex, setPickedIndex] = useState<0 | 1 | null>(null);
  const [pending, setPending] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);

  // A batch of matchups — a few more than the goal so finishing early still has
  // a card to show. Seeded by the streak count so the set differs day to day.
  const matchups = useVoteMatchups(DAILY_GOAL + 3, streak.streak * 7 + streak.today);
  const current = matchups[index] ?? null;
  const details = usePairDetails(current?.a.player_id, current?.b.player_id);

  // Hide once the goal is met (show a one-time "done" flash first) or dismissed,
  // or if there aren't enough matchups to run.
  if (dismissed) return null;
  if (streak.completeToday && !justCompleted) return null;
  if (!current && !justCompleted) return null;

  const vote = async (sideIndex: 0 | 1) => {
    if (pending || pickedIndex !== null || !current) return;
    const winner = sideIndex === 0 ? current.a : current.b;
    const loser = sideIndex === 0 ? current.b : current.a;
    setPending(true);
    setPickedIndex(sideIndex);
    try {
      await recordPairwiseVote({ winnerId: winner.player_id, loserId: loser.player_id });
      dailyStreak.record(new Date());
    } catch {
      setPickedIndex(null);
      setPending(false);
      return;
    }
    // Brief highlight, then advance to the next matchup (or finish).
    setTimeout(() => {
      const nextCount = streak.today + 1;
      if (nextCount >= DAILY_GOAL) {
        setJustCompleted(true);
        setTimeout(() => setJustCompleted(false), 2600);
      } else {
        setIndex((i) => i + 1);
      }
      setPickedIndex(null);
      setPending(false);
    }, 550);
  };

  const done = streak.today; // calls made today
  const goal = DAILY_GOAL;

  return (
    <section className="relative overflow-hidden rounded-2xl border border-accent-500/25 bg-accent-500/[0.05] p-3">
      <div className="pointer-events-none absolute -top-16 -right-10 h-40 w-40 rounded-full bg-accent-500/10 blur-3xl" />
      <div className="relative">
        {/* Header: title, progress dots, streak flame, dismiss */}
        <div className="flex items-center justify-between gap-2 mb-2.5 px-1">
          <span className="flex items-center gap-1.5 text-[11px] font-bold tracking-[0.14em] uppercase text-accent-400">
            Daily Five
            <span className="flex items-center gap-1 ml-1">
              {Array.from({ length: goal }).map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 w-1.5 rounded-full ${i < done ? 'bg-accent-500' : 'bg-white/15'}`}
                />
              ))}
            </span>
          </span>
          <div className="flex items-center gap-3">
            {streak.streak > 0 && (
              <span className="flex items-center gap-1 text-[11px] font-semibold text-orange-300" title="Day streak">
                <Flame className="h-3.5 w-3.5" /> {streak.streak}
              </span>
            )}
            <button
              onClick={() => setDismissed(true)}
              className="text-[11px] text-faint hover:text-white transition-colors"
            >
              Later
            </button>
          </div>
        </div>

        {justCompleted ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <div className="w-11 h-11 rounded-full bg-accent-500/15 flex items-center justify-center mb-2">
              <Check className="h-6 w-6 text-accent-400" />
            </div>
            <p className="text-[14px] font-bold text-white">Five down — nice.</p>
            <p className="text-[12px] text-faint mt-0.5">
              {streak.streak > 1 ? `${streak.streak}-day streak.` : 'Streak started.'} Your calls moved the community values.
            </p>
            <Link to="/trade?tab=rank" className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-accent-400 hover:text-accent-300 transition-colors">
              Keep ranking <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        ) : current ? (
          <>
            <p className="text-center text-[12px] font-semibold text-ink-soft mb-2">Who'd you rather keep?</p>
            <PlayerVersus
              a={buildSide(current.a, details.data?.a)}
              b={buildSide(current.b, details.data?.b)}
              variant="vote"
              pickedIndex={pickedIndex}
              disabled={pending || pickedIndex !== null}
              onPick={vote}
            />
          </>
        ) : null}
      </div>
    </section>
  );
}
