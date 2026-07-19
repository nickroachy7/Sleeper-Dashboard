import { useLeague, usePlayerValuesList } from '../hooks/queries';
import { usePlayerMap } from '../hooks/useLeagueData';
import { useActiveLeague } from '../lib/active-league';
import { openAddLeague } from '../lib/add-league-modal';
import { NoLeagueState } from '../components/NoLeagueState';
import { Plus, Loader2 } from 'lucide-react';
import { useMemo } from 'react';
import { useImportStatus } from '../hooks/useImportStatus';
import { ValueWatch } from '../components/ValueWatch';
import { HomeSplash } from '../components/HomeSplash';
import { BiggestMovers } from '../components/BiggestMovers';
import { LeagueFeed } from '../components/LeagueFeed';
import { useGlobalMovers } from '../hooks/useGlobalMovers';

const STATUS_LABEL: Record<string, string> = {
  in_season: 'In Season',
  drafting: 'Drafting',
  complete: 'Complete',
  pre_draft: 'Pre-Draft',
};

// Buttons for a logged-out visitor — only tools that work WITHOUT a league.
const GLOBAL_ACTIONS = [
  { to: '/trade', label: 'Tools' },
  { to: '/players', label: 'Players' },
  { to: '/value-vote', label: "Rank 'Em" },
] as const;

// ─── Component ───────────────────────────────────────────────────────

export default function Home() {
  const { hasLeague, isPreview } = useActiveLeague();
  const { data: league, isLoading: leagueLoading } = useLeague();
  const { data: playersMap } = usePlayerMap();
  const { data: playerValues } = usePlayerValuesList();

  // League-agnostic movers + rankings for the logged-out home.
  const globalMovers = useGlobalMovers(30);
  // Background-import progress for a just-added league.
  const importStatus = useImportStatus();

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

  if (leagueLoading) {
    return (
      <div className="min-h-dvh">
        <div className="p-4 sm:p-6 lg:p-8 max-w-2xl mx-auto space-y-4">
          <div className="skeleton h-24 w-full rounded-2xl" />
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-28 w-full rounded-2xl" />)}
        </div>
      </div>
    );
  }

  // hasLeague is true but no current league resolved — still importing, or an
  // unknown ?league= id. useImportStatus polls tracked_leagues while the
  // background ingest runs and invalidates queries when it lands, so this
  // state resolves itself without a manual refresh.
  if (!league) {
    return (
      <div className="min-h-dvh p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
        {importStatus.status === 'pending' ? (
          <div className="rounded-2xl border border-accent-500/20 bg-accent-500/[0.04] p-8 text-center">
            <Loader2 className="h-6 w-6 text-accent-500 animate-spin mx-auto mb-3" />
            <p className="text-[15px] font-semibold text-white">Importing your league…</p>
            <p className="text-[12px] text-[#75757f] mt-1 max-w-sm mx-auto">
              Pulling every season, roster, and trade from Sleeper. This usually takes under a
              minute — the page will update on its own.
            </p>
          </div>
        ) : importStatus.status === 'error' ? (
          <NoLeagueState
            heading="Import hit a snag"
            sub={importStatus.error ?? 'Something went wrong syncing your league. Try adding it again.'}
            compact
          />
        ) : (
          <NoLeagueState
            heading="Getting your league ready…"
            sub="If you just added a league, its data is still importing — this can take a moment. Otherwise, add your Sleeper league to get started."
            compact
          />
        )}
      </div>
    );
  }

  // ─── Main Render: the league activity feed ──────────────────────────
  // (The "Your team" identity card lives at the top of League → Standings —
  // its record/rank stats are standings-flavored; Home leads with the feed.)

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

        {/* League activity feed */}
        <div>
          <div className="flex items-baseline justify-between mb-3 px-0.5">
            <p className="text-[11px] font-bold text-accent-500 tracking-[0.2em] uppercase">
              {STATUS_LABEL[league.status ?? ''] ?? league.season} · The Wire
            </p>
            <span className="text-[11px] text-[#75757f]">{league.name}</span>
          </div>
          <LeagueFeed />
        </div>
      </div>
    </div>
  );
}
