import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import {
  Loader2,
  Zap,
  ArrowLeftRight,
  FileText,
  Scale,
  Clock,
  Medal,
  Crown,
  ChevronRight,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useMemo } from 'react';

// ─── Types ───────────────────────────────────────────────────────────

interface Player {
  player_id: string;
  full_name: string;
  position: string;
  team: string | null;
}

interface LeagueUser {
  user_id: string;
  team_name: string | null;
  display_name: string | null;
}

// ─── Constants ───────────────────────────────────────────────────────

const positionColors: Record<string, string> = {
  QB: 'text-[#ef4444]',
  RB: 'text-[#22c55e]',
  WR: 'text-[#3b82f6]',
  TE: 'text-[#f59e0b]',
};

const quickLinks = [
  { to: '/trade', icon: Scale, label: 'Trade Evaluator', color: 'text-[#f97316]' },
  { to: '/transactions', icon: ArrowLeftRight, label: 'Transactions', color: 'text-[#22c55e]' },
  { to: '/drafts', icon: FileText, label: 'Draft Capital', color: 'text-[#8b5cf6]' },
];

// ─── Component ───────────────────────────────────────────────────────

export default function Home() {
  // ── League info ──
  const { data: league, isLoading: leagueLoading } = useQuery({
    queryKey: ['home-league'],
    queryFn: async () => {
      const { data } = await supabase.from('leagues').select('*').order('season', { ascending: false }).limit(1);
      return data?.[0] || null;
    },
  });

  // ── Players DB ──
  const { data: playersMap } = useQuery({
    queryKey: ['home-players'],
    queryFn: async () => {
      const { data } = await supabase.from('players').select('player_id, full_name, position, team');
      const map = new Map<string, Player>();
      (data as Player[] || []).forEach(p => map.set(p.player_id, p));
      return map;
    },
    enabled: !!league,
  });

  // ── Player values (KTC) ──
  const { data: playerValues } = useQuery({
    queryKey: ['home-player-values'],
    queryFn: async () => {
      const { data } = await supabase.from('player_values').select('player_id, value');
      const map = new Map<string, number>();
      (data as { player_id: string; value: number }[] || []).forEach(pv => map.set(pv.player_id, pv.value));
      return map;
    },
    enabled: !!league,
  });

  // ── Rosters ──
  const { data: rostersData } = useQuery({
    queryKey: ['home-rosters', league?.league_id],
    queryFn: async () => {
      const { data: rosters } = await supabase.from('rosters').select('*').eq('league_id', league.league_id);
      const { data: users } = await supabase.from('users').select('*');
      const { data: leagueUsers } = await supabase.from('league_users').select('user_id, team_name, display_name');
      return { rosters: rosters as any[] || [], users: users as any[] || [], leagueUsers: leagueUsers as LeagueUser[] || [] };
    },
    enabled: !!league,
  });

  // ── Transactions (recent trades) ──
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
      return data as any[] || [];
    },
    enabled: !!league,
  });

  // ─── Derived: Power Rankings ─────────────────────────────────────

  const powerRankings = useMemo(() => {
    if (!rostersData || !playerValues || !playersMap) return [];

    const { rosters, users, leagueUsers } = rostersData;

    return rosters
      .map((roster: any) => {
        const owner = users.find((u: any) => u.user_id === roster.owner_id);
        const leagueUser = leagueUsers.find((lu) => lu.user_id === roster.owner_id);
        const teamName = leagueUser?.team_name || leagueUser?.display_name || owner?.display_name || owner?.username || 'Unknown';

        // Sum KTC values for all rostered players
        const playerIds: string[] = roster.players || [];
        let totalValue = 0;
        let topPlayer: { name: string; value: number; position: string; playerId: string } | null = null;

        playerIds.forEach((pid: string) => {
          const val = playerValues.get(pid) || 0;
          totalValue += val;
          if (!topPlayer || val > topPlayer.value) {
            const p = playersMap.get(pid);
            if (p) {
              topPlayer = { name: p.full_name, value: val, position: p.position, playerId: pid };
            }
          }
        });

        return {
          rosterId: roster.roster_id,
          teamName,
          totalValue,
          topPlayer,
          wins: roster.wins ?? 0,
          losses: roster.losses ?? 0,
        };
      })
      .sort((a: any, b: any) => b.totalValue - a.totalValue)
      .map((team: any, idx: number) => ({ ...team, rank: idx + 1 }));
  }, [rostersData, playerValues, playersMap]);

  const maxTeamValue = powerRankings.length > 0 ? powerRankings[0].totalValue : 1;

  // ─── Derived: Value Watch (Top 15 Assets) ────────────────────────

  const valueWatch = useMemo(() => {
    if (!rostersData || !playerValues || !playersMap) return [];

    const { rosters, users, leagueUsers } = rostersData;

    // Build roster_id → team name mapping
    const rosterToTeam = new Map<number, string>();
    rosters.forEach((r: any) => {
      const owner = users.find((u: any) => u.user_id === r.owner_id);
      const lu = leagueUsers.find((l) => l.user_id === r.owner_id);
      rosterToTeam.set(r.roster_id, lu?.team_name || lu?.display_name || owner?.display_name || owner?.username || 'Unknown');
    });

    // Collect all rostered players with values
    const allPlayers: { playerId: string; name: string; position: string; team: string | null; value: number; ownerTeam: string }[] = [];

    rosters.forEach((roster: any) => {
      const ownerTeam = rosterToTeam.get(roster.roster_id) || 'Unknown';
      (roster.players || []).forEach((pid: string) => {
        const p = playersMap.get(pid);
        const val = playerValues.get(pid) || 0;
        if (p && val > 0) {
          allPlayers.push({
            playerId: pid,
            name: p.full_name,
            position: p.position,
            team: p.team,
            value: val,
            ownerTeam,
          });
        }
      });
    });

    return allPlayers
      .sort((a, b) => b.value - a.value)
      .slice(0, 15)
      .map((p, idx) => ({ ...p, rank: idx + 1 }));
  }, [rostersData, playerValues, playersMap]);

  // ─── Derived: Trade data with team names ─────────────────────────

  const tradesWithTeams = useMemo(() => {
    if (!recentTrades || !rostersData || !playersMap || !playerValues) return [];

    const { rosters, users, leagueUsers } = rostersData;

    const rosterToOwner = new Map<number, string>();
    rosters.forEach((r: any) => rosterToOwner.set(r.roster_id, r.owner_id));

    const rosterToTeam = new Map<number, string>();
    rosters.forEach((r: any) => {
      const owner = users.find((u: any) => u.user_id === r.owner_id);
      const lu = leagueUsers.find((l) => l.user_id === r.owner_id);
      rosterToTeam.set(r.roster_id, lu?.team_name || lu?.display_name || owner?.display_name || owner?.username || 'Unknown');
    });

    return recentTrades.map((tx: any) => {
      const teamAssets: Record<number, { teamName: string; players: { id: string; name: string; position: string; team: string | null; value: number }[]; picks: any[]; totalValue: number }> = {};

      // Initialize teams
      (tx.roster_ids || []).forEach((rid: number) => {
        teamAssets[rid] = {
          teamName: rosterToTeam.get(rid) || `Team ${rid}`,
          players: [],
          picks: [],
          totalValue: 0,
        };
      });

      // Players received
      if (tx.adds) {
        Object.entries(tx.adds).forEach(([playerId, rosterId]) => {
          const rId = rosterId as number;
          if (teamAssets[rId]) {
            const p = playersMap.get(playerId);
            const val = playerValues.get(playerId) || 0;
            teamAssets[rId].players.push({
              id: playerId,
              name: p?.full_name || playerId,
              position: p?.position || '?',
              team: p?.team || null,
              value: val,
            });
            teamAssets[rId].totalValue += val;
          }
        });
      }

      // Draft picks
      if (tx.draft_picks && Array.isArray(tx.draft_picks)) {
        tx.draft_picks.forEach((pick: any) => {
          const pickValue = pick.round === 1 ? 5000 : pick.round === 2 ? 2000 : pick.round === 3 ? 800 : 400;
          if (pick.owner_id && teamAssets[pick.owner_id]) {
            teamAssets[pick.owner_id].picks.push(pick);
            teamAssets[pick.owner_id].totalValue += pickValue;
          }
        });
      }

      // Find winner (always pick one, or mark as even if diff is 0)
      const sides = Object.values(teamAssets);
      let winnerId: number | null = null;
      let isEvenTrade = false;
      if (sides.length === 2) {
        const diff = sides[0].totalValue - sides[1].totalValue;
        if (diff === 0) {
          isEvenTrade = true;
        } else {
          winnerId = diff > 0 ? Number(Object.keys(teamAssets)[0]) : Number(Object.keys(teamAssets)[1]);
        }
      }

      const timestamp = tx.created || tx.status_updated;
      const date = timestamp ? new Date(timestamp) : new Date(tx.created_at);

      return {
        id: tx.transaction_id || tx.id,
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        teamAssets,
        winnerId,
        isEvenTrade,
        sides,
      };
    });
  }, [recentTrades, rostersData, playersMap, playerValues]);

  // ─── Helpers ─────────────────────────────────────────────────────

  const getRankColor = (rank: number) => {
    if (rank === 1) return '#ffd700';
    if (rank === 2) return '#c0c0c0';
    if (rank === 3) return '#cd7f32';
    return undefined;
  };

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Crown className="h-4 w-4" style={{ color: '#ffd700' }} />;
    if (rank === 2) return <Medal className="h-4 w-4" style={{ color: '#c0c0c0' }} />;
    if (rank === 3) return <Medal className="h-4 w-4" style={{ color: '#cd7f32' }} />;
    return null;
  };

  // ─── Loading state ───────────────────────────────────────────────

  if (leagueLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-accent-500" />
        </div>
      </div>
    );
  }

  if (!league) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="flex flex-col items-center justify-center py-12">
          <div className="text-center max-w-sm">
            <div className="w-16 h-16 bg-accent-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Zap className="h-8 w-8 text-accent-400" />
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">Welcome to Sleeper Dashboard</h2>
            <p className="text-[#888888] text-sm mb-6">Connect your Sleeper fantasy league to get started</p>
            <Link
              to="/settings"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-accent-500 text-white text-sm font-medium rounded-lg hover:bg-accent-600 transition-colors"
            >
              <Zap className="h-4 w-4" />
              Connect Your League
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ─── Main Render ─────────────────────────────────────────────────

  const now = new Date();
  const dateLabel = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">

      {/* ── MASTHEAD ──────────────────────────────────────────────── */}
      <div className="text-center mb-6 sm:mb-8 pb-6 border-b border-[#151515]">
        <h1 className="text-lg sm:text-xl font-extrabold text-white tracking-[4px] uppercase">
          {league.name || 'DYNASTY RELOADED'}
        </h1>
        <p className="text-xs text-[#555555] tracking-[1px] uppercase mt-2">
          Weekly · {dateLabel}
        </p>
        <div className="mt-3 pt-3 border-t border-[#151515]">
          <p className="text-[11px] text-[#444444] tracking-[1px]">
            {league.total_rosters}-TEAM SUPERFLEX · HALF-PPR · TEP · SLEEPER
          </p>
        </div>
      </div>

      {/* ── POWER RANKINGS ────────────────────────────────────────── */}
      {powerRankings.length > 0 && (
        <section className="mb-8">
          <div className="mb-5">
            <p className="text-[10px] font-bold text-[#555555] tracking-[3px] uppercase mb-2">POWER RANKINGS</p>
            <div className="flex items-center justify-between">
              <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">Dynasty Value Rankings</h2>
              <Link to="/ktc-values" className="text-xs text-[#555555] hover:text-[#888888] transition-colors flex items-center gap-1">
                KTC Rankings <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
            <p className="text-[13px] text-[#666666] mt-1">Teams ranked by total KTC roster value (SF+TEP)</p>
          </div>

          <div className="overflow-hidden">
            <div className="divide-y divide-[#111111]">
              {powerRankings.map((team: any) => (
                <div key={team.rosterId} className="flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3 sm:py-3.5 hover:bg-[#111111] transition-colors">
                  {/* Rank */}
                  <div className="w-7 sm:w-8 flex-shrink-0 text-center">
                    {getRankIcon(team.rank) || (
                      <span className="text-sm font-bold text-[#555555]">{team.rank}</span>
                    )}
                  </div>

                  {/* Team + Bar */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className={`text-sm truncate ${team.rank <= 3 ? 'font-bold text-white' : 'font-semibold text-white'}`}>
                        {team.teamName}
                      </span>
                      <span className="text-sm font-bold text-white tabular-nums ml-3">
                        {team.totalValue.toLocaleString()}
                      </span>
                    </div>
                    {/* Value bar */}
                    <div className="w-full h-1.5 bg-[#111111] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(team.totalValue / maxTeamValue) * 100}%`,
                          background: 'linear-gradient(90deg, #ffffff, #333333)',
                        }}
                      />
                    </div>
                  </div>

                  {/* Top Asset */}
                  {team.topPlayer && (
                    <div className="hidden sm:flex items-center gap-2 flex-shrink-0 w-44">
                      <img
                        src={`https://sleepercdn.com/content/nfl/players/${team.topPlayer.playerId}.jpg`}
                        alt=""
                        className="w-7 h-7 rounded-full object-cover bg-[#111111] flex-shrink-0"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-white truncate">{team.topPlayer.name}</p>
                        <p className="text-[10px]">
                          <span className={positionColors[team.topPlayer.position] || 'text-[#888888]'}>{team.topPlayer.position}</span>
                          <span className="text-[#555555]"> · {team.topPlayer.value.toLocaleString()}</span>
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Divider ───────────────────────────────────────────────── */}
      <div className="border-t border-[#151515] mb-8" />

      {/* ── THE WIRE (RECENT TRADES) ──────────────────────────────── */}
      {tradesWithTeams.length > 0 && (
        <section className="mb-8">
          <div className="mb-5">
            <p className="text-[10px] font-bold text-[#555555] tracking-[3px] uppercase mb-2">THE WIRE</p>
            <div className="flex items-center justify-between">
              <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">Recent Trades</h2>
              <Link to="/transactions" className="text-xs text-[#555555] hover:text-[#888888] transition-colors flex items-center gap-1">
                All Trades <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
            <p className="text-[13px] text-[#666666] mt-1">Latest completed trades with KTC value analysis</p>
          </div>

          <div className="space-y-5 sm:space-y-6">
            {tradesWithTeams.map((trade: any) => (
              <div key={trade.id} className="border-b border-[#151515] pb-5 sm:pb-6">
                {/* Trade header */}
                <div className="flex items-center justify-between mb-3 sm:mb-4">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-white text-black text-[10px] font-extrabold tracking-[1px] rounded-sm">TRADE</span>
                    <span className="text-xs text-[#555555] flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {trade.date}
                    </span>
                  </div>
                  {trade.sides.length === 2 && (
                    trade.isEvenTrade ? (
                      <span className="text-[10px] sm:text-xs text-[#555555] font-medium">Even Trade</span>
                    ) : (
                      <span className="text-[10px] sm:text-xs text-emerald-400 font-medium">
                        {trade.sides[0].totalValue > trade.sides[1].totalValue ? trade.sides[0].teamName : trade.sides[1].teamName} +{Math.abs(trade.sides[0].totalValue - trade.sides[1].totalValue).toLocaleString()}
                      </span>
                    )
                  )}
                </div>

                {/* Trade sides */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                  {Object.entries(trade.teamAssets).map(([rosterId, assets]: [string, any]) => {
                    const isWinner = trade.winnerId === Number(rosterId);
                    return (
                      <div
                        key={rosterId}
                        className={`pl-3 sm:pl-4 border-l-2 ${isWinner ? 'border-l-[#22c55e]' : 'border-l-[#222222]'}`}
                      >
                        {/* Team name + total */}
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-bold text-white">{assets.teamName}</span>
                            {isWinner && (
                              <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">W</span>
                            )}
                          </div>
                          <span className="text-[10px] text-[#444444]">{assets.totalValue.toLocaleString()} KTC</span>
                        </div>

                        {/* Assets */}
                        <div className="space-y-1">
                          {assets.players.map((p: any) => (
                            <div key={p.id} className="flex items-center gap-2 text-[13px]">
                              <img
                                src={`https://sleepercdn.com/content/nfl/players/${p.id}.jpg`}
                                alt=""
                                className="w-5 h-5 rounded-full object-cover bg-[#111111] flex-shrink-0"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                              />
                              <span className="text-[#cccccc]">{p.name}</span>
                              <span className="text-[#444444]">
                                ({p.position}{p.team ? `, ${p.team}` : ''})
                              </span>
                              <span className="text-[#555555] text-[11px]">({p.value.toLocaleString()})</span>
                            </div>
                          ))}
                          {assets.picks.map((pick: any, idx: number) => (
                            <div key={idx} className="flex items-center gap-2 text-[13px]">
                              <div className="w-5 h-5 rounded-full bg-[#111111] flex items-center justify-center flex-shrink-0">
                                <span className="text-[8px] font-bold text-[#555555]">PK</span>
                              </div>
                              <span className="text-[#cccccc]">{pick.season} Round {pick.round}</span>
                              <span className="text-[#555555] text-[11px]">
                                ({pick.round === 1 ? '5,000' : pick.round === 2 ? '2,000' : pick.round === 3 ? '800' : '400'})
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Divider ───────────────────────────────────────────────── */}
      <div className="border-t border-[#151515] mb-8" />

      {/* ── VALUE WATCH ───────────────────────────────────────────── */}
      {valueWatch.length > 0 && (
        <section className="mb-8">
          <div className="mb-5">
            <p className="text-[10px] font-bold text-[#555555] tracking-[3px] uppercase mb-2">VALUE WATCH</p>
            <div className="flex items-center justify-between">
              <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">Top 15 Assets</h2>
              <Link to="/ktc-values" className="text-xs text-[#555555] hover:text-[#888888] transition-colors flex items-center gap-1">
                Full Rankings <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
            <p className="text-[13px] text-[#666666] mt-1">Most valuable rostered players by KTC dynasty value</p>
          </div>

          <div className="overflow-hidden">
            {/* Table Header */}
            <div className="grid grid-cols-[2rem_40px_1fr_auto_auto] sm:grid-cols-[2rem_40px_1fr_8rem_5rem] items-center gap-2 sm:gap-3 px-4 sm:px-5 py-2.5 border-b border-[#151515]">
              <span className="text-[10px] font-bold text-[#444444] tracking-[2px] uppercase">#</span>
              <span />
              <span className="text-[10px] font-bold text-[#444444] tracking-[2px] uppercase">PLAYER</span>
              <span className="text-[10px] font-bold text-[#444444] tracking-[2px] uppercase hidden sm:block">OWNER</span>
              <span className="text-[10px] font-bold text-[#444444] tracking-[2px] uppercase text-right">VALUE</span>
            </div>

            {/* Rows */}
            <div className="divide-y divide-[#111111]">
              {valueWatch.map((player: any) => (
                <div
                  key={player.playerId}
                  className="grid grid-cols-[2rem_40px_1fr_auto_auto] sm:grid-cols-[2rem_40px_1fr_8rem_5rem] items-center gap-2 sm:gap-3 px-4 sm:px-5 py-2.5 sm:py-3 hover:bg-[#111111] transition-colors"
                >
                  {/* Rank */}
                  <span
                    className="text-sm font-bold tabular-nums"
                    style={{ color: getRankColor(player.rank) || '#555555' }}
                  >
                    {player.rank}
                  </span>

                  {/* Headshot */}
                  <div className="w-9 h-9 rounded-full overflow-hidden bg-[#111111] flex-shrink-0">
                    <img
                      src={`https://sleepercdn.com/content/nfl/players/${player.playerId}.jpg`}
                      alt=""
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).src = ''; (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  </div>

                  {/* Player info */}
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white truncate">{player.name}</p>
                    <p className="text-[11px]">
                      <span className={positionColors[player.position] || 'text-[#888888]'}>{player.position}</span>
                      {player.team && <span className="text-[#555555]"> · {player.team}</span>}
                    </p>
                  </div>

                  {/* Owner */}
                  <span className="text-xs text-[#888888] truncate hidden sm:block">{player.ownerTeam}</span>

                  {/* Value */}
                  <span className="text-sm font-bold text-white tabular-nums text-right">
                    {player.value.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Divider ───────────────────────────────────────────────── */}
      <div className="border-t border-[#151515] mb-8" />

      {/* ── QUICK LINKS ───────────────────────────────────────────── */}
      <section className="mb-8">
        <div className="mb-5">
          <p className="text-[10px] font-bold text-[#555555] tracking-[3px] uppercase mb-2">NAVIGATE</p>
          <h2 className="text-xl font-extrabold text-white tracking-tight">Quick Links</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {quickLinks.map(({ to, icon: Icon, label, color }) => (
            <Link
              key={to}
              to={to}
              className="rounded-md p-4 hover:bg-[#0a0a0a] transition-all group"
            >
              <div className="w-9 h-9 rounded-lg bg-[#111111] flex items-center justify-center mb-2.5 group-hover:bg-[#1a1a1a] transition-colors">
                <Icon className={`h-4.5 w-4.5 ${color}`} />
              </div>
              <p className="font-semibold text-white text-sm">{label}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* ── SIGN-OFF ──────────────────────────────────────────────── */}
      <div className="text-center py-6 border-t border-[#151515]">
        <p className="text-[10px] font-extrabold text-[#333333] tracking-[4px] uppercase mb-2">
          {league.name || 'DYNASTY RELOADED'}
        </p>
        <p className="text-[11px] text-[#333333]">
          Values via <span className="text-[#444444]">KeepTradeCut.com</span>
        </p>
      </div>
    </div>
  );
}
