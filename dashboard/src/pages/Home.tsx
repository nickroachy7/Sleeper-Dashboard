import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useLeague, usePlayerValuesList } from '../hooks/queries';
import { usePlayerMap, useTradeData } from '../hooks/useLeagueData';
import { useActiveLeague } from '../lib/active-league';
import { openAddLeague } from '../lib/add-league-modal';
import { openLookup } from '../lib/lookup';
import { NoLeagueState } from '../components/NoLeagueState';
import { Plus } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { PowerRankings } from '../components/PowerRankings';
import { RecentTrades } from '../components/RecentTrades';
import { ValueWatch } from '../components/ValueWatch';
import { HomeSplash } from '../components/HomeSplash';
import { LeaguePulse } from '../components/LeaguePulse';
import { BiggestMovers, type Mover } from '../components/BiggestMovers';
import { LeagueSnapshot } from '../components/LeagueSnapshot';
import { useValueMovers } from '../hooks/detail';
import {
  calcWeightedPositionValue,
  buildPicksForRoster,
  lookupPickValue,
  getProjectedPickSlot,
  getPickSlotDisplayName,
  playerMoves,
  txDraftPicks,
  POSITION_WEIGHT_TIERS,
  type RosterPosition,
  type TxDraftPick,
} from '../lib/trade-shared';
import { analyzeTrade } from '../lib/trade-value-adjustment';
import type { TradeAsset } from '../types/domain';

const STATUS_LABEL: Record<string, string> = {
  in_season: 'In Season',
  drafting: 'Drafting',
  complete: 'Complete',
  pre_draft: 'Pre-Draft',
};

// Buttons for a league that's been added (league-specific destinations).
const LEAGUE_ACTIONS = [
  { to: '/league', label: 'League' },
  { to: '/trade', label: 'Trade' },
  { label: 'Ask', onClick: openLookup },
] as const;

