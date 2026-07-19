import { useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { Plus, Trash2, Check, Trophy, Radar, Loader2, ChevronDown, UserRound } from 'lucide-react';
import { useLeague } from '../hooks/queries';
import { useActiveLeague } from '../lib/active-league';
import { useMyTeamMap } from '../hooks/useMyTeam';
import { openAddLeague } from '../lib/add-league-modal';
import { listLeagueTeams } from '../lib/add-league';

/**
 * "My Leagues" — manage the set of leagues the visitor has added: switch the
 * active one, remove leagues, add another, and correct "your team" per league.
 * This is deliberately the ONLY place to change a chosen team — the Home card
 * shows it without an edit affordance so a stray tap can't re-personalize the
 * dashboard (see MyTeamCard).
 */
export function MyLeaguesSection() {
  const { data: active } = useLeague();
  const { leagues, activeLeagueId, setActiveLeague, removeLeague } = useActiveLeague();
  const { map: myTeamMap, set: setMyTeamFor } = useMyTeamMap();
  const activeRootId = activeLeagueId ?? active?.league_id ?? null;

  // Which league's inline team picker is expanded.
  const [pickerFor, setPickerFor] = useState<string | null>(null);

  // Team lists per league, live from Sleeper — works for every league in the
  // list (our DB queries are scoped to the active league only) and lets the
  // subtitle name the chosen team, not just its id.
  const teamQueries = useQueries({
    queries: leagues.map((l) => ({
      queryKey: ['league-teams', l.rootLeagueId],
      queryFn: () => listLeagueTeams(l.rootLeagueId),
      staleTime: 1000 * 60 * 10,
      retry: 1,
    })),
  });
  const teamsByLeague = new Map(leagues.map((l, i) => [l.rootLeagueId, teamQueries[i]]));

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Radar className="h-4 w-4 text-[#75757f]" />
          <p className="text-[10px] font-bold text-[#75757f] tracking-[3px] uppercase">My Leagues</p>
        </div>
        <button
          onClick={openAddLeague}
          className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-accent-500 text-[#06110a] text-[12px] font-semibold hover:bg-accent-400 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> Add league
        </button>
      </div>

      {leagues.length === 0 ? (
        <div className="rounded-xl bg-[#141419] border border-[#22222b] p-5 text-center">
          <Trophy className="h-6 w-6 text-[#3a3a44] mx-auto mb-2" />
          <p className="text-[13px] text-[#c4c4cd] font-medium">No leagues added yet</p>
          <p className="text-[12px] text-[#75757f] mt-1">
            Add your Sleeper league to see your own rosters, values, and trades.
          </p>
          <button
            onClick={openAddLeague}
            className="mt-3 inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-accent-500 text-[#06110a] text-[13px] font-semibold hover:bg-accent-400 transition-colors"
          >
            <Plus className="h-4 w-4" /> Add your league
          </button>
        </div>
      ) : (
        <div className="rounded-xl bg-[#141419] border border-[#22222b] divide-y divide-[#1b1b22] overflow-hidden">
          {leagues.map((l) => {
            const isActive = l.rootLeagueId === activeRootId;
            const myRosterId = myTeamMap[l.rootLeagueId] ?? null;
            const pickerOpen = pickerFor === l.rootLeagueId;
            const teamsQuery = teamsByLeague.get(l.rootLeagueId);
            const teams = teamsQuery?.data ?? [];
            const loadingTeams = teamsQuery?.isLoading ?? false;
            const myTeam = teams.find((t) => t.rosterId === myRosterId) ?? null;

            return (
              <div key={l.rootLeagueId}>
                <div className="flex items-center gap-3 px-4 py-3">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${isActive ? 'bg-accent-500' : 'bg-[#3a3a44]'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-white truncate">{l.name}</p>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p className="text-[11px] text-[#75757f] shrink-0">{l.season} Season</p>
                      {/* Your-team subtitle + the (only) change affordance. */}
                      <span className="text-[11px] text-[#3a3a44] shrink-0">·</span>
                      <button
                        onClick={() => setPickerFor(pickerOpen ? null : l.rootLeagueId)}
                        className="flex items-center gap-1 min-w-0 text-[11px] text-[#9c9ca7] hover:text-white transition-colors"
                      >
                        <span className="truncate">
                          {myRosterId != null
                            ? `Your team: ${myTeam?.name ?? '…'}`
                            : 'Your team: not set'}
                        </span>
                        <ChevronDown className={`h-3 w-3 shrink-0 transition-transform ${pickerOpen ? 'rotate-180' : ''}`} />
                      </button>
                    </div>
                  </div>
                  {isActive ? (
                    <span className="text-[11px] text-accent-400 flex items-center gap-1 shrink-0 mr-1">
                      <Check className="h-3.5 w-3.5" /> Active
                    </span>
                  ) : (
                    <button
                      onClick={() => setActiveLeague(l.rootLeagueId)}
                      className="text-[12px] text-[#9c9ca7] hover:text-white px-2.5 py-1 rounded-md hover:bg-[#1b1b22] transition-colors shrink-0"
                    >
                      Switch to
                    </button>
                  )}
                  <button
                    onClick={() => removeLeague(l.rootLeagueId)}
                    aria-label={`Remove ${l.name}`}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-[#60606a] hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {/* Inline team picker */}
                {pickerOpen && (
                  <div className="px-4 pb-3">
                    <div className="rounded-lg border border-[#22222b] bg-[#101015] p-1 max-h-56 overflow-y-auto">
                      {loadingTeams ? (
                        <div className="flex items-center gap-2 px-2 py-2.5 text-[#75757f]">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span className="text-[12px]">Loading teams…</span>
                        </div>
                      ) : teams.length === 0 ? (
                        <p className="px-2 py-2 text-[12px] text-[#75757f]">Couldn't load teams — try again in a moment.</p>
                      ) : (
                        teams.map((t) => {
                          const isMine = myRosterId === t.rosterId;
                          return (
                            <button
                              key={t.rosterId}
                              onClick={() => {
                                setMyTeamFor(l.rootLeagueId, isMine ? null : t.rosterId);
                                setPickerFor(null);
                              }}
                              className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-left transition-colors ${
                                isMine ? 'bg-accent-500/[0.12]' : 'hover:bg-[#1b1b22]'
                              }`}
                            >
                              <div className="w-6 h-6 rounded-md bg-[#22222b] flex items-center justify-center shrink-0 overflow-hidden">
                                {t.avatar ? (
                                  <img src={t.avatar} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <UserRound className="h-3.5 w-3.5 text-[#60606a]" />
                                )}
                              </div>
                              <span className={`flex-1 min-w-0 truncate text-[13px] ${isMine ? 'text-white font-semibold' : 'text-[#9c9ca7]'}`}>
                                {t.name}
                              </span>
                              {isMine && <Check className="h-4 w-4 text-accent-400 shrink-0" />}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
