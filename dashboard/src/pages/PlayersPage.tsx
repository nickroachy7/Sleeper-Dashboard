import { useEffect, useMemo, useState, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, Layers } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useUrlState } from '../hooks/useUrlState';
import { TabBar } from '../components/TabBar';
import { VALUE_SOURCE } from '../lib/value-source';
import { Pagination } from '../components/Pagination';
import { FilterBar, SearchInput, FilterPills, SortSelect } from '../components/FilterBar';
import { MetaText, FilterSheet, FilterSheetGroup } from '../components/ui';
import { PlayerRow } from '../components/PlayerRow';
import { LeaguePicker } from '../components/LeaguePicker';
import { IdpToggle } from '../components/IdpToggle';
import { useValueMovers } from '../hooks/detail';
import { useLeagueRoster } from '../hooks/useLeagueRoster';
import { useActiveLeague } from '../lib/active-league';
import { useShowIdp } from '../lib/idp-store';
import { isIdp, matchesPositionFilter, IDP_FILTER_GROUPS } from '../lib/positions';

// ── Player Values Types ──────────────────────────────────────────

interface PlayerValueDetailed {
  id: string;
  player_id: string;
  value: number;
  rank: number | null;
  position_rank: number | null;
  tier: number | null;
  trend: number | null;
  superflex: boolean | null;
  fetched_at: string | null;
  player: {
    full_name: string | null;
    position: string | null;
    team: string | null;
    age: number | null;
    injury_status: string | null;
  };
}

interface PickValueDetailed {
  id: string;
  pick_type: string;
  pick_year: string;
  pick_round: number;
  pick_tier: string | null;
  value: number;
  rank: number | null;
  superflex: boolean | null;
  fetched_at: string | null;
}

interface UnifiedValue {
  id: string;
  playerId: string | null;
  type: 'player' | 'pick';
  name: string | null;
  position: string | null;
  team: string | null;
  age: number | null;
  value: number;
  rank: number | null;
  positionRank: number | null;
  tier: number | null;
  trend: number | null;
  injuryStatus: string | null;
  pickTier: string | null;
  /** Pick identity (picks only) — for round/year filtering. */
  pickYear: string | null;
  pickRound: number | null;
  fetchedAt: string | null;
  /** 30-day community-value change (players only); null when unknown/flat. */
  delta: number | null;
}

async function fetchPlayerValues(): Promise<PlayerValueDetailed[]> {
  const { data, error } = await supabase
    .from('player_values')
    .select(`
      id, player_id, value, rank, position_rank, tier, trend, superflex, fetched_at,
      player:players(full_name, position, team, age, injury_status)
    `)
    .eq('source', VALUE_SOURCE)
    .order('rank', { ascending: true });

  if (error) throw error;

  return (data || []).map(pv => {
    const player = Array.isArray(pv.player) ? pv.player[0] : pv.player;
    return { ...pv, player: player as PlayerValueDetailed['player'] };
  });
}

async function fetchPickValues(): Promise<PickValueDetailed[]> {
  const { data, error } = await supabase
    .from('pick_values')
    .select('*')
    .eq('source', VALUE_SOURCE)
    .order('value', { ascending: false });

  if (error) throw error;
  return data || [];
}

type SortField = 'rank' | 'value' | 'name' | 'rising' | 'falling';
type SortDirection = 'asc' | 'desc';
type TabType = 'players' | 'picks';

const ITEMS_PER_PAGE = 50;
const MOVER_WINDOW_DAYS = 30;
// Below this the 30d change is day-to-day noise — matches BiggestMovers.
const MOVER_MIN_DELTA = 100;

const tierDescriptions: Record<number, string> = {
  1: 'Elite Dynasty Assets',
  2: 'Blue-Chip Starters',
  3: 'Solid Contributors',
  4: 'Depth & Upside',
  5: 'Roster Filler',
};

const tierAccents: Record<number, string> = {
  1: '#ffd700',
  2: '#c0c0c0',
  3: '#cd7f32',
  4: '#75757f',
  5: '#4c4c56',
};

// ── Players / Picks Tab Component ────────────────────────────────
// `kind` decides which list this renders: 'player' rankings (with position
// filters) or draft-'pick' rankings. Picks are no longer interleaved into the
// player list — they're their own tab.

