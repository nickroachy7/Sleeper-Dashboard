import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Sparkles, UserRound } from 'lucide-react';
import { PositionBadge } from '../components/PositionBadge';
import { usePlayers, usePlayerValuesList } from '../hooks/queries';
import { getPlayerImageUrl } from '../lib/trade-shared';
import { recordPairwiseVote } from '../lib/community-events';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import type { Player } from '../types/domain';

const VOTABLE = new Set(['QB', 'RB', 'WR', 'TE']);

// Starter mode: boards begin as a copy of the community rankings; votes create
// the deviations that make them personal. Early votes draw from the top stars
// so the user's first disagreements land on names their friends recognize.
const SEED_TARGET = 15;   // star votes before blending into the full pool
const SEED_POOL = 30;     // draw early matchups from the top N by value

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
  const { data: valueMap } = usePlayerValuesList();
  const { user, username } = useAuth();
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

  // Value-ranked pool of skill players we actually have a value for.
  const pool = useMemo(() => {
    if (!players || !valueMap) return [];
    return players
      .filter((p) => VOTABLE.has(p.position) && valueMap.has(p.player_id))
      .sort((a, b) => (valueMap.get(b.player_id) ?? 0) - (valueMap.get(a.player_id) ?? 0));
  }, [players, valueMap]);

  // Pick a player, then an opponent within a nearby value window. In starter
  // mode both come from the star pool (still value-adjacent — real debates).
  const nextPair = useCallback(() => {
    const activePool = seeding ? pool.slice(0, SEED_POOL) : pool;
    if (activePool.length < 2) return;
    const i = Math.floor(Math.random() * activePool.length);
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
        <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-3 sm:gap-5">
          <VoteCard player={pair[0]} highlighted={flash === pair[0].full_name} disabled={pending}
            onPick={() => vote(pair[0], pair[1])} />
          <div className="flex items-center justify-center text-muted text-[12px] font-medium tracking-widest uppercase">
            or
          </div>
          <VoteCard player={pair[1]} highlighted={flash === pair[1].full_name} disabled={pending}
            onPick={() => vote(pair[1], pair[0])} />
        </div>
      )}

      <p className="mt-8 text-center text-[12px] text-muted leading-relaxed max-w-md mx-auto">
        Values come from the community — real trades, trade-calculator checks, and
        votes like these — not from any outside site.
      </p>
    </div>
  );
}

function VoteCard({
  player, highlighted, disabled, onPick,
}: {
  player: Player; highlighted: boolean; disabled: boolean; onPick: () => void;
}) {
  return (
    <button
      onClick={onPick}
      disabled={disabled}
      className={`group flex flex-col items-center rounded-[12px] border p-5 sm:p-7 transition-all
        ${highlighted
          ? 'border-accent-500 bg-accent-500/10 scale-[0.98]'
          : 'border-[#22222b] bg-[#141419] hover:border-accent-500 hover:bg-[#1b1b22]'}
        disabled:cursor-default`}
    >
      <img
        src={getPlayerImageUrl(player.player_id)}
        alt={player.full_name}
        loading="lazy"
        className="h-24 w-24 sm:h-28 sm:w-28 rounded-full object-cover object-top bg-[#101015] mb-3"
      />
      <span className="text-[15px] font-medium text-center leading-tight mb-2">
        {player.full_name}
      </span>
      <span className="flex items-center gap-1.5 text-muted">
        <PositionBadge position={player.position} />
        {player.team && <span className="text-[12px]">{player.team}</span>}
      </span>
    </button>
  );
}