// Buttons for a logged-out visitor — only tools that work WITHOUT a league.
const GLOBAL_ACTIONS = [
  { to: '/trade', label: 'Trade' },
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
  const { data: moverValues } = useValueMovers(30);
  // The movers need all three of these; show a skeleton until they're in.
  const moversLoading = !moverValues || !playersMap || !playerValues;

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
            if (teamAvatar && u.user_id) {
              teamAvatars.set(u.user_id, teamAvatar);
            }
          });
        }
      } catch { /* fallback to user avatars */ }

      return { rosters: rosters || [], users: users || [], teamAvatars };
    },
    enabled: !!league,
  });

  const { data: recentTrades } = useQuery({
    queryKey: ['home-recent-trades'],
    queryFn: async () => {
      const { data } = await supabase
        .from('transactions')
        .select('*')
        .eq('type', 'trade')
        .eq('status', 'complete')
        .order('created', { ascending: false, nullsFirst: false })
        .limit(5);
      return data || [];
    },
    enabled: !!league,
  });

  // ─── Helper: resolve team name from roster ─────────────────────────

  const resolveTeamName = useCallback((ownerId: string) => {
    const owner = rostersData?.users.find((u) => u.user_id === ownerId);
    return owner?.display_name || owner?.username || 'Unknown';
  }, [rostersData]);

  const resolveTeamAvatar = useCallback((ownerId: string): string | null => {
    if (!rostersData) return null;
    // Prefer team avatar (custom logo), fall back to user avatar
    const teamAvatar = rostersData.teamAvatars.get(ownerId);
    if (teamAvatar) return teamAvatar;
    const owner = rostersData.users.find((u) => u.user_id === ownerId);
    return owner?.avatar ? `https://sleepercdn.com/avatars/thumbs/${owner.avatar}` : null;
  }, [rostersData]);

  // ─── Derived: Power Rankings ─────────────────────────────────────

  const powerRankings = useMemo(() => {
    if (!rostersData || !playerValues || !playersMap) return [];
    const { rosters } = rostersData;

    return rosters
      .map((roster) => {
        const teamName = resolveTeamName(roster.owner_id || '');
        const playerIds: string[] = roster.players || [];
        let topPlayer: { name: string; value: number; position: string; playerId: string } | null = null;

        // Group players by position for weighted calculation
        const positionGroups: Record<string, { value: number }[]> = {};
        playerIds.forEach((pid: string) => {
          const val = playerValues.get(pid) || 0;
          const p = playersMap.get(pid);
          if (p && p.position in POSITION_WEIGHT_TIERS) {
            if (!positionGroups[p.position]) positionGroups[p.position] = [];
            positionGroups[p.position].push({ value: val });
          }
          if (!topPlayer || val > topPlayer.value) {
            if (p) topPlayer = { name: p.full_name, value: val, position: p.position, playerId: pid };
          }
        });

        // Apply diminishing returns (same formula as KTC Values page)
        let totalValue = 0;
        for (const pos of Object.keys(POSITION_WEIGHT_TIERS) as RosterPosition[]) {
          totalValue += calcWeightedPositionValue(positionGroups[pos] || [], pos);
        }

        // Add pick values at full value (same as KTC Values page)
        const matchingTradeRoster = tradeRosters.find((r) => r.roster_id === roster.roster_id);
        if (matchingTradeRoster && pickValues.length) {
          const pickAssets = buildPicksForRoster(roster.roster_id, tradeRosters, pickValues, tradedPicks);
          totalValue += pickAssets.reduce((sum, a) => sum + a.value, 0);
        }

        const avatarUrl = resolveTeamAvatar(roster.owner_id || '');
        return { rosterId: roster.roster_id, teamName, totalValue, topPlayer, wins: roster.wins ?? 0, losses: roster.losses ?? 0, avatarUrl };
      })
      .sort((a, b) => b.totalValue - a.totalValue)
      .map((team, idx) => ({ ...team, rank: idx + 1 }));
  }, [rostersData, playerValues, playersMap, resolveTeamName, resolveTeamAvatar, tradeRosters, pickValues, tradedPicks]);

  // ─── Derived: Value Watch (Top 10 Assets) ────────────────────────

  const valueWatch = useMemo(() => {
    if (!rostersData || !playerValues || !playersMap) return [];
    const { rosters } = rostersData;

    const rosterToTeam = new Map<number, string>();
    rosters.forEach((r) => rosterToTeam.set(r.roster_id, resolveTeamName(r.owner_id || '')));

    const allPlayers: { playerId: string; name: string; position: string; team: string | null; value: number; ownerTeam: string }[] = [];
    rosters.forEach((roster) => {
      const ownerTeam = rosterToTeam.get(roster.roster_id) || 'Unknown';
      (roster.players || []).forEach((pid: string) => {
        const p = playersMap.get(pid);
        const val = playerValues.get(pid) || 0;
        if (p && val > 0) {
          allPlayers.push({ playerId: pid, name: p.full_name, position: p.position, team: p.team, value: val, ownerTeam });
        }
      });
    });

    return allPlayers
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
      .map((p, idx) => ({ ...p, rank: idx + 1 }));
  }, [rostersData, playerValues, playersMap, resolveTeamName]);

  // ─── Derived: Trades with team names ─────────────────────────────

  const tradesWithTeams = useMemo(() => {
    if (!recentTrades || !rostersData || !playersMap || !playerValues) return [];
    const { rosters } = rostersData;
    const leagueSize = rosters.length;

    // Build lightweight Roster objects for slot projection
    const rosterList = rosters.map((r) => ({
      roster_id: r.roster_id,
      owner_id: r.owner_id || '',
      players: r.players || [],
      wins: r.wins || 0,
      losses: r.losses || 0,
      fpts: Number(r.fpts) || 0,
      ownerName: '',
      teamName: null as string | null,
    }));

    const rosterToTeam = new Map<number, string>();
    rosters.forEach((r) => rosterToTeam.set(r.roster_id, resolveTeamName(r.owner_id || '')));

    const currentDraftYear = new Date().getFullYear().toString();

    const resolvePickSlot = (pick: TxDraftPick) => {
      const isCurrentYear = pick.season === currentDraftYear;
      if (isCurrentYear && leagueSize > 0) {
        const slot = getProjectedPickSlot(pick.roster_id, rosterList);
        const value = lookupPickValue(pickValues, pick.season, pick.round, { slot, leagueSize });
        const name = getPickSlotDisplayName(pick.season, pick.round, slot);
        return { value, name };
      }
      const value = lookupPickValue(pickValues, pick.season, pick.round);
      const name = `${pick.season} Round ${pick.round}`;
      return { value, name };
    };

    return recentTrades.map((tx) => {
      const teamAssets: Record<number, { teamName: string; players: { id: string; name: string; position: string; team: string | null; value: number }[]; picks: (TxDraftPick & { value: number })[]; totalValue: number; adjustedValue?: number }> = {};

      (tx.roster_ids || []).forEach((rid) => {
        teamAssets[rid] = { teamName: rosterToTeam.get(rid) || `Team ${rid}`, players: [], picks: [], totalValue: 0 };
      });

      Object.entries(playerMoves(tx.adds)).forEach(([playerId, rosterId]) => {
        if (teamAssets[rosterId]) {
          const p = playersMap.get(playerId);
          const val = playerValues.get(playerId) || 0;
          teamAssets[rosterId].players.push({ id: playerId, name: p?.full_name || playerId, position: p?.position || '?', team: p?.team || null, value: val });
          teamAssets[rosterId].totalValue += val;
        }
      });

      txDraftPicks(tx.draft_picks).forEach((pick) => {
        const resolved = resolvePickSlot(pick);
        if (pick.owner_id && teamAssets[pick.owner_id]) {
          teamAssets[pick.owner_id].picks.push({ ...pick, value: resolved.value, resolvedName: resolved.name });
          teamAssets[pick.owner_id].totalValue += resolved.value;
        }
      });

      const sides = Object.values(teamAssets);

      // Run value adjustment analysis
      let fairness: 'fair' | 'slight' | 'unfair' | 'lopsided' | undefined;
      if (sides.length === 2) {
        const buildAssets = (side: typeof sides[0]): TradeAsset[] => [
          ...side.players.map(p => ({ id: `player-${p.id}`, type: 'player' as const, name: p.name, value: p.value, position: p.position, team: p.team })),
          ...side.picks.map((pick) => ({ id: `pick-${pick.season}-${pick.round}`, type: 'pick' as const, name: pick.resolvedName || `${pick.season} Round ${pick.round}`, value: pick.value })),
        ];
        const analysis = analyzeTrade(buildAssets(sides[0]), buildAssets(sides[1]));
        fairness = analysis.fairness;
        sides[0].adjustedValue = analysis.side1.adjustedTotal;
        sides[1].adjustedValue = analysis.side2.adjustedTotal;
      }

      const timestamp = tx.created || tx.status_updated;
      const date = timestamp ? new Date(timestamp) : new Date(tx.created_at ?? 0);

      return {
        id: tx.transaction_id,
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        teamAssets,
        fairness,
        sides,
      };
    });
  }, [recentTrades, rostersData, playersMap, playerValues, resolveTeamName, pickValues]);

  // ─── Derived: Biggest Movers (30-day value change, rostered players) ──

  const movers = useMemo((): { risers: Mover[]; fallers: Mover[] } => {
    if (!rostersData || !playerValues || !playersMap || !moverValues) {
      return { risers: [], fallers: [] };
    }
    const ownerByPlayer = new Map<string, string>();
    rostersData.rosters.forEach((r) => {
      const team = resolveTeamName(r.owner_id || '');
      (r.players || []).forEach((pid: string) => ownerByPlayer.set(pid, team));
    });

    const list: Mover[] = [];
    for (const [pid, ownerTeam] of ownerByPlayer) {
      // Delta is computed base-to-base from value history; the displayed value
      // is the canonical TEP value used everywhere else in the app.
      const curBase = moverValues.current.get(pid);
      const past = moverValues.past.get(pid);
      if (!curBase || !past) continue;
      const delta = curBase - past;
      if (Math.abs(delta) < 100) continue; // ignore day-to-day noise
      const p = playersMap.get(pid);
      if (!p) continue;
      list.push({
        playerId: pid,
        name: p.full_name,
        position: p.position,
        team: p.team,
        value: playerValues.get(pid) || curBase,
        delta,
        pct: (delta / past) * 100,
        ownerTeam,
      });
    }

    const risers = [...list].sort((a, b) => b.delta - a.delta).slice(0, 5);
    const fallers = [...list].sort((a, b) => a.delta - b.delta).slice(0, 5);
    return { risers, fallers };
  }, [rostersData, playerValues, playersMap, moverValues, resolveTeamName]);

  // ─── Global (league-agnostic) sections for the logged-out home ────
  // Risers/fallers and player rankings come from the shared community values,
  // so they render without any league — across ALL players, not a roster.

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

  const globalMovers = useMemo((): { risers: Mover[]; fallers: Mover[] } => {
    if (!moverValues || !playersMap || !playerValues) return { risers: [], fallers: [] };
    const list: Mover[] = [];
    for (const [pid, curBase] of moverValues.current) {
      const past = moverValues.past.get(pid);
      if (!curBase || !past) continue;
      const delta = curBase - past;
      if (Math.abs(delta) < 100) continue;
      const p = playersMap.get(pid);
      if (!p) continue;
      list.push({ playerId: pid, name: p.full_name, position: p.position, team: p.team, value: playerValues.get(pid) || curBase, delta, pct: (delta / past) * 100, ownerTeam: '' });
    }
    const risers = [...list].sort((a, b) => b.delta - a.delta).slice(0, 5);
    const fallers = [...list].sort((a, b) => a.delta - b.delta).slice(0, 5);
    return { risers, fallers };
  }, [moverValues, playersMap, playerValues]);

  // ─── New-user / Loading / Empty states ───────────────────────────

  // Fresh visitor with no league: the same splash as the league home + the
  // league-agnostic sections (risers/fallers + player rankings from the shared
  // community values). Only truly league-specific blocks (top team, power
  // rankings, recent trades) are omitted.
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
          <BiggestMovers risers={globalMovers.risers} fallers={globalMovers.fallers} windowLabel="30d" loading={moversLoading} />
          <ValueWatch players={globalRankings} />
        </div>
      </div>
    );
  }

  if (leagueLoading) {
    return (
      <div className="min-h-dvh">
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
          {/* Skeleton: Two-column layout */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-8">
            <div className="lg:col-span-3 space-y-8">
              <div>
                <div className="skeleton h-4 w-32 mb-4" />
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="bg-[#141419] rounded-xl p-4">
                      <div className="skeleton h-10 w-10 rounded-full mx-auto mb-2" />
                      <div className="skeleton h-3 w-20 mx-auto mb-1" />
                      <div className="skeleton h-4 w-16 mx-auto" />
                    </div>
                  ))}
                </div>
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3 py-3 border-b border-[#1b1b22]">
                    <div className="skeleton h-4 w-4" />
                    <div className="skeleton h-4 w-32" />
                    <div className="flex-1" />
                    <div className="skeleton h-4 w-16" />
                  </div>
                ))}
              </div>
            </div>
            <div className="lg:col-span-2 space-y-8">
              <div>
                <div className="skeleton h-4 w-24 mb-4" />
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3 py-2.5 border-b border-[#1b1b22]">
                    <div className="skeleton h-3 w-4" />
                    <div className="skeleton h-7 w-7 rounded-full" />
                    <div className="skeleton h-3 w-24" />
                    <div className="flex-1" />
                    <div className="skeleton h-3 w-12" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // hasLeague is true but no current league resolved — the added/previewed
  // league isn't in the DB yet (still importing, or an unknown ?league= id).
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

  // ─── Main Render ─────────────────────────────────────────────────

  return (
    <div className="min-h-dvh">
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 lg:space-y-8">

      {/* ── Sample-preview banner ── */}
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

      {/* ── Splash Hero ── */}
      <HomeSplash
        title={league.name}
        eyebrow={`${league.status ? (STATUS_LABEL[league.status] ?? league.status) + ' · ' : ''}${league.season} Season`}
        live={league.status === 'in_season' || league.status === 'drafting'}
        description={`Live community-driven values, instant trade grades, and every roster move your ${league.total_rosters ?? powerRankings.length}-team league makes — all in one place.`}
        actions={LEAGUE_ACTIONS}
      />

      {/* ── League Pulse (at-a-glance highlights) ── */}
      <LeaguePulse
        topTeam={powerRankings[0] ? { name: powerRankings[0].teamName, value: powerRankings[0].totalValue, to: `/teams/${powerRankings[0].rosterId}`, image: powerRankings[0].avatarUrl } : null}
        topAsset={valueWatch[0] ? { name: valueWatch[0].name, value: valueWatch[0].value, to: `/players/${valueWatch[0].playerId}`, image: `https://sleepercdn.com/content/nfl/players/${valueWatch[0].playerId}.jpg` } : null}
      />

      {/* ── Biggest Movers (30-day value change) ── */}
      <BiggestMovers risers={movers.risers} fallers={movers.fallers} windowLabel="30d" loading={moversLoading} />

      {/* ── Two-Column Layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-8">
        {/* Main Column */}
        <div className="lg:col-span-3 space-y-8">
          <PowerRankings rankings={powerRankings} />
          <RecentTrades trades={tradesWithTeams} />
        </div>

        {/* Side Column */}
        <div className="lg:col-span-2 space-y-8">
          <ValueWatch players={valueWatch} />
          <LeagueSnapshot />
        </div>
      </div>
    </div>
    </div>
  );
}
