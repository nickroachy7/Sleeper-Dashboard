import { useParams, Link } from 'react-router-dom';
import { useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus, ChevronRight } from 'lucide-react';
import { ValueChart } from '../components/charts/ValueChart';
import { PositionBadge } from '../components/PositionBadge';
import { usePlayerDetail, useLeagueDirectory } from '../hooks/detail';
import { getPlayerImageUrl, playerMoves, txDraftPicks } from '../lib/trade-shared';
import type { TransactionRow } from '../types/domain';

interface TimelineEvent {
  key: string;
  timestamp: number;
  season: string | null;
  kind: 'draft' | 'trade' | 'waiver' | 'free_agent' | 'commissioner';
  headline: string;
  detail?: string;
  teamRosterId?: number;
  transactionId?: string;
}

function txKind(type: string): TimelineEvent['kind'] {
  if (type === 'trade') return 'trade';
  if (type === 'waiver') return 'waiver';
  if (type === 'commissioner') return 'commissioner';
  return 'free_agent';
}

const KIND_BADGE: Record<TimelineEvent['kind'], { label: string; cls: string }> = {
  draft: { label: 'DRAFTED', cls: 'bg-amber-500/15 text-amber-400' },
  trade: { label: 'TRADE', cls: 'bg-white text-black' },
  waiver: { label: 'WAIVER', cls: 'bg-amber-500/90 text-black' },
  free_agent: { label: 'FREE AGENT', cls: 'bg-emerald-500/90 text-black' },
  commissioner: { label: 'COMMISH', cls: 'bg-[#4c4c56] text-white' },
};

