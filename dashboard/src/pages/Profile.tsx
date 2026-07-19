import { useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { UserRound, Share2, Check, Swords, TrendingUp, ChevronLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { usePlayerMap } from '../hooks/useLeagueData';
import { PlayerRow } from '../components/PlayerRow';
import { FilterPills } from '../components/FilterBar';

// ── Public profile: /u/<username> ─────────────────────────────────
// The shareable face of an account: identity + a live leaderboard of the
// user's personal player rankings. Every pairwise vote they cast moves their
// board (user_player_ratings, updated by a DB trigger), so the page is always
// current — vote, refresh, compare with friends. Public by design; there's
// nothing sensitive here.

const POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE'] as const;

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

  const rows = useMemo(() => {
    if (!board || !playersMap) return [];
    return board
      .map((r) => ({ ...r, player: playersMap.get(r.player_id) }))
      .filter((r) => !!r.player)
      .filter((r) => pos === 'ALL' || r.player!.position === pos)
      .map((r, i) => ({ ...r, rank: i + 1 }));
  }, [board, playersMap, pos]);

  const totalVotes = useMemo(
    () => (board ?? []).reduce((sum, r) => sum + r.wins + r.losses, 0) / 2,
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
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#75757f] flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Players ranked</p>
              <p className="font-display text-[15px] font-bold text-white tabular-nums mt-0.5">{(board ?? []).length.toLocaleString()}</p>
            </div>
          </div>
        </section>

        {/* ── Board ── */}
        <section className="rounded-2xl border border-[#22222b] bg-[#141419] overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 border-b border-[#1b1b22]">
            <div>
              <p className="text-[11px] font-bold text-accent-500 tracking-[0.18em] uppercase">The board</p>
              <p className="text-[11px] text-[#75757f] mt-0.5">Built from every "who'd you rather" vote — updates live.</p>
            </div>
            <FilterPills
              options={POSITIONS.map((p) => ({ value: p, label: p === 'ALL' ? 'All' : p }))}
              selected={pos}
              onChange={(v) => setPos(v as (typeof POSITIONS)[number])}
            />
          </div>

          {boardLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton h-11 w-full rounded-lg" />)}
            </div>
          ) : rows.length === 0 ? (
            <div className="px-4 sm:px-5 py-10 text-center">
              <p className="text-[14px] font-medium text-[#c4c4cd]">
                {isMe ? 'Your board is empty' : `${profile.username} hasn't ranked anyone yet`}
              </p>
              <p className="text-[12px] text-[#75757f] mt-1 max-w-xs mx-auto">
                {isMe
                  ? 'Vote on player matchups and your personal rankings build themselves.'
                  : 'Their rankings will appear here once they start voting.'}
              </p>
              {isMe && (
                <Link
                  to="/value-vote"
                  className="inline-flex items-center gap-1.5 mt-4 h-9 px-4 rounded-lg bg-accent-500 text-[#06110a] text-[13px] font-semibold hover:bg-accent-400 transition-colors"
                >
                  <Swords className="h-4 w-4" /> Start ranking
                </Link>
              )}
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
                  value={Math.round(r.rating)}
                  meta={`${r.wins}-${r.losses}`}
                  size="sm"
                />
              ))}
            </div>
          )}
        </section>

        {/* Owner nudge: keep voting to refine the board */}
        {isMe && rows.length > 0 && (
          <Link
            to="/value-vote"
            className="flex items-center justify-center gap-2 h-11 rounded-xl border border-accent-500/25 bg-accent-500/[0.06] text-[14px] font-semibold text-accent-400 hover:bg-accent-500/[0.1] transition-colors"
          >
            <Swords className="h-4 w-4" /> Keep ranking — every vote sharpens your board
          </Link>
        )}
      </div>
    </div>
  );
}
