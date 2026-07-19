import { useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { UserRound, Share2, Check, Swords, TrendingUp, ChevronLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { usePlayerMap } from '../hooks/useLeagueData';
import { usePlayerValuesList } from '../hooks/queries';
import { PlayerRow } from '../components/PlayerRow';
import { FilterPills } from '../components/FilterBar';

// ── Public profile: /u/<username> ─────────────────────────────────
// The shareable face of an account: a COMPLETE player-rankings board from day
// one. Everyone starts at the community rankings (no player is unranked);
// each pairwise vote nudges the user's copy away from the crowd — favorites
// drift up, fades drift down. What makes a board interesting is the ▲/▼
// disagreements with the community, so moved players carry a delta chip.
// Ratings come from user_player_ratings (DB trigger, Elo around 1500 = "no
// opinion"); the board value is community value + deviation × ELO_SCALE.

const POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE'] as const;

// One vote moves a player ±16 Elo (K=32 from even); ×8 ≈ ±128 board points —
// enough to hop a few spots among the stars, minor further down. Repeated
// votes compound.
const ELO_SCALE = 8;

interface BoardRow {
  player_id: string;
  rating: number;
  wins: number;
  losses: number;
}

export default function Profile() {
  const { username = '' } = useParams<{ username: string }>();
  const { user } = useAuth();
  const { data: playersMap } = usePlayerMap();
  const { data: communityValues } = usePlayerValuesList();
  const [pos, setPos] = useState<(typeof POSITIONS)[number]>('ALL');
  const [copied, setCopied] = useState(false);

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['profile', username.toLowerCase()],
    enabled: !!username,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('user_id, username, avatar_url, created_at')
        .ilike('username', username)
        .maybeSingle();
      return data;
    },
  });

  const { data: board, isLoading: boardLoading } = useQuery({
    queryKey: ['user-board', profile?.user_id],
    enabled: !!profile,
    refetchInterval: 30_000, // votes land continuously; keep shared views fresh
    queryFn: async (): Promise<BoardRow[]> => {
      const { data } = await supabase
        .from('user_player_ratings')
        .select('player_id, rating, wins, losses')
        .eq('user_id', profile!.user_id)
        .order('rating', { ascending: false })
        .limit(500);
      return (data ?? []) as BoardRow[];
    },
  });

  // Blend: community baseline + the user's Elo deviation. Every valued player
  // appears (complete board from day one); voted players shift and carry a
  // rank delta vs the pure community order.
  const rows = useMemo(() => {
    if (!playersMap || !communityValues) return [];
    const personal = new Map((board ?? []).map((r) => [r.player_id, r]));

    const all = [...communityValues.entries()]
      .map(([playerId, communityValue]) => {
        const mine = personal.get(playerId);
        const deviation = mine ? (mine.rating - 1500) * ELO_SCALE : 0;
        return {
          player_id: playerId,
          player: playersMap.get(playerId),
          communityValue,
          blended: communityValue + deviation,
          moved: !!mine && mine.rating !== 1500,
          wins: mine?.wins ?? 0,
          losses: mine?.losses ?? 0,
        };
      })
      .filter((r) => !!r.player);

    // Rank deltas compare like-for-like within the SAME position filter.
    const scoped = all.filter((r) => pos === 'ALL' || r.player!.position === pos);
    const communityOrder = [...scoped].sort((a, b) => b.communityValue - a.communityValue);
    const communityRank = new Map(communityOrder.map((r, i) => [r.player_id, i + 1]));

    return scoped
      .sort((a, b) => b.blended - a.blended)
      .map((r, i) => ({
        ...r,
        rank: i + 1,
        delta: (communityRank.get(r.player_id) ?? i + 1) - (i + 1), // + = above crowd
      }));
  }, [board, playersMap, communityValues, pos]);

  const totalVotes = useMemo(
    () => (board ?? []).reduce((sum, r) => sum + r.wins + r.losses, 0) / 2,
    [board]
  );
  // "Hot takes": players this user has moved off the community consensus.
  const movedCount = useMemo(
    () => (board ?? []).filter((r) => r.rating !== 1500).length,
    [board]
  );

  const isMe = !!user && user.id === profile?.user_id;

  const share = async () => {
    const url = `${window.location.origin}/u/${profile?.username}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `${profile?.username}'s player rankings`, url });
        return;
      }
    } catch { /* fall through to clipboard */ }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  if (profileLoading) {
    return (
      <div className="min-h-dvh p-4 sm:p-6 lg:p-8 max-w-2xl mx-auto space-y-4">
        <div className="skeleton h-28 w-full rounded-2xl" />
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-12 w-full rounded-xl" />)}
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-dvh p-4 sm:p-6 lg:p-8 max-w-2xl mx-auto">
        <div className="rounded-2xl border border-[#22222b] bg-[#141419] p-10 text-center">
          <UserRound className="h-8 w-8 text-[#3a3a44] mx-auto mb-3" />
          <p className="text-[15px] font-semibold text-white">No one here by that name</p>
          <p className="text-[13px] text-[#75757f] mt-1">
            There's no profile at <span className="text-[#c4c4cd]">/u/{username}</span>.
          </p>
          <Link to="/" className="inline-flex items-center gap-1.5 mt-4 text-[13px] text-accent-400 hover:text-accent-300 font-medium transition-colors">
            <ChevronLeft className="h-4 w-4" /> Back home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh">
      <div className="p-4 sm:p-6 lg:p-8 max-w-2xl mx-auto space-y-4">
        {/* ── Identity card ── */}
        <section className="relative overflow-hidden rounded-2xl border border-[#22222b] bg-gradient-to-br from-[#16161c] via-[#141419] to-[#111116]">
          <div className="pointer-events-none absolute -top-16 -right-10 h-40 w-40 rounded-full bg-accent-500/10 blur-3xl" />
          <div className="relative flex items-center gap-4 p-4 sm:p-5">
            <div className="w-14 h-14 rounded-2xl overflow-hidden bg-[#22222b] shrink-0 ring-1 ring-inset ring-white/10 flex items-center justify-center">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <UserRound className="h-6 w-6 text-[#60606a]" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold text-accent-500 tracking-[0.18em] uppercase">Player rankings</p>
              <h1 className="font-display text-xl font-bold text-white tracking-tight truncate">{profile.username}</h1>
            </div>
            <button
              onClick={share}
              className="shrink-0 flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-accent-500 text-[#06110a] text-[13px] font-semibold hover:bg-accent-400 transition-colors"
            >
              {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
              {copied ? 'Copied!' : 'Share'}
            </button>
          </div>
          {/* Stat strip */}
          <div className="relative grid grid-cols-2 border-t border-[#1b1b22] divide-x divide-[#1b1b22]">
            <div className="px-4 sm:px-5 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#75757f] flex items-center gap-1"><Swords className="h-3 w-3" /> Votes cast</p>
              <p className="font-display text-[15px] font-bold text-white tabular-nums mt-0.5">{Math.round(totalVotes).toLocaleString()}</p>
            </div>
            <div className="px-4 sm:px-5 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#75757f] flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Players moved</p>
              <p className="font-display text-[15px] font-bold text-white tabular-nums mt-0.5">{movedCount.toLocaleString()}</p>
            </div>
          </div>
        </section>

        {/* ── Board ── */}
        <section className="rounded-2xl border border-[#22222b] bg-[#141419] overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 border-b border-[#1b1b22]">
            <div>
              <p className="text-[11px] font-bold text-accent-500 tracking-[0.18em] uppercase">The board</p>
              <p className="text-[11px] text-[#75757f] mt-0.5">
                Community rankings, reshaped by {isMe ? 'your' : `${profile.username}'s`} votes — ▲▼ marks the disagreements.
              </p>
            </div>
            <FilterPills
              options={POSITIONS.map((p) => ({ value: p, label: p === 'ALL' ? 'All' : p }))}
              selected={pos}
              onChange={(v) => setPos(v as (typeof POSITIONS)[number])}
            />
          </div>

          {boardLoading || rows.length === 0 ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton h-11 w-full rounded-lg" />)}
            </div>
          ) : (
            <div className="divide-y divide-[#17171d]">
              {rows.slice(0, 100).map((r) => (
                <PlayerRow
                  key={r.player_id}
                  playerId={r.player_id}
                  rank={r.rank}
                  name={r.player!.full_name}
                  position={r.player!.position}
                  team={r.player!.team}
                  value={Math.round(r.blended)}
                  meta={
                    r.moved ? (
                      <span className={r.delta > 0 ? 'text-accent-400 font-semibold' : r.delta < 0 ? 'text-red-400 font-semibold' : 'text-[#75757f]'}>
                        {r.delta > 0 ? `▲${r.delta} vs crowd` : r.delta < 0 ? `▼${Math.abs(r.delta)} vs crowd` : `${r.wins}-${r.losses}`}
                      </span>
                    ) : undefined
                  }
                  size="sm"
                />
              ))}
            </div>
          )}
        </section>

        {/* Owner nudge: an untouched board is just the community's — make it yours */}
        {isMe && (
          <Link
            to="/value-vote"
            className="flex items-center justify-center gap-2 h-11 rounded-xl border border-accent-500/25 bg-accent-500/[0.06] text-[14px] font-semibold text-accent-400 hover:bg-accent-500/[0.1] transition-colors"
          >
            <Swords className="h-4 w-4" />
            {movedCount === 0 ? 'This is the crowd’s board — start voting to make it yours' : 'Keep ranking — every vote sharpens your board'}
          </Link>
        )}
      </div>
    </div>
  );
}
