import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Users, ChevronRight } from 'lucide-react';
import { useMyTeam } from '../hooks/useMyTeam';
import { useLeagueDirectory } from '../hooks/detail';
import { useLeagueMatchups } from '../hooks/league';
import { useNflState } from '../hooks/queries';
import { TeamRow } from './TeamRow';

const num = (v: number | string | null | undefined): number => (v == null ? 0 : Number(v) || 0);
const fmtPts = (n: number): string => Math.round(n).toLocaleString();

interface RosterRow {
  rosterId: number;
  name: string;
  avatar: string | null;
  owner: string;
  wins: number;
  losses: number;
  ties: number;
}

/** A team's standing, from the Dashboard's power-ranking computation. */
export interface MyTeamStanding {
  rosterId: number;
  rank: number;
  totalValue: number;
  wins: number;
  losses: number;
}

/** One-time (per league) prompt + persistent card for the visitor's own team.
 *  When no team is chosen it's a picker; once chosen it's a compact identity
 *  card leading the Dashboard with a record / power-rank / next-matchup strip.
 *  Deliberately NO edit affordance here — "my team" is set-once (the wizard
 *  auto-detects it); corrections live in Settings → My Leagues so a stray tap
 *  can't re-personalize the whole dashboard. `standings` comes from Home's
 *  power rankings. */
export function MyTeamCard({ standings = [] }: { standings?: MyTeamStanding[] }) {
  const { team, setMyTeam, hasChoice } = useMyTeam();
  const { data: directory } = useLeagueDirectory();
  const { data: matchups } = useLeagueMatchups();
  const { data: nfl } = useNflState();

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

  // ── Picker (no choice yet) ──
  if (!hasChoice) {
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

  if (!team) return null;

  // ── Stat strip: record · power rank · next matchup (in-season) / value (off) ──
  const mine = standings.find((s) => s.rosterId === team.rosterId) ?? null;
  const teamCount = standings.length || rosters.length;

  // Next opponent: in the current NFL week, find my matchup_id in the current
  // league, then the other roster sharing it. Only meaningful in-season.
  const nextOpponent = (() => {
    if (!nfl || nfl.isOffseason || !matchups || !directory?.currentLeagueId) return null;
    const wk = matchups.filter((m) => m.league_id === directory.currentLeagueId && m.week === nfl.week && m.matchup_id != null);
    const mineRow = wk.find((m) => m.roster_id === team.rosterId);
    if (!mineRow) return null;
    const opp = wk.find((m) => m.matchup_id === mineRow.matchup_id && m.roster_id !== team.rosterId);
    if (!opp) return null;
    return { rosterId: opp.roster_id, name: directory.teamName(opp.roster_id), week: nfl.week };
  })();

  const stats: { label: string; value: React.ReactNode; to?: string }[] = [];
  if (mine) {
    stats.push({ label: 'Record', value: `${mine.wins}-${mine.losses}` });
    stats.push({ label: 'Power rank', value: <>#{mine.rank}<span className="text-[#60606a] text-[12px] font-medium"> / {teamCount}</span></>, to: '/league' });
  }
  if (nextOpponent) {
    stats.push({ label: `Wk ${nextOpponent.week} vs`, value: <span className="truncate">{nextOpponent.name}</span>, to: `/teams/${nextOpponent.rosterId}` });
  } else if (mine) {
    stats.push({ label: 'Roster value', value: fmtPts(mine.totalValue), to: `/teams/${team.rosterId}` });
  }

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
      </div>

      {/* Stat strip */}
      {stats.length > 0 && (
        <div className="relative grid grid-cols-3 border-t border-[#1b1b22] divide-x divide-[#1b1b22]">
          {stats.map((s) => {
            const body = (
              <>
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#75757f] truncate">{s.label}</p>
                <p className="font-display text-[15px] font-bold text-white tabular-nums mt-0.5 flex items-center gap-1 min-w-0">{s.value}</p>
              </>
            );
            return s.to ? (
              <Link key={s.label} to={s.to} className="px-3 sm:px-4 py-3 min-w-0 hover:bg-[#17171d] transition-colors">
                {body}
              </Link>
            ) : (
              <div key={s.label} className="px-3 sm:px-4 py-3 min-w-0">{body}</div>
            );
          })}
        </div>
      )}
    </section>
  );
}
