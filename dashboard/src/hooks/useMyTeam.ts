import { useCallback, useSyncExternalStore } from 'react';
import { myTeamStore } from '../lib/my-team-store';
import { useActiveLeague } from '../lib/active-league';
import { useLeagueDirectory } from './detail';

export interface MyTeam {
  rosterId: number;
  name: string;
  avatar: string | null;
}

/**
 * The visitor's own team in the active league. There's no auth, so "my team"
 * is a per-league choice persisted in localStorage (see my-team-store). Keyed
 * by the active root league id; roster ids are stable across the season chain.
 *
 * Returns the chosen team resolved against the league directory, whether a
 * choice exists, and a setter. `needsPick` is true when a league is loaded but
 * the visitor hasn't picked their team yet — the cue to prompt them.
 */
export function useMyTeam() {
  const { activeLeagueId } = useActiveLeague();
  const { data: directory } = useLeagueDirectory();

  const map = useSyncExternalStore(myTeamStore.subscribe, myTeamStore.getAll, myTeamStore.getAll);
  const rosterId = activeLeagueId ? map[activeLeagueId] ?? null : null;

  const setMyTeam = useCallback(
    (id: number | null) => {
      if (activeLeagueId) myTeamStore.set(activeLeagueId, id);
    },
    [activeLeagueId]
  );

  const team: MyTeam | null =
    rosterId != null && directory
      ? { rosterId, name: directory.teamName(rosterId), avatar: directory.teamAvatar(rosterId) }
      : null;

  // A league is loaded and has rosters, but no team is chosen yet.
  const rosterCount = directory?.rosters.filter((r) => r.league_id === directory.currentLeagueId).length ?? 0;
  const needsPick = !!activeLeagueId && !!directory && rosterCount > 0 && rosterId == null;

  return { rosterId, team, setMyTeam, needsPick, hasChoice: rosterId != null };
}
