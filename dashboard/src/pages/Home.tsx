import { usePlayerValuesList } from '../hooks/queries';
import { usePlayerMap } from '../hooks/useLeagueData';
import { useActiveLeague } from '../lib/active-league';
import { openAddLeague } from '../lib/add-league-modal';
import { Plus } from 'lucide-react';
import { useMemo } from 'react';
import { ValueWatch } from '../components/ValueWatch';
import { HomeSplash } from '../components/HomeSplash';
import { BiggestMovers } from '../components/BiggestMovers';
import { LeagueFeed } from '../components/LeagueFeed';
import { useGlobalMovers } from '../hooks/useGlobalMovers';

// Buttons for a logged-out visitor — only tools that work WITHOUT a league.
const GLOBAL_ACTIONS = [
  { to: '/trade', label: 'Tools' },
  { to: '/players', label: 'Ranking' },
  { to: '/value-vote', label: "Rank 'Em" },
] as const;

// ─── Component ───────────────────────────────────────────────────────

export default function Home() {
  const { hasLeague, isPreview } = useActiveLeague();
  const { data: playersMap } = usePlayerMap();
  const { data: playerValues } = usePlayerValuesList();

  // League-agnostic movers + rankings for the logged-out home.
  const globalMovers = useGlobalMovers(30);

  // ─── Global rankings (Top 10) for the logged-out home ───────────────
  const globalRankings = useMemo(() => {
    if (!playerValues || !playersMap) return [] as { playerId: string; name: string; position: string; team: string | null; value: number; ownerTeam: string; rank: number }[];
    const rows: { playerId: string; name: string; position: string; team: string | null; value: number; ownerTeam: string }[] = [];
    for (const [pid, value] of playerValues) {
      const p = playersMap.get(pid);
      if (!p || !value) continue;
      rows.push({ playerId: pid, name: p.full_name, position: p.position, team: p.team, value, ownerTeam: '' });
    }
    return rows.sort((a, b) => b.value - a.value).slice(0, 10).map((r, i) => ({ ...r, rank: i + 1 }));
  }, [playerValues, playersMap]);

  // ─── New-user / Loading / Empty states ───────────────────────────

  // Fresh visitor with no league: the splash + league-agnostic sections
  // (movers + rankings from the shared community values). No feed without a
  // league — nothing to stream.
  if (!hasLeague) {
    return (
      <div className="min-h-dvh">
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 lg:space-y-8">
          <HomeSplash
            title="Dynasty fantasy,"
            tagline="decoded."
            eyebrow="Community-powered values"
            live={false}
            description="Community-driven player values, instant trade grades, and rankings — free for any Sleeper league. Add yours to unlock your rosters, trades, and power rankings."
            actions={GLOBAL_ACTIONS}
            addLeagueCta
          />
          <BiggestMovers risers={globalMovers.risers} fallers={globalMovers.fallers} windowLabel="30d" loading={globalMovers.loading} />
          <ValueWatch players={globalRankings} />
        </div>
      </div>
    );
  }

  // ─── Main Render: the cross-league activity feed ────────────────────
  // League-neutral: the feed aggregates trades + roster moves across ALL the
  // user's leagues (each item badged with its league). Per-league identity and
  // switching live on the League page; the "Your team" card lives on League →
  // Standings. The feed handles its own loading/empty states.

  return (
    <div className="min-h-dvh">
      <div className="p-4 sm:p-6 lg:p-8 max-w-2xl mx-auto space-y-4">
        {/* Sample-preview banner */}
        {isPreview && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl bg-accent-500/10 border border-accent-500/25 px-4 py-3">
            <p className="text-[13px] text-[#c4c4cd] flex-1">
              You're viewing a <span className="font-semibold text-white">sample league</span>. Add your own to see your rosters, values, and trades.
            </p>
            <button
              onClick={openAddLeague}
              className="inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-lg bg-accent-500 text-[#06110a] text-[13px] font-semibold hover:bg-accent-400 transition-colors shrink-0"
            >
              <Plus className="h-4 w-4" /> Add your league
            </button>
          </div>
        )}

        {/* Cross-league activity feed */}
        <div>
          <div className="flex items-baseline justify-between mb-3 px-0.5">
            <p className="text-[11px] font-bold text-accent-500 tracking-[0.2em] uppercase">
              The Wire
            </p>
            <span className="text-[11px] text-[#75757f]">Across your leagues</span>
          </div>
          <LeagueFeed />
        </div>
      </div>
    </div>
  );
}
