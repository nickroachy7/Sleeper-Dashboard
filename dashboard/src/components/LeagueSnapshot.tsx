import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Users, ChevronRight } from 'lucide-react';
import { SectionCard } from './SectionCard';
import { useLeagueDirectory } from '../hooks/detail';

const num = (v: number | string | null | undefined): number => (v == null ? 0 : Number(v) || 0);
const fmtPts = (n: number): string => Math.round(n).toLocaleString();

interface DirRoster {
  league_id: string;
  roster_id: number;
  owner_id: string | null;
  wins: number | null;
  losses: number | null;
  ties: number | null;
  fpts: number | string | null;
}

/**
 * A compact standings snapshot for the dashboard — record-based (distinct from
 * the value-based Power Rankings), pulled from the most recent season that has
 * actually been played so it stays useful in the offseason. Links through to the
 * full League hub. Self-hides when no season has games yet.
 */
export function LeagueSnapshot() {
  const { data: directory } = useLeagueDirectory();

  const snap = useMemo(() => {
    if (!directory) return null;
    // Newest season (leagues are season-desc) that has any games on record.
    const playedLeague = directory.leagues.find((lg) => {
      const rs = (directory.rosters as DirRoster[]).filter((r) => r.league_id === lg.league_id);
      return rs.some((r) => num(r.wins) + num(r.losses) + num(r.ties) > 0);
    });
    if (!playedLeague) return null;

    const rosters = (directory.rosters as DirRoster[]).filter((r) => r.league_id === playedLeague.league_id);
    const rows = [...rosters]
      .sort((a, b) => num(b.wins) - num(a.wins) || num(b.fpts) - num(a.fpts))
      .slice(0, 6)
      .map((r, i) => ({
        rank: i + 1,
        rosterId: r.roster_id,
        name: directory.teamName(r.roster_id, playedLeague.league_id),
        avatar: directory.teamAvatar(r.roster_id, playedLeague.league_id),
        wins: num(r.wins),
        losses: num(r.losses),
        ties: num(r.ties),
        pf: num(r.fpts),
      }));
    return { season: playedLeague.season, rows };
  }, [directory]);

  if (!snap || snap.rows.length === 0) return null;

  return (
    <SectionCard
      label="Standings"
      sub={`${snap.season} record`}
      right={
        <Link to="/league" className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-accent-400 hover:text-accent-300 transition-colors">
          Full league <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      }
      flush
    >
      <div>
        {snap.rows.map((s) => (
          <Link
            key={s.rosterId}
            to={`/teams/${s.rosterId}`}
            className="group flex items-center gap-3 px-4 sm:px-5 py-2 border-b border-[#1b1b22] last:border-0 hover:bg-[#1b1b22] transition-colors"
          >
            <span className="font-display text-[12px] font-bold tabular-nums text-[#75757f] w-4 text-center shrink-0">{s.rank}</span>
            <span className="w-7 h-7 rounded-full overflow-hidden bg-[#22222b] shrink-0 ring-1 ring-inset ring-white/10 flex items-center justify-center">
              {s.avatar ? (
                <img src={s.avatar} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
              ) : (
                <Users className="h-3.5 w-3.5 text-[#60606a]" />
              )}
            </span>
            <span className="text-[13px] font-medium text-white truncate flex-1 group-hover:text-accent-400 transition-colors">{s.name}</span>
            <span className="text-[12px] tabular-nums text-[#d6d6de] shrink-0">{s.wins}-{s.losses}{s.ties ? `-${s.ties}` : ''}</span>
            <span className="text-[11px] tabular-nums text-[#75757f] shrink-0 w-12 text-right">{fmtPts(s.pf)}</span>
          </Link>
        ))}
      </div>
    </SectionCard>
  );
}