function ValuesTab({ kind, leagueFilterId, leagues, onLeagueFilterChange }: {
  kind: 'player' | 'pick';
  leagueFilterId?: string | null;
  leagues?: { rootLeagueId: string; name: string; season: string }[];
  onLeagueFilterChange?: (id: string | null) => void;
}) {
  const { get, setMany } = useUrlState();
  const showIdp = useShowIdp();
  const searchQuery = get('q');
  // A stale IDP position pill (e.g. pos=LB) shouldn't strand the list on an
  // empty view once IDP is toggled back off — fall back to "All" in that case.
  const rawPositionFilter = get('pos', 'ALL');
  const positionFilter =
    !showIdp && IDP_FILTER_GROUPS.some((g) => g.value === rawPositionFilter) ? 'ALL' : rawPositionFilter;
  const sortField = get('sf', 'rank') as SortField;
  const sortDirection = get('sd', 'asc') as SortDirection;
  const currentPage = Number(get('page', '1')) || 1;
  // Pick-tab filters (round + draft year), URL-driven like the position filter.
  const roundFilter = get('round', 'ALL');
  const yearFilter = get('year', 'ALL');

  // When a league is picked (Players tab only), keep only players rostered in
  // it — but on the GLOBAL value scale, so ranks read as "where my league's
  // players sit in the community" rather than a renumbered 1..N board.
  const { data: rosterSet } = useLeagueRoster(kind === 'player' ? leagueFilterId ?? null : null);

  const { data: playerValues, isLoading: playersLoading, error: playersError } = useQuery({
    queryKey: ['playerValues', 'detailed'],
    queryFn: fetchPlayerValues
  });

  const { data: pickValues, isLoading: picksLoading, error: picksError } = useQuery({
    queryKey: ['pickValues'],
    queryFn: fetchPickValues
  });

  // 30d value movement — the same window the old Rising/Falling sections used.
  // Only needed for the player list, where it also drives the sort modes.
  const { data: moverValues } = useValueMovers(MOVER_WINDOW_DAYS);
  const isMoverSort = sortField === 'rising' || sortField === 'falling';

  const deltaById = useMemo(() => {
    const map = new Map<string, number>();
    if (!moverValues) return map;
    for (const [pid, cur] of moverValues.current) {
      const past = moverValues.past.get(pid);
      if (!cur || !past) continue;
      map.set(pid, cur - past);
    }
    return map;
  }, [moverValues]);

  const isLoading = playersLoading || picksLoading;
  const error = playersError || picksError;

  const unifiedValues = useMemo<UnifiedValue[]>(() => {
    const combined: UnifiedValue[] = [];
    if (kind === 'player' && playerValues) {
      for (const pv of playerValues) {
        if (!pv.player) continue;
        // Default-off IDP: drop defensive players from the board entirely when
        // the preference is off, so ranks/tiers/counts match the offense-only
        // view users expect. When on, they interleave on their own value curve.
        if (!showIdp && isIdp(pv.player.position)) continue;
        combined.push({
          id: pv.id, playerId: pv.player_id, type: 'player',
          name: pv.player.full_name, position: pv.player.position,
          team: pv.player.team, age: pv.player.age, value: pv.value,
          rank: pv.rank, positionRank: pv.position_rank, tier: pv.tier,
          trend: pv.trend, injuryStatus: pv.player.injury_status,
          pickTier: null, pickYear: null, pickRound: null, fetchedAt: pv.fetched_at,
          delta: deltaById.get(pv.player_id) ?? null,
        });
      }
    }
    if (kind === 'pick' && pickValues) {
      for (const pick of pickValues) {
        combined.push({
          id: pick.id, playerId: null, type: 'pick',
          name: pick.pick_type, position: 'PICK', team: null, age: null,
          value: pick.value, rank: pick.rank, positionRank: null,
          tier: null, trend: null, injuryStatus: null,
          pickTier: pick.pick_tier, pickYear: pick.pick_year, pickRound: pick.pick_round,
          fetchedAt: pick.fetched_at,
          delta: null,
        });
      }
    }
    return combined;
  }, [kind, playerValues, pickValues, deltaById, showIdp]);

  // Each player's true GLOBAL rank — their position in the full list ordered
  // exactly as the default "All" view (by stored rank, nulls last). Computed
  // over everything so a league-filtered view shows the SAME number the player
  // would carry in the global list, not a renumbered 1..N.
  const globalRankById = useMemo(() => {
    const map = new Map<string, number>();
    [...unifiedValues]
      .sort((a, b) => (a.rank || 99999) - (b.rank || 99999))
      .forEach((item, i) => { if (item.playerId) map.set(item.playerId, i + 1); });
    return map;
  }, [unifiedValues]);

  // Distinct draft years present in the pick data, ascending — for the Picks
  // filter sheet's Year options.
  const pickYears = useMemo(() => {
    if (kind !== 'pick' || !pickValues) return [];
    return [...new Set(pickValues.map((p) => p.pick_year))].sort();
  }, [kind, pickValues]);

  const leagueFiltered = kind === 'player' && !!leagueFilterId && !!rosterSet;

  const filteredAndSorted = useMemo(() => {
    let filtered = [...unifiedValues];
    if (leagueFiltered) {
      filtered = filtered.filter((item) => item.playerId && rosterSet!.has(item.playerId));
    }
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(item =>
        item.name?.toLowerCase().includes(query) ||
        item.team?.toLowerCase().includes(query) ||
        item.position?.toLowerCase().includes(query)
      );
    }
    if (kind === 'player' && positionFilter !== 'ALL') {
      filtered = filtered.filter(item => matchesPositionFilter(item.position, positionFilter));
    }
    if (kind === 'pick' && roundFilter !== 'ALL') {
      filtered = filtered.filter(item => String(item.pickRound) === roundFilter);
    }
    if (kind === 'pick' && yearFilter !== 'ALL') {
      filtered = filtered.filter(item => item.pickYear === yearFilter);
    }
    // Rising/Falling: keep only players that meaningfully moved the right way,
    // then order by size of the move. These modes have a fixed direction, so
    // sortDirection doesn't apply.
    if (sortField === 'rising') {
      return filtered
        .filter((i) => (i.delta ?? 0) >= MOVER_MIN_DELTA)
        .sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0));
    }
    if (sortField === 'falling') {
      return filtered
        .filter((i) => (i.delta ?? 0) <= -MOVER_MIN_DELTA)
        .sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0));
    }
    filtered.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'rank': comparison = (a.rank || 999) - (b.rank || 999); break;
        case 'value': comparison = (b.value || 0) - (a.value || 0); break;
        case 'name': comparison = (a.name || '').localeCompare(b.name || ''); break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
    return filtered;
  }, [unifiedValues, kind, searchQuery, positionFilter, roundFilter, yearFilter, sortField, sortDirection, leagueFiltered, rosterSet]);

  const totalPages = Math.ceil(filteredAndSorted.length / ITEMS_PER_PAGE);
  const paginatedValues = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredAndSorted.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredAndSorted, currentPage]);

  const handleSearchChange = (value: string) => setMany({ q: value || null, page: null });
  const handlePositionFilterChange = (value: string) => setMany({ pos: value === 'ALL' ? null : value, page: null });

  const lastUpdated = unifiedValues[0]?.fetchedAt;

  if (isLoading) {
    return (
      <div className="space-y-3 mt-4">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-2 py-3">
            <div className="skeleton w-8 h-4" />
            <div className="skeleton w-8 h-8 rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="skeleton w-40 h-4" />
              <div className="skeleton w-24 h-3" />
            </div>
            <div className="skeleton w-16 h-5" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-5 text-red-400 text-sm mt-4">
        Error loading values: {error instanceof Error ? error.message : 'Unknown error'}
      </div>
    );
  }

  return (
    <>
      <FilterBar
        sticky
        search={
          <SearchInput
            value={searchQuery}
            onChange={handleSearchChange}
            placeholder={kind === 'pick' ? 'Search picks…' : 'Search players…'}
          />
        }
        sort={
          <SortSelect
            compact
            value={isMoverSort ? sortField : `${sortField}-${sortDirection}`}
            onChange={(val) => {
              // Rising/Falling are directionless mover sorts; the rest are field-dir pairs.
              if (val === 'rising' || val === 'falling') {
                setMany({ sf: val, sd: null, page: null });
                return;
              }
              const [field, dir] = val.split('-') as [SortField, SortDirection];
              setMany({
                sf: field === 'rank' ? null : field,
                sd: dir === 'asc' ? null : dir,
                page: null,
              });
            }}
            options={[
              { value: 'rank-asc', label: 'Rank (High → Low)' },
              { value: 'rank-desc', label: 'Rank (Low → High)' },
              { value: 'value-desc', label: 'Value (High → Low)' },
              { value: 'value-asc', label: 'Value (Low → High)' },
              { value: 'name-asc', label: 'Name (A → Z)' },
              { value: 'name-desc', label: 'Name (Z → A)' },
              // Movement sorts — player list only (picks have no value history).
              ...(kind === 'player' ? [
                { value: 'rising', label: `Rising (${MOVER_WINDOW_DAYS}d) ▲` },
                { value: 'falling', label: `Falling (${MOVER_WINDOW_DAYS}d) ▼` },
              ] : []),
            ]}
          />
        }
        trailing={kind === 'player' ? (
          <FilterSheet activeCount={(positionFilter !== 'ALL' ? 1 : 0) + (leagueFilterId ? 1 : 0) + (showIdp ? 1 : 0)}>
            <FilterSheetGroup label="Position">
              <FilterPills
                options={[
                  { value: 'ALL', label: 'All' },
                  { value: 'QB', label: 'QB' },
                  { value: 'RB', label: 'RB' },
                  { value: 'WR', label: 'WR' },
                  { value: 'TE', label: 'TE' },
                  ...(showIdp ? IDP_FILTER_GROUPS.map(({ value, label }) => ({ value, label })) : []),
                ]}
                selected={positionFilter}
                onChange={handlePositionFilterChange}
              />
            </FilterSheetGroup>

            {leagues && leagues.length > 0 && onLeagueFilterChange && (
              <FilterSheetGroup label="League">
                <LeaguePicker
                  leagues={leagues}
                  selected={leagueFilterId ?? null}
                  onSelect={onLeagueFilterChange}
                  allLabel="All leagues"
                />
              </FilterSheetGroup>
            )}

            <FilterSheetGroup label="Defense">
              <IdpToggle />
            </FilterSheetGroup>
          </FilterSheet>
        ) : kind === 'pick' ? (
          <FilterSheet activeCount={(roundFilter !== 'ALL' ? 1 : 0) + (yearFilter !== 'ALL' ? 1 : 0)}>
            <FilterSheetGroup label="Round">
              <FilterPills
                options={[
                  { value: 'ALL', label: 'All' },
                  { value: '1', label: '1st' },
                  { value: '2', label: '2nd' },
                  { value: '3', label: '3rd' },
                  { value: '4', label: '4th' },
                ]}
                selected={roundFilter}
                onChange={(v) => setMany({ round: v === 'ALL' ? null : v, page: null })}
              />
            </FilterSheetGroup>
            {pickYears.length > 0 && (
              <FilterSheetGroup label="Year">
                <FilterPills
                  options={[{ value: 'ALL', label: 'All' }, ...pickYears.map((y) => ({ value: y, label: y }))]}
                  selected={yearFilter}
                  onChange={(v) => setMany({ year: v === 'ALL' ? null : v, page: null })}
                />
              </FilterSheetGroup>
            )}
          </FilterSheet>
        ) : undefined}
      />

      <div className="bg-surface rounded-2xl overflow-hidden border border-line">
        {paginatedValues.length === 0 && (
          <p className="px-4 py-10 text-center text-[13px] text-faint">
            {isMoverSort
              ? `No ${sortField === 'rising' ? 'risers' : 'fallers'} in the last ${MOVER_WINDOW_DAYS} days${positionFilter !== 'ALL' ? ` at ${positionFilter}` : ''}.`
              : 'No players match your filters.'}
          </p>
        )}
        {paginatedValues.map((item, idx) => {
          const prevItem = idx > 0 ? paginatedValues[idx - 1] : null;
          // Tier headers only make sense in the unfiltered, rank-sorted global
          // view — hide them once a league filter renumbers the set.
          const showTierHeader = sortField === 'rank' && !leagueFiltered &&
            item.tier &&
            (!prevItem || prevItem.tier !== item.tier);

          // League-filtered: show the player's true GLOBAL rank (their place in
          // the community) — the whole point of the comparison. Otherwise the
          // row's position in the list is the rank.
          const globalRank = leagueFiltered && item.playerId
            ? globalRankById.get(item.playerId) ?? ((currentPage - 1) * ITEMS_PER_PAGE + idx + 1)
            : (currentPage - 1) * ITEMS_PER_PAGE + idx + 1;

          return (
            <Fragment key={`${item.type}-${item.id}`}>
              {showTierHeader && (
                <div
                  className="px-4 py-2.5 bg-[#17171d] border-b border-line-subtle sticky top-0 z-[5]"
                  style={{ borderLeft: `3px solid ${tierAccents[item.tier!] || '#333'}` }}
                >
                  <span className="text-xs font-bold text-muted">
                    Tier {item.tier}
                  </span>
                  {tierDescriptions[item.tier!] && (
                    <span className="text-xs text-faint ml-2">
                      — {tierDescriptions[item.tier!]}
                    </span>
                  )}
                </div>
              )}
              <PlayerRow
                playerId={item.type === 'player' ? item.playerId : undefined}
                name={item.name || 'Unknown'}
                position={item.position || undefined}
                team={item.team}
                value={item.value}
                delta={isMoverSort && item.delta != null ? item.delta : undefined}
                size="sm"
                divided
                lead={
                  <span className="text-xs font-medium text-[#80808c] w-6 text-right tabular-nums">
                    {globalRank}
                  </span>
                }
                meta={item.pickTier ? (
                  <span className={`px-1 py-0.5 text-[9px] rounded font-bold leading-none ${
                    item.pickTier === 'Early' ? 'bg-emerald-500/20 text-emerald-400' :
                    item.pickTier === 'Mid' ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-red-500/20 text-red-400'
                  }`}>
                    {item.pickTier}
                  </span>
                ) : undefined}
              />
            </Fragment>
          );
        })}
      </div>

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={filteredAndSorted.length}
        itemsPerPage={ITEMS_PER_PAGE}
        onPageChange={(page) => { setMany({ page: page === 1 ? null : String(page) }); window.scrollTo({ top: 0 }); }}
      />

      {/* Data freshness — present but out of the way, at the foot of the list. */}
      {lastUpdated && (
        <MetaText className="mt-4 text-center">
          Updated {new Date(lastUpdated).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at {new Date(lastUpdated).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
        </MetaText>
      )}
    </>
  );
}

// ── Main Page Component ──────────────────────────────────────────

const PLAYERS_TABS = [
  { id: 'players' as const, label: 'Players', icon: TrendingUp },
  { id: 'picks' as const, label: 'Picks', icon: Layers },
];

/** The Ranking section: community-driven (YAP) player + rookie-pick values,
 *  both global. Records (league-scoped) lives on the League page now.
 *  "Rank 'Em" is a contribution action, not a tab. */
export function PlayersPage() {
  const { get, setMany } = useUrlState();
  const rawTab = get('tab', 'players');
  const { leagues } = useActiveLeague();

  // Records moved to the League page; keep old ?tab=records links working.
  const navigate = useNavigate();
  useEffect(() => {
    if (rawTab === 'records') navigate('/league?tab=records', { replace: true });
  }, [rawTab, navigate]);

  const activeTab = (rawTab === 'picks' ? 'picks' : 'players') as TabType;

  // League filter for the Players list: null = "All" (global rankings, the
  // default). Picking a league shows just its rostered players on the global
  // value scale, so you can see where your roster stands in the community.
  // Page-level (not URL) — it's a lens on the list, resets on reload.
  const [leagueFilterId, setLeagueFilterId] = useState<string | null>(null);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-4">
      {/* Tabs (the nav already names the page "Ranking"). The league filter used
          to lead the page in its own row; it now lives inside the Players tab's
          filter sheet (⚙ beside the search box) so the top stays clean. */}
      <TabBar
        tabs={PLAYERS_TABS}
        active={activeTab}
        onChange={(id) => setMany({ tab: id === 'players' ? null : id, page: null, pos: null })}
      />

      <div>
        {activeTab === 'picks' ? <ValuesTab kind="pick" />
          : (
            <ValuesTab
              kind="player"
              leagueFilterId={leagueFilterId}
              leagues={leagues}
              onLeagueFilterChange={(id) => { setLeagueFilterId(id); setMany({ page: null }); }}
            />
          )}
      </div>
    </div>
  );
}
