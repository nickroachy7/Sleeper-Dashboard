import { useMemo } from 'react';
import { useMyTeam } from '../hooks/useMyTeam';
import { useLeagueDirectory } from '../hooks/detail';
import { TeamRow } from './TeamRow';

const num = (v: number | string | null | undefined): number => (v == null ? 0 : Number(v) || 0);

interface RosterRow {
  rosterId: number;
  name: string;
  avatar: string | null;
  owner: string;
  wins: number;
  losses: number;
  ties: number;
}

/** First-run "pick your team" prompt (League → Standings). Renders ONLY when
 *  no team is chosen — once picked, the standings table itself carries the
 *  identity (the visitor's row is highlighted; the row links to the team
 *  page). Corrections live in Settings → My Leagues. */
export function MyTeamPicker() {
  const { setMyTeam, hasChoice } = useMyTeam();
  const { data: directory } = useLeagueDirectory();

  const rosters = useMemo<RosterRow[]>(() => {
    if (!directory) return [];
    return directory.rosters
      .filter((r) => r.league_id === directory.currentLeagueId)
      .map((r) => {
        const owner = directory.users.find((u) => u.user_id === r.owner_id);
        return {
          rosterId: r.roster_id,
          name: directory.teamName(r.roster_id),
          avatar: directory.teamAvatar(r.roster_id),
          owner: owner?.display_name || owner?.username || '',
          wins: num(r.wins), losses: num(r.losses), ties: num(r.ties),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [directory]);

  if (hasChoice || !directory || rosters.length === 0) return null;

  return (
    <section className="rounded-2xl border border-accent-500/25 bg-accent-500/[0.06] overflow-hidden">
      <div className="px-4 sm:px-5 py-3.5 border-b border-[#1b1b22]">
        <p className="text-[11px] font-bold text-accent-500 tracking-[0.18em] uppercase">Your team</p>
        <p className="text-[13px] text-[#c4c4cd] mt-0.5">Pick your team to personalize your dashboard.</p>
      </div>
      <div className="max-h-[52vh] overflow-y-auto p-1.5">
        {rosters.map((r) => (
          <TeamRow
            key={r.rosterId}
            rosterId={r.rosterId}
            name={r.name}
            subtitle={r.owner}
            meta={`${r.wins}-${r.losses}${r.ties ? `-${r.ties}` : ''}`}
            avatarId={r.avatar}
            to={null}
            onClick={() => setMyTeam(r.rosterId)}
            size="sm"
            className="rounded-xl"
          />
        ))}
      </div>
    </section>
  );
}
