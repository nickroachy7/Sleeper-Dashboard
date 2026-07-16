import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useLeague, usePlayerValuesList } from '../hooks/queries';
import { usePlayerMap, useTradeData } from '../hooks/useLeagueData';
import { useActiveLeague } from '../lib/active-league';
import { openAddLeague } from '../lib/add-league-modal';
import { NoLeagueState } from '../components/NoLeagueState';
import { Plus } from 'lucide-react';
import { useMemo } from 'react';
import { ValueWatch } from '../components/ValueWatch';
import { HomeSplash } from '../components/HomeSplash';
import { MyTeamCard, type MyTeamStanding } from '../components/MyTeamCard';
import { BiggestMovers } from '../components/BiggestMovers';
import { LeagueFeed } from '../components/LeagueFeed';
import { useGlobalMovers } from '../hooks/useGlobalMovers';
import {
  calcWeightedPositionValue,
  buildPicksForRoster,
  POSITION_WEIGHT_TIERS,
  type RosterPosition,
} from '../lib/trade-shared';

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
  const { rosters: tradeRosters, pickValues, tradedPicks } = useTradeData();

  // League-agnostic movers + rankings for the logged-out home.
  const globalMovers = useGlobalMovers(30);

  const { data: rostersData } = useQuery({
    queryKey: ['home-rosters', league?.league_id],
    queryFn: async () => {
      const { data: rosters } = await supabase.from('rosters').select('*').eq('league_id', league!.league_id);
      const { data: users } = await supabase.from('users').select('*');

      // Fetch team avatars from Sleeper API (metadata.avatar has custom team logos)
      const teamAvatars = new Map<string, string>();
      try {
        const res = await fetch(`https://api.sleeper.app/v1/league/${league!.league_id}/users`);
        const sleeperUsers: { user_id?: string; metadata?: { avatar?: string } }[] = await res.json();
        if (Array.isArray(sleeperUsers)) {
          sleeperUsers.forEach((u) => {
            const teamAvatar = u.metadata?.avatar;
            if (teamAvatar && u.user_id) teamAvatars.set(u.user_id, teamAvatar);
          });
        }
      } catch { /* fallback to user avatars */ }

      return { rosters: rosters || [], users: users || [], teamAvatars };
    },
    enabled: !!league,
  });

  // ─── Power rankings — feeds MyTeamCard's rank + roster-value stats ───
  const powerRankings = useMemo<MyTeamStanding[]>(() => {
    if (!rostersData || !playerValues || !playersMap) return [];
    return rostersData.rosters
      .map((roster) => {
        const playerIds: string[] = roster.players || [];
        const positionGroups: Record<string, { value: number }[]> = {};
        playerIds.forEach((pid: string) => {
          const val = playerValues.get(pid) || 0;
          const p = playersMap.get(pid);
          if (p && p.position in POSITION_WEIGHT_TIERS) {
            (positionGroups[p.position] ??= []).push({ value: val });
          }
        });
        let totalValue = 0;
        for (const pos of Object.keys(POSITION_WEIGHT_TIERS) as RosterPosition[]) {
          totalValue += calcWeightedPositionValue(positionGroups[pos] || [], pos);
        }
        if (pickValues.length) {
          const pickAssets = buildPicksForRoster(roster.roster_id, tradeRosters, pickValues, tradedPicks);
          totalValue += pickAssets.reduce((sum, a) => sum + a.value, 0);
        }
        return { rosterId: roster.roster_id, totalValue, wins: roster.wins ?? 0, losses: roster.losses ?? 0 };
      })
      .sort((a, b) => b.totalValue - a.totalValue)
      .map((team, idx) => ({ ...team, rank: idx + 1 }));
  }, [rostersData, playerValues, playersMap, tradeRosters, pickValues, tradedPicks]);

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
  // unknown ?league= id.
  if (!league) {
    return (
      <div className="min-h-dvh p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
        <NoLeagueState
          heading="Getting your league ready…"
          sub="If you just added a league, its data is still importing — this can take a moment. Otherwise, add your Sleeper league to get started."
          compact
        />
      </div>
    );
  }

  // ─── Main Render: your team, then the league activity feed ──────────

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

        {/* Your team — pinned above the feed */}
        <MyTeamCard standings={powerRankings} />

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
