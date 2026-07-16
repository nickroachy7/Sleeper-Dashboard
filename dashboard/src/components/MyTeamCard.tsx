import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, ChevronRight, Pencil, X } from 'lucide-react';
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

/** One-time (per league) prompt + persistent card for the visitor's own team.
 *  When no team is chosen it's a picker; once chosen it's a compact identity
 *  card leading the Dashboard, with a pencil to re-pick. */
export function MyTeamCard() {
  const { team, setMyTeam, hasChoice } = useMyTeam();
  const { data: directory } = useLeagueDirectory();
  const [picking, setPicking] = useState(false);

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

  if (!directory || rosters.length === 0) return null;

  // ── Picker (no choice yet, or re-picking) ──
  if (!hasChoice || picking) {
    return (
      <section className="rounded-2xl border border-accent-500/25 bg-accent-500/[0.06] overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 border-b border-[#1b1b22]">
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-accent-500 tracking-[0.18em] uppercase">Your team</p>
            <p className="text-[13px] text-[#c4c4cd] mt-0.5">Pick your team to personalize your dashboard.</p>
          </div>
          {picking && (
            <button
              onClick={() => setPicking(false)}
              aria-label="Cancel"
              className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-[#75757f] hover:text-white hover:bg-[#1b1b22] transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
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
              onClick={() => { setMyTeam(r.rosterId); setPicking(false); }}
              size="sm"
              className="rounded-xl"
            />
          ))}
        </div>
      </section>
    );
  }

  if (!team) return null;

  // ── Chosen identity card ──
  return (
    <section className="relative overflow-hidden rounded-2xl border border-[#22222b] bg-gradient-to-br from-[#16161c] via-[#141419] to-[#111116]">
      <div className="pointer-events-none absolute -top-16 -right-10 h-40 w-40 rounded-full bg-accent-500/10 blur-3xl" />
      <div className="relative flex items-center gap-3.5 p-4 sm:p-5">
        <div className="w-14 h-14 rounded-2xl overflow-hidden bg-[#22222b] shrink-0 ring-1 ring-inset ring-white/10 flex items-center justify-center">
          {team.avatar ? (
            <img
              src={team.avatar}
              alt=""
              className="w-full h-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
            />
          ) : (
            <Users className="h-6 w-6 text-[#60606a]" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold text-accent-500 tracking-[0.18em] uppercase">Your team</p>
          <Link to={`/teams/${team.rosterId}`} className="group inline-flex items-center gap-1.5 min-w-0">
            <h2 className="font-display text-lg sm:text-xl font-bold text-white tracking-tight truncate group-hover:text-accent-400 transition-colors">
              {team.name}
            </h2>
            <ChevronRight className="h-4 w-4 text-[#4c4c56] group-hover:text-accent-400 shrink-0 transition-colors" />
          </Link>
        </div>
        <button
          onClick={() => setPicking(true)}
          aria-label="Change team"
          className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-[#75757f] hover:text-white hover:bg-[#1b1b22] transition-colors"
        >
          <Pencil className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}
