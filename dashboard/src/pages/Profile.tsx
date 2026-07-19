import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { CSS } from '@dnd-kit/utilities';
import { UserRound, Share2, Check, Swords, TrendingUp, ChevronLeft, ChevronUp, ChevronDown, GripVertical, Pencil, RotateCcw, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { usePlayerMap } from '../hooks/useLeagueData';
import { usePlayerValuesList } from '../hooks/queries';
import { PlayerRow } from '../components/PlayerRow';
import { FilterPills } from '../components/FilterBar';
import { Pagination } from '../components/Pagination';

// ── Public profile: /u/<username> ─────────────────────────────────
// The shareable face of an account: a COMPLETE player-rankings board from day
// one. Everyone starts at the community rankings (no player is unranked);
// each pairwise vote nudges the user's copy away from the crowd — favorites
// drift up, fades drift down. What makes a board interesting is the ▲/▼
// disagreements with the community, so moved players carry a delta chip.
// Ratings come from user_player_ratings (DB trigger, Elo around 1500 = "no
// opinion"); the board value is community value + deviation × ELO_SCALE.
//
// Owners can also edit directly ("Adjust ranks"): drag a row to a new spot,
// ▲▼ nudges swap a player with its neighbor, tapping the rank number sets an
// exact spot, and reset returns a player to the crowd's position. Edits write
// the same rating field votes do (own rows only under RLS), so both signals
// coexist.

const POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE'] as const;
const PAGE_SIZE = 50;

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

// Sortable shell around a board row: whole row is draggable in edit mode,
// with a grip affordance. Kept outside Profile so dnd hooks re-render only
// the rows, not the page.
function DraggableRow({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-stretch ${isDragging ? 'relative z-10 bg-[#1b1b22] shadow-lg shadow-black/40' : ''}`}
    >
      {/* Grip is the only drag surface — inner buttons/inputs stay tappable,
          and touch-none keeps mobile scroll from eating the gesture. */}
      <button
        {...attributes}
        {...listeners}
        className="touch-none shrink-0 px-1.5 flex items-center text-[#4c4c56] hover:text-white cursor-grab active:cursor-grabbing"
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

export default function Profile() {
  const { username = '' } = useParams<{ username: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: playersMap } = usePlayerMap();
  const { data: communityValues } = usePlayerValuesList();
  const [pos, setPos] = useState<(typeof POSITIONS)[number]>('ALL');
  const [copied, setCopied] = useState(false);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(false);
  // Row whose rank number is being typed over (set-exact-rank).
  const [rankDraft, setRankDraft] = useState<{ id: string; value: string } | null>(null);

  useEffect(() => {
    setPage(1);
    setRankDraft(null);
  }, [pos]);

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
        .limit(2000);
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

  // ── Manual adjustments (owner only) ──────────────────────────────
  // All edits reduce to "give this player the rating whose blended value
  // lands at the right spot". Inverse of the blend above:
  //   rating = 1500 + (targetBlended − communityValue) / ELO_SCALE
  // Writes are optimistic: patch the cached board (the blend recomputes
  // instantly), then upsert; on error, refetch to resync.
  const setRating = async (playerId: string, rating: number) => {
    if (!isMe || !profile) return;
    queryClient.setQueryData<BoardRow[]>(['user-board', profile.user_id], (old) => {
      const next = old ? [...old] : [];
      const i = next.findIndex((r) => r.player_id === playerId);
      if (i >= 0) next[i] = { ...next[i], rating };
      else next.push({ player_id: playerId, rating, wins: 0, losses: 0 });
      return next;
    });
    const { error } = await supabase
      .from('user_player_ratings')
      .upsert(
        { user_id: profile.user_id, player_id: playerId, rating },
        { onConflict: 'user_id,player_id' }
      );
    if (error) queryClient.invalidateQueries({ queryKey: ['user-board', profile.user_id] });
  };

  const ratingForBlended = (targetBlended: number, communityValue: number) =>
    1500 + (targetBlended - communityValue) / ELO_SCALE;

  // Swap with the neighbor above (dir −1) or below (dir +1): land 1 board
  // point past its blended value.
  const nudge = (rank: number, dir: -1 | 1) => {
    const me = rows[rank - 1];
    const neighbor = rows[rank - 1 + dir];
    if (!me || !neighbor) return;
    setRating(me.player_id, ratingForBlended(neighbor.blended - dir, me.communityValue));
  };

  // Set an exact rank within the current position scope: midpoint between the
  // new neighbors' blended values (blended is global, so between two QBs is
  // between them on every view).
  const setRank = (playerId: string, targetRank: number) => {
    const me = rows.find((r) => r.player_id === playerId);
    if (!me) return;
    const others = rows.filter((r) => r.player_id !== playerId);
    const clamped = Math.min(Math.max(targetRank, 1), others.length + 1);
    const above = others[clamped - 2];
    const below = others[clamped - 1];
    const targetBlended =
      above && below ? (above.blended + below.blended) / 2
      : below ? below.blended + 100
      : above ? above.blended - 100
      : null;
    if (targetBlended === null) return;
    setRating(playerId, ratingForBlended(targetBlended, me.communityValue));
  };

  const commitRankDraft = () => {
    if (!rankDraft) return;
    const n = parseInt(rankDraft.value, 10);
    if (Number.isFinite(n)) setRank(rankDraft.id, n);
    setRankDraft(null);
  };

  // Drag-to-reorder: dropping on a row means "take its rank". setRank already
  // knows how to land between the new neighbors, so a drop is just a lookup.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const target = rows.find((r) => r.player_id === over.id);
    if (target) setRank(String(active.id), target.rank);
  };

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
                {editing
                  ? 'Tap ▲▼ to nudge, or tap a rank number to type a new spot.'
                  : `Community rankings, reshaped by ${isMe ? 'your' : `${profile.username}'s`} votes — ▲▼ marks the disagreements.`}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isMe && (
                <button
                  onClick={() => { setEditing((e) => !e); setRankDraft(null); }}
                  className={`flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-semibold transition-colors ${
                    editing
                      ? 'bg-accent-500 text-[#06110a] hover:bg-accent-400'
                      : 'border border-[#2a2a34] text-[#c4c4cd] hover:bg-[#1b1b22]'
                  }`}
                >
                  {editing ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                  {editing ? 'Done' : 'Adjust ranks'}
                </button>
              )}
              <FilterPills
                options={POSITIONS.map((p) => ({ value: p, label: p === 'ALL' ? 'All' : p }))}
                selected={pos}
                onChange={(v) => setPos(v as (typeof POSITIONS)[number])}
              />
            </div>
          </div>

          {boardLoading || rows.length === 0 ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton h-11 w-full rounded-lg" />)}
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis]}
              onDragEnd={onDragEnd}
            >
            <SortableContext
              items={rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((r) => r.player_id)}
              strategy={verticalListSortingStrategy}
            >
            <div className="divide-y divide-[#17171d]">
              {rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((r) => {
                const row = (
                <PlayerRow
                  key={r.player_id}
                  playerId={r.player_id}
                  rank={editing ? undefined : r.rank}
                  lead={
                    editing ? (
                      rankDraft?.id === r.player_id ? (
                        <input
                          autoFocus
                          inputMode="numeric"
                          value={rankDraft.value}
                          onChange={(e) => setRankDraft({ id: r.player_id, value: e.target.value.replace(/\D/g, '') })}
                          onBlur={commitRankDraft}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitRankDraft();
                            if (e.key === 'Escape') setRankDraft(null);
                          }}
                          className="w-11 h-7 rounded-md bg-[#1b1b22] border border-accent-500/50 text-center text-[13px] font-bold text-white tabular-nums outline-none"
                        />
                      ) : (
                        <button
                          onClick={() => setRankDraft({ id: r.player_id, value: String(r.rank) })}
                          className="w-11 h-7 rounded-md border border-[#2a2a34] text-[13px] font-bold text-[#c4c4cd] tabular-nums hover:border-accent-500/50 hover:text-white transition-colors"
                          title="Tap to set an exact rank"
                        >
                          {r.rank}
                        </button>
                      )
                    ) : undefined
                  }
                  to={editing ? null : undefined}
                  value={Math.round(r.blended)}
                  name={r.player!.full_name}
                  position={r.player!.position}
                  team={r.player!.team}
                  meta={
                    r.moved ? (
                      <span className={r.delta > 0 ? 'text-accent-400 font-semibold' : r.delta < 0 ? 'text-red-400 font-semibold' : 'text-[#75757f]'}>
                        {r.delta > 0 ? `▲${r.delta} vs crowd` : r.delta < 0 ? `▼${Math.abs(r.delta)} vs crowd` : `${r.wins}-${r.losses}`}
                      </span>
                    ) : undefined
                  }
                  suffix={
                    editing ? (
                      <span className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => nudge(r.rank, -1)}
                          disabled={r.rank === 1}
                          className="p-1.5 rounded-md border border-[#2a2a34] text-[#9c9ca7] hover:text-white hover:bg-[#1b1b22] disabled:opacity-30 transition-colors"
                          aria-label="Move up"
                        >
                          <ChevronUp className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => nudge(r.rank, 1)}
                          disabled={r.rank === rows.length}
                          className="p-1.5 rounded-md border border-[#2a2a34] text-[#9c9ca7] hover:text-white hover:bg-[#1b1b22] disabled:opacity-30 transition-colors"
                          aria-label="Move down"
                        >
                          <ChevronDown className="h-4 w-4" />
                        </button>
                        {r.moved && (
                          <button
                            onClick={() => setRating(r.player_id, 1500)}
                            className="p-1.5 rounded-md border border-[#2a2a34] text-[#75757f] hover:text-white hover:bg-[#1b1b22] transition-colors"
                            aria-label="Reset to community rank"
                            title="Reset to community rank"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </span>
                    ) : undefined
                  }
                  size="sm"
                />
                );
                return editing ? (
                  <DraggableRow key={r.player_id} id={r.player_id}>{row}</DraggableRow>
                ) : (
                  row
                );
              })}
            </div>
            </SortableContext>
            </DndContext>
          )}

          {rows.length > PAGE_SIZE && (
            <div className="px-4 sm:px-5 pb-4">
              <Pagination
                currentPage={page}
                totalPages={Math.ceil(rows.length / PAGE_SIZE)}
                totalItems={rows.length}
                itemsPerPage={PAGE_SIZE}
                onPageChange={(p) => { setPage(p); setRankDraft(null); }}
              />
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
