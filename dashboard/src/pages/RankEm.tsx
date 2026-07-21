import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Sparkles, UserRound } from 'lucide-react';
import { PlayerVersus, type CompareSide } from '../components/PlayerVersus';
import { usePlayers, usePlayerValuesList, usePickValues } from '../hooks/queries';
import { useMyBoard } from '../hooks/useMyBoard';
import { usePairDetails, type AssetDetail } from '../hooks/usePairDetails';
import { recordPairwiseVote } from '../lib/community-events';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { useShowIdp } from '../lib/idp-store';
import { isVisiblePosition } from '../lib/positions';
import { pickAssetId, pickLabel } from '../lib/vote-assets';
import type { Player } from '../types/domain';

// Starter mode: boards begin as a copy of the community rankings; votes create
// the deviations that make them personal. Early votes draw from the top stars
// so the user's first disagreements land on names their friends recognize.
const SEED_TARGET = 15;   // star votes before blending into the full pool
const SEED_POOL = 30;     // draw early matchups from the top N by value

// Catered matchups: once a user has a real board, most questions should be
// about players they actually care about — roughly the first 5-7 pages of their
// personal rankings (50/page) — while still occasionally surfacing deeper
// players so the tail of the board keeps getting refined and never goes stale.
const CATER_TOP_N = 350;    // "their tier" — top ~7 pages of the personal board
const CATER_SHARE = 0.8;    // ~80% of matchups anchored in that top tier

/**
 * Pairwise value voting — "who'd you rather keep?". Each tap records one
 * value_event; the community engine turns a stream of these into live values.
 * Lives as the "Rank 'Em" tab on the Tools page (it's a contribution tool —
 * works with or without a league), rendered without its own page chrome.
 *
 * Matchups are drawn from players of nearby value so the comparison is
 * meaningful (a genuine coin-flip teaches the model more than a blowout).
 * Signed-in users with a young board (< SEED_TARGET votes) get pairs drawn
 * from the top stars until their personal board has substance.
 */