export default function PlayerDetail() {
  const { playerId } = useParams<{ playerId: string }>();
  const { data, isLoading } = usePlayerDetail(playerId);
  const { data: directory } = useLeagueDirectory();

  const currentOwner = useMemo(() => {
    if (!data || !directory) return null;
    const roster = data.owningRosters.find((r) => r.league_id === directory.currentLeagueId);
    return roster ? { rosterId: roster.roster_id, name: directory.teamName(roster.roster_id) } : null;
  }, [data, directory]);

  const timeline = useMemo((): TimelineEvent[] => {
    if (!data || !directory || !playerId) return [];
    const events: TimelineEvent[] = [];

    data.draftPicks.forEach((pick) => {
      const draft = pick.drafts as { season: string; league_id: string; type: string } | null;
      if (!pick.roster_id) return;
      events.push({
        key: `draft-${pick.id}`,
        // No exact draft timestamp on the pick; anchor to the season for ordering
        timestamp: draft ? new Date(`${draft.season}-05-01`).getTime() : 0,
        season: draft?.season ?? null,
        kind: 'draft',
        headline: `Drafted ${pick.round}.${String(pick.pick_no - (pick.round - 1) * 12).padStart(2, '0')} by ${directory.teamName(pick.roster_id, draft?.league_id)}`,
        detail: draft ? `${draft.season} ${draft.type === 'snake' ? 'startup' : 'rookie'} draft` : undefined,
        teamRosterId: pick.roster_id,
      });
    });

    data.transactions.forEach((tx: TransactionRow) => {
      const adds = playerMoves(tx.adds);
      const drops = playerMoves(tx.drops);
      const toRoster = adds[playerId];
      const fromRoster = drops[playerId];
      const kind = txKind(tx.type);

      // Always the manager's current team name, not the historical season's.
      let headline: string;
      if (toRoster !== undefined && fromRoster !== undefined) {
        headline = `Traded from ${directory.teamName(fromRoster)} to ${directory.teamName(toRoster)}`;
      } else if (toRoster !== undefined) {
        headline = kind === 'trade'
          ? `Acquired by ${directory.teamName(toRoster)} via trade`
          : `Added by ${directory.teamName(toRoster)}`;
      } else {
        headline = `Dropped by ${directory.teamName(fromRoster)}`;
      }

      let detail: string | undefined;
      if (kind === 'trade') {
        const others = Object.keys(adds).filter((p) => p !== playerId).length + txDraftPicks(tx.draft_picks).length;
        if (others > 0) detail = `Part of a ${others + 1}-asset trade · tap to see value`;
      } else if (kind === 'waiver') {
        const bid = (tx.settings as { waiver_bid?: number } | null)?.waiver_bid;
        if (bid !== undefined) detail = `$${bid} FAAB`;
      }

      events.push({
        key: `tx-${tx.transaction_id}`,
        timestamp: tx.created || 0,
        season: directory.seasonByLeague.get(tx.league_id) ?? null,
        kind,
        headline,
        detail,
        teamRosterId: toRoster ?? fromRoster,
        transactionId: kind === 'trade' ? tx.transaction_id : undefined,
      });
    });

    return events.sort((a, b) => b.timestamp - a.timestamp);
  }, [data, directory, playerId]);

  if (isLoading || !data) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto space-y-4">
        <div className="skeleton h-32 w-full rounded-2xl" />
        <div className="skeleton h-64 w-full rounded-2xl" />
        <div className="skeleton h-40 w-full rounded-2xl" />
      </div>
    );
  }

  if (!data.player) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto text-center py-16">
        <p className="text-sm text-[#9c9ca7]">Player not found.</p>
        <Link to="/" className="text-xs text-accent-400 mt-2 inline-block">Back to Home</Link>
      </div>
    );
  }

  const { player, value, history } = data;
  const trend = value?.trend || 0;

  const dateStr = (ts: number) =>
    new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto space-y-4">
      {/* ── Header ── */}
      <section className="relative overflow-hidden rounded-2xl border border-[#22222b] bg-gradient-to-br from-[#16161c] via-[#141419] to-[#111116]">
        <div className="pointer-events-none absolute -top-20 -right-12 h-48 w-48 rounded-full bg-accent-500/10 blur-3xl" />
        <div className="relative p-4 sm:p-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden bg-[#22222b] shrink-0 ring-1 ring-inset ring-white/10">
              <img
                src={getPlayerImageUrl(player.player_id)}
                alt=""
                className="w-full h-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-display text-xl sm:text-3xl font-bold text-white tracking-tight truncate">
                  {player.full_name}
                </h1>
                <PositionBadge position={player.position || '?'} size="sm" />
              </div>
              <p className="text-[12px] text-[#9c9ca7] mt-1">
                {player.team || 'Free Agent'}
                {player.age ? ` · ${player.age} yrs` : ''}
                {player.years_exp != null ? ` · ${player.years_exp === 0 ? 'Rookie' : `${player.years_exp} yr exp`}` : ''}
              </p>
              <p className="text-[12px] text-[#75757f] mt-0.5">
                {currentOwner ? (
                  <>
                    Owned by{' '}
                    <Link to={`/teams/${currentOwner.rosterId}`} className="text-accent-400 hover:text-accent-300 font-semibold">
                      {currentOwner.name}
                    </Link>
                  </>
                ) : 'Unowned in league'}
              </p>
            </div>
          </div>

          {/* Stat tiles */}
          <div className="grid grid-cols-3 gap-2.5 mt-4 sm:mt-5">
            <div className="rounded-xl border border-[#22222b] bg-[#101015]/60 px-3 py-2.5">
              <p className="text-[10px] text-[#75757f] uppercase tracking-[0.12em] font-bold">KTC value</p>
              <p className="font-display text-xl font-bold text-white tabular-nums mt-0.5">{value ? value.value.toLocaleString() : '—'}</p>
            </div>
            <div className="rounded-xl border border-[#22222b] bg-[#101015]/60 px-3 py-2.5">
              <p className="text-[10px] text-[#75757f] uppercase tracking-[0.12em] font-bold">Rank</p>
              <p className="font-display text-xl font-bold text-white tabular-nums mt-0.5">
                {value?.rank ? `#${value.rank}` : '—'}
                {value?.position_rank && <span className="text-[11px] text-[#75757f] ml-1.5 font-sans">{player.position}{value.position_rank}</span>}
              </p>
            </div>
            <div className="rounded-xl border border-[#22222b] bg-[#101015]/60 px-3 py-2.5">
              <p className="text-[10px] text-[#75757f] uppercase tracking-[0.12em] font-bold">30d trend</p>
              <p className={`font-display text-xl font-bold flex items-center gap-1 tabular-nums mt-0.5 ${trend > 0 ? 'text-accent-500' : trend < 0 ? 'text-red-400' : 'text-[#75757f]'}`}>
                {trend > 0 ? <TrendingUp className="h-4 w-4" /> : trend < 0 ? <TrendingDown className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
                {trend > 0 ? '+' : ''}{trend.toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Value history ── */}
      <section className="bg-[#141419] rounded-2xl p-4 sm:p-5 border border-[#22222b]">
        <p className="text-[11px] font-bold text-accent-500 tracking-[0.18em] uppercase mb-0.5">Value History</p>
        <p className="text-[10px] text-[#75757f] mb-3">KTC superflex value · weekly before the last 90 days, daily after</p>
        <ValueChart data={history} height={240} />
      </section>

      {/* ── League history ── */}
      <section className="bg-[#141419] rounded-2xl border border-[#22222b] overflow-hidden">
        <div className="px-4 sm:px-5 pt-4 pb-2">
          <p className="text-[11px] font-bold text-accent-500 tracking-[0.18em] uppercase">League History</p>
        </div>
        {timeline.length === 0 ? (
          <p className="text-[12px] text-[#75757f] px-4 sm:px-5 pb-5">
            No league events for this player — never drafted, traded, or moved on waivers.
          </p>
        ) : (
          <div>
            {timeline.map((ev) => {
              const inner = (
                <>
                  <span className={`px-2 py-0.5 text-[9px] font-extrabold tracking-[1px] rounded shrink-0 mt-0.5 ${KIND_BADGE[ev.kind].cls}`}>
                    {KIND_BADGE[ev.kind].label}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-white font-medium leading-snug">{ev.headline}</p>
                    {ev.detail && <p className="text-[11px] text-[#75757f] mt-0.5">{ev.detail}</p>}
                  </div>
                  <span className="text-[10px] text-[#60606a] shrink-0 tabular-nums mt-0.5">
                    {ev.kind === 'draft' ? ev.season : ev.timestamp ? dateStr(ev.timestamp) : ev.season}
                  </span>
                  {ev.transactionId && <ChevronRight className="h-4 w-4 text-[#4c4c56] group-hover:text-accent-400 shrink-0 mt-0.5 transition-colors" />}
                </>
              );
              const rowCls = 'group flex items-start gap-3 px-4 sm:px-5 py-3 border-t border-[#1b1b22] transition-colors';
              return ev.transactionId ? (
                <Link key={ev.key} to={`/trades/${ev.transactionId}`} className={`${rowCls} hover:bg-[#1b1b22] active:bg-[#22222b]`}>
                  {inner}
                </Link>
              ) : ev.teamRosterId !== undefined ? (
                <Link key={ev.key} to={`/teams/${ev.teamRosterId}`} className={`${rowCls} hover:bg-[#1b1b22] active:bg-[#22222b]`}>
                  {inner}
                </Link>
              ) : (
                <div key={ev.key} className={rowCls}>{inner}</div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
