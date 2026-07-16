import { useQuery } from '@tanstack/react-query';
import { useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Users, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { usePlayerMap } from '../hooks/useLeagueData';
import { usePlayerValuesList, usePickValues, useLeagueIds } from '../hooks/queries';
import { useLeaguePickResolutions, useLeagueDirectory } from '../hooks/detail';
import { TradeCard as SharedTradeCard, type TradeSide } from './TradeCard';
import { PlayerRow } from './PlayerRow';
import { analyzeTrade } from '../lib/trade-value-adjustment';
import {
  lookupPickValue,
  formatResolvedPick,
  playerMoves,
  txDraftPicks,
  type TxDraftPick,
} from '../lib/trade-shared';
import type { Fairness, TradeAsset, TransactionRow } from '../types/domain';

// ── Feed item model ───────────────────────────────────────────────
// The home feed is a reverse-chron stream of typed items. Today it's league
// transactions; the union is deliberately open so future item kinds — value-
// vote CTAs, trending trades, discussions — slot in as new `kind`s the renderer
// switches on, without reshaping the feed. `sortKey` (ms) orders everything.

interface TradeTeam { rosterId: number; teamName: string; ownerName: string; }

export interface FeedTradeItem {
  kind: 'trade';
  id: string;
  sortKey: number;
  date: string;
  sides: TradeSide[];
  fairness?: Fairness;
}
export interface FeedMoveItem {
  kind: 'move';
  id: string;
  sortKey: number;
  date: string;
  moveType: string; // 'waiver' | 'free_agent' | 'commissioner' | …
  team: TradeTeam | null;
  adds: string[];
  drops: string[];
}
export type FeedItem = FeedTradeItem | FeedMoveItem;

const FEED_LIMIT = 40;

/**
 * The league activity feed for the home page — a social-style reverse-chron
 * stream of trades and roster moves. This is the "what's happening in my league
 * right now" surface; League → Transactions remains the filterable archive.
 */
export function LeagueFeed() {
  const { data: players } = usePlayerMap();
  const { data: playerValues } = usePlayerValuesList();
  const { data: pickValuesData } = usePickValues();
  const { data: pickResolutions } = useLeaguePickResolutions();
  const { data: directory } = useLeagueDirectory();
  const { data: leagueIds } = useLeagueIds();
  const chain = leagueIds?.chain ?? null;

  const { data: txData, isLoading } = useQuery({
    queryKey: ['league-feed', chain?.join(',') ?? 'none'],
    enabled: !!leagueIds,
    queryFn: async () => {
      // Newest transactions of every type across the dynasty chain. An empty
      // chain (no league) matches nothing rather than leaking global data.
      const { data } = await supabase
        .from('transactions')
        .select('*')
        .in('league_id', chain ?? [])
        .order('created', { ascending: false, nullsFirst: false })
        .limit(FEED_LIMIT);
      return (data ?? []) as TransactionRow[];
    },
  });

  const getPlayer = useCallback(
    (pid: string) => (players instanceof Map ? players.get(pid) : undefined),
    [players]
  );
  const getPlayerValue = useCallback(
    (pid: string): number => (playerValues instanceof Map ? playerValues.get(pid) : 0) || 0,
    [playerValues]
  );

  const resolvePick = useCallback((pick: TxDraftPick, leagueId?: string) => {
    const resolution = pickResolutions?.resolve(pick.season, pick.round, pick.roster_id);
    return formatResolvedPick(pick, resolution, {
      pickValues: pickValuesData || [],
      origTeamName: directory?.teamName(pick.roster_id, leagueId),
      playerValue: (pid) => getPlayerValue(pid) || undefined,
      playerName: (pid) => (players instanceof Map ? players.get(pid)?.full_name : undefined),
    });
  }, [pickResolutions, pickValuesData, directory, getPlayerValue, players]);

  const feed = useMemo<FeedItem[]>(() => {
    if (!txData || !directory) return [];
    const teamName = (rid: number) => directory.teamName(rid);
    const items: FeedItem[] = [];

    for (const tx of txData) {
      const ts = tx.created || tx.status_updated || (tx.created_at ? new Date(tx.created_at).getTime() : 0);
      const date = new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const rosterIds = tx.roster_ids ?? [];

      if (tx.type === 'trade') {
        const teams: TradeTeam[] = rosterIds.map((rid) => ({ rosterId: rid, teamName: teamName(rid), ownerName: '' }));
        if (teams.length < 2) continue;

        // Group each side's received players + picks (same shape the archive uses).
        const byRoster: Record<number, { players: string[]; picks: TxDraftPick[] }> = {};
        teams.forEach((t) => { byRoster[t.rosterId] = { players: [], picks: [] }; });
        Object.entries(playerMoves(tx.adds)).forEach(([pid, rid]) => { if (byRoster[rid]) byRoster[rid].players.push(pid); });
        txDraftPicks(tx.draft_picks).forEach((pk) => { if (pk.owner_id && byRoster[pk.owner_id]) byRoster[pk.owner_id].picks.push(pk); });

        const assetsFor = (rid: number): TradeAsset[] => {
          const a = byRoster[rid] ?? { players: [], picks: [] };
          return [
            ...a.players.map((pid) => {
              const p = getPlayer(pid);
              return { id: `player-${pid}`, type: 'player' as const, name: p?.full_name || pid, value: getPlayerValue(pid), position: p?.position || '?', team: p?.team || null };
            }),
            ...a.picks.map((pk) => {
              const r = resolvePick(pk, tx.league_id);
              return { id: `pick-${pk.season}-${pk.round}-${pk.roster_id}`, type: 'pick' as const, name: r.name, value: r.value };
            }),
          ];
        };

        const sideAssets = teams.map((t) => assetsFor(t.rosterId));
        const analysis = sideAssets.length >= 2 ? analyzeTrade(sideAssets[0], sideAssets[1]) : null;

        const sides: TradeSide[] = teams.map((t, idx) => {
          const a = byRoster[t.rosterId] ?? { players: [], picks: [] };
          const sideResult = analysis ? (idx === 0 ? analysis.side1 : analysis.side2) : null;
          return {
            rosterId: t.rosterId,
            teamName: t.teamName,
            players: a.players.map((pid) => {
              const p = getPlayer(pid);
              return { id: pid, name: p?.full_name || pid, position: p?.position || '?', team: p?.team || null, value: getPlayerValue(pid) };
            }),
            picks: a.picks.map((pk) => {
              const r = resolvePick(pk, tx.league_id);
              return { season: pk.season, round: pk.round, name: r.name, subtitle: r.subtitle, playerId: r.playerId, value: r.value ?? lookupPickValue(pickValuesData || [], pk.season, pk.round) };
            }),
            totalValue: sideAssets[idx].reduce((s, x) => s + x.value, 0),
            adjustedValue: sideResult?.adjustedTotal,
          };
        });

        items.push({ kind: 'trade', id: tx.transaction_id, sortKey: ts, date, sides, fairness: analysis?.fairness });
      } else {
        const adds = Object.keys(playerMoves(tx.adds));
        const drops = Object.keys(playerMoves(tx.drops));
        if (!adds.length && !drops.length) continue;
        const rid = rosterIds[0];
        items.push({
          kind: 'move', id: tx.transaction_id, sortKey: ts, date,
          moveType: tx.type,
          team: rid != null ? { rosterId: rid, teamName: teamName(rid), ownerName: '' } : null,
          adds, drops,
        });
      }
    }

    return items.sort((a, b) => b.sortKey - a.sortKey);
  }, [txData, directory, getPlayer, getPlayerValue, resolvePick, pickValuesData]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-28 w-full rounded-2xl" />)}
      </div>
    );
  }

  if (feed.length === 0) {
    return (
      <div className="rounded-2xl border border-[#22222b] bg-[#141419] p-8 text-center">
        <div className="w-11 h-11 rounded-2xl bg-accent-500/10 flex items-center justify-center mx-auto mb-3">
          <Sparkles className="h-5 w-5 text-accent-500" />
        </div>
        <p className="text-[14px] font-semibold text-white">No activity yet</p>
        <p className="text-[12px] text-[#75757f] mt-1">Trades and roster moves in your league will show up here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {feed.map((item) => <FeedItemView key={`${item.kind}-${item.id}`} item={item} getPlayer={getPlayer} getPlayerValue={getPlayerValue} directory={directory} />)}
    </div>
  );
}

// ── Item renderer ─────────────────────────────────────────────────
// One switch over the feed-item union — the extension point for future kinds.

function FeedItemView({ item, getPlayer, getPlayerValue, directory }: {
  item: FeedItem;
  getPlayer: (pid: string) => { full_name: string; position: string; team: string | null } | undefined;
  getPlayerValue: (pid: string) => number;
  directory: ReturnType<typeof useLeagueDirectory>['data'];
}) {
  if (item.kind === 'trade') {
    return (
      <Link to={`/trades/${item.id}`} className="block">
        <SharedTradeCard sides={item.sides} date={item.date} fairness={item.fairness} />
      </Link>
    );
  }

  const label = item.moveType === 'free_agent' ? 'FREE AGENT' : item.moveType === 'waiver' ? 'WAIVER' : item.moveType.toUpperCase();
  const avatar = item.team ? directory?.teamAvatar(item.team.rosterId) ?? null : null;
  const total = item.adds.length + item.drops.length;

  return (
    <div>
      <div className="flex items-center gap-2 px-1.5 pb-2 text-[11px] text-[#75757f]">
        <span className="px-1.5 py-0.5 bg-[#1b1b22] text-[#9c9ca7] text-[9px] font-bold tracking-[1px] rounded">{label}</span>
        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{item.date}</span>
      </div>
      <div className="bg-[#141419] rounded-2xl overflow-hidden border border-[#22222b] card-hover">
        <div className="flex items-center gap-2.5 px-4 py-2.5 bg-[#1b1b22]">
          {avatar ? (
            <img src={avatar} alt="" className="w-7 h-7 rounded-full bg-[#22222b] shrink-0 ring-1 ring-inset ring-white/10 object-cover" onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
          ) : (
            <div className="w-7 h-7 rounded-full bg-[#22222b] shrink-0 ring-1 ring-inset ring-white/10 flex items-center justify-center"><Users className="h-3.5 w-3.5 text-[#60606a]" /></div>
          )}
          <span className="font-display text-sm font-bold text-white truncate">{item.team?.teamName || 'Unknown'}</span>
          <span className="text-[10px] text-[#60606a]">{total} move{total !== 1 ? 's' : ''}</span>
        </div>
        <div className="py-1">
          {item.adds.map((pid) => {
            const p = getPlayer(pid);
            return <PlayerRow key={`a-${pid}`} playerId={pid} name={p?.full_name || pid} position={p?.position} team={p?.team} value={getPlayerValue(pid)} prefix={<span className="text-accent-400 font-bold text-[13px]">+</span>} dim />;
          })}
          {item.drops.map((pid) => {
            const p = getPlayer(pid);
            return <PlayerRow key={`d-${pid}`} playerId={pid} name={p?.full_name || pid} position={p?.position} team={p?.team} value={getPlayerValue(pid)} prefix={<span className="text-red-400 font-bold text-[13px]">−</span>} dim />;
          })}
        </div>
      </div>
    </div>
  );
}