export function RankEmPanel() {
  const { data: players } = usePlayers();
  const { data: playerValueMap } = usePlayerValuesList();
  const { data: pickValues } = usePickValues();
  const { user, username } = useAuth();
  const { data: myBoard } = useMyBoard(user?.id);
  const showIdp = useShowIdp();
  const navigate = useNavigate();
  const [pair, setPair] = useState<[Player, Player] | null>(null);
  const [votes, setVotes] = useState(0);
  const [pending, setPending] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  // How many attributed votes this account has ever cast (wins+losses double-
  // count each vote, so halve). Drives starter mode; session votes advance the
  // count locally so the chip moves without refetching every tap.
  const { data: boardVotes } = useQuery({
    queryKey: ['board-size', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from('user_player_ratings')
        .select('wins, losses')
        .eq('user_id', user!.id);
      return (data ?? []).reduce((sum, r) => sum + r.wins + r.losses, 0) / 2;
    },
  });
  const totalVotes = (boardVotes ?? 0) + votes;
  const seeding = !!user && boardVotes != null && totalVotes < SEED_TARGET;

  // Draft picks as synthetic "players" so they flow through the same pool,
  // cards, and vote path. One asset per year-round, using the Mid-tier value as
  // the neutral center (matching the personal board's pick anchor). position
  // 'PICK' gets its own badge; player_id is the 'PICK:YYYY-R' board sentinel.
  const pickAssets = useMemo<Player[]>(() => {
    if (!pickValues) return [];
    return pickValues
      .filter((pv) => pv.pick_tier === 'Mid')
      .map((pv) => ({
        player_id: pickAssetId(pv.pick_year, pv.pick_round),
        full_name: pickLabel(pickAssetId(pv.pick_year, pv.pick_round)),
        position: 'PICK',
        team: null,
      }));
  }, [pickValues]);

  const pickValueMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const pv of pickValues ?? []) {
      if (pv.pick_tier === 'Mid') m.set(pickAssetId(pv.pick_year, pv.pick_round), pv.value);
    }
    return m;
  }, [pickValues]);

  // Combined asset value map (players + picks) — the market number for any asset.
  const valueMap = useMemo(() => {
    const m = new Map<string, number>(playerValueMap ?? []);
    for (const [k, v] of pickValueMap) m.set(k, v);
    return m;
  }, [playerValueMap, pickValueMap]);

  const byId = useMemo(
    () => new Map([...(players ?? []), ...pickAssets].map((p) => [p.player_id, p])),
    [players, pickAssets]
  );

  // Community-value order → overall rank and per-position rank, so cards can
  // show "#12 · WR4". Computed from the community value list (the market), not
  // the personal board, since these are the shared market ranks.
  const { overallRank, positionRank } = useMemo(() => {
    const overall = new Map<string, number>();
    const posRank = new Map<string, number>();
    const posCount = new Map<string, number>();
    if (!players || !valueMap) return { overallRank: overall, positionRank: posRank };
    const ranked = [...players]
      .filter((p) => valueMap.has(p.player_id))
      .sort((a, b) => (valueMap.get(b.player_id) ?? 0) - (valueMap.get(a.player_id) ?? 0));
    ranked.forEach((p, i) => {
      overall.set(p.player_id, i + 1);
      const n = (posCount.get(p.position) ?? 0) + 1;
      posCount.set(p.position, n);
      posRank.set(p.player_id, n);
    });
    return { overallRank: overall, positionRank: posRank };
  }, [players, valueMap]);

  // The matchup pool, ORDERED by relevance to this user. Signed-in users with a
  // real board get their OWN ranking order (catered — most matchups land on
  // assets they care about); everyone else falls back to community value. Picks
  // are mixed in by value alongside players, so matchups can be player-vs-pick.
  const pool = useMemo(() => {
    if (!players || !valueMap) return [];
    // Personal-board order when we have a materialized board with real opinions
    // (the board already contains pick rows once seeded, so picks come along).
    const boardOrder =
      myBoard && myBoard.some((r) => r.moved)
        ? myBoard
            .map((r) => byId.get(r.player_id))
            .filter((p): p is Player => !!p && isVisiblePosition(p.position, showIdp) && valueMap.has(p.player_id))
        : null;
    if (boardOrder && boardOrder.length >= 2) return boardOrder;
    // Fallback: community value order across players + picks.
    return [...players, ...pickAssets]
      .filter((p) => isVisiblePosition(p.position, showIdp) && valueMap.has(p.player_id))
      .sort((a, b) => (valueMap.get(b.player_id) ?? 0) - (valueMap.get(a.player_id) ?? 0));
  }, [players, pickAssets, valueMap, showIdp, myBoard, byId]);

  // Pick an anchor, then a nearby-in-ranking opponent (a genuine coin-flip
  // teaches the model more than a blowout). Seeding: draw from the top stars.
  // Otherwise: MOSTLY anchor in the user's relevant tier (top ~350), but
  // ~20% of the time reach into the long tail so lower-ranked players keep
  // getting refined and the board never goes stale at the bottom.
  const nextPair = useCallback(() => {
    if (pool.length < 2) return;
    let activePool = pool;
    let anchorMax = pool.length;
    if (seeding) {
      activePool = pool.slice(0, SEED_POOL);
      anchorMax = activePool.length;
    } else if (pool.length > CATER_TOP_N) {
      // Confine the ANCHOR to the top tier most of the time; the opponent window
      // can still spill just past the boundary, keeping edges from being islands.
      anchorMax = Math.random() < CATER_SHARE ? CATER_TOP_N : pool.length;
    }
    const i = Math.floor(Math.random() * anchorMax);
    const window = seeding ? 6 : 12;
    const lo = Math.max(0, i - window);
    const hi = Math.min(activePool.length - 1, i + window);
    let j = lo + Math.floor(Math.random() * (hi - lo + 1));
    if (j === i) j = j === hi ? Math.max(lo, i - 1) : j + 1;
    setPair([activePool[i], activePool[j]]);
  }, [pool, seeding]);

  useEffect(() => { if (pool.length && !pair) nextPair(); }, [pool, pair, nextPair]);

  // The board-size query resolves after the first pair is drawn; if the user
  // turns out to be seeding, swap the current matchup for a star one.
  useEffect(() => {
    if (seeding) nextPair();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seeding]);

  // Enriched context for the two assets on screen — powers the trend arrow on
  // the cards and the compare panel below (age, injury, value sparkline).
  const { data: pairDetails } = usePairDetails(pair?.[0].player_id, pair?.[1].player_id);

  // Build a compare-side (card + panel context) for a player in the current pair.
  const compareSide = useCallback(
    (p: Player, detail: AssetDetail | undefined): CompareSide => ({
      player: p,
      value: valueMap?.get(p.player_id) ?? null,
      overallRank: overallRank.get(p.player_id) ?? null,
      positionRank: positionRank.get(p.player_id) ?? null,
      detail,
    }),
    [valueMap, overallRank, positionRank]
  );

  const vote = async (winner: Player, loser: Player) => {
    if (pending) return;
    setPending(true);
    setFlash(winner.full_name);
    try {
      await recordPairwiseVote({ winnerId: winner.player_id, loserId: loser.player_id });
      setVotes((v) => v + 1);
    } catch (e) {
      // Surface the server's rate-limit message ("slow down…") when present.
      setFlash(e instanceof Error && e.message ? e.message : 'Could not save — try again');
    } finally {
      setTimeout(() => { setFlash(null); setPending(false); nextPair(); }, 260);
    }
  };

  return (
    <div>
      {/* Personal-board hook. While seeding, it's a progress meter — rank the
          stars first so the first share already looks like a rankings list. */}
      {user && username ? (
        seeding ? (
          <div className="mb-4 px-3.5 py-3 rounded-xl border border-accent-500/25 bg-accent-500/[0.06]">
            <div className="flex items-center gap-2 text-[12.5px] text-[#c4c4cd]">
              <Sparkles className="h-4 w-4 text-accent-400 shrink-0" />
              <span>
                <span className="font-semibold text-white">Make the board yours</span> — your{' '}
                <Link to={`/u/${username}`} className="text-accent-400 hover:text-accent-300 font-medium">rankings</Link>{' '}
                start as the crowd's; ranking the stars sets your takes apart.
              </span>
              <span className="ml-auto shrink-0 font-display font-bold text-accent-400 tabular-nums">
                {Math.min(totalVotes, SEED_TARGET)} / {SEED_TARGET}
              </span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-[#1b1b22] overflow-hidden">
              <div
                className="h-full bg-accent-500 rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, (totalVotes / SEED_TARGET) * 100)}%` }}
              />
            </div>
          </div>
        ) : (
          <Link
            to={`/u/${username}`}
            className="flex items-center gap-2 mb-4 px-3.5 py-2.5 rounded-xl border border-[#22222b] bg-[#141419] text-[12.5px] text-[#9c9ca7] hover:border-accent-500/40 hover:text-white transition-colors"
          >
            <UserRound className="h-4 w-4 text-accent-400 shrink-0" />
            Your votes are building <span className="font-semibold text-white">your rankings board</span> — view it anytime.
          </Link>
        )
      ) : !user ? (
        <button
          onClick={() => navigate('/welcome')}
          className="flex w-full items-center gap-2 mb-4 px-3.5 py-2.5 rounded-xl border border-[#22222b] bg-[#141419] text-[12.5px] text-[#9c9ca7] hover:border-accent-500/40 hover:text-white transition-colors text-left"
        >
          <UserRound className="h-4 w-4 text-accent-400 shrink-0" />
          <span>
            <span className="font-semibold text-white">Create an account</span> and every vote builds your own
            shareable player rankings.
          </span>
        </button>
      ) : null}

      <div className="flex items-center justify-between text-[13px] text-muted mb-4">
        <span>{votes} {votes === 1 ? 'vote' : 'votes'} this session</span>
        <button
          onClick={nextPair}
          disabled={pending}
          className="text-accent-500 hover:text-accent-400 disabled:opacity-40"
        >
          Skip →
        </button>
      </div>

      {!pair ? (
        <div className="text-center text-muted py-20 text-[14px]">Loading matchup…</div>
      ) : (
        <PlayerVersus
          a={compareSide(pair[0], pairDetails?.a)}
          b={compareSide(pair[1], pairDetails?.b)}
          variant="vote"
          disabled={pending}
          pickedIndex={flash === pair[0].full_name ? 0 : flash === pair[1].full_name ? 1 : null}
          onPick={(i) => (i === 0 ? vote(pair[0], pair[1]) : vote(pair[1], pair[0]))}
        />
      )}

      <p className="mt-8 text-center text-[12px] text-muted leading-relaxed max-w-md mx-auto">
        Values come from the community — real trades, trade-calculator checks, and
        votes like these — not from any outside site.
      </p>
    </div>
  );
}
