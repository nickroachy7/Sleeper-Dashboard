import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Trophy, Users, ChevronRight, Flame } from 'lucide-react';
import { SectionCard } from './SectionCard';
import { NoLeagueState } from './NoLeagueState';
import { LeaguePicker } from './LeaguePicker';
import { useActiveLeague } from '../lib/active-league';
import { useRecordBook } from '../hooks/useRecordBook';

const fmtPts = (n: number): string => Math.round(n).toLocaleString();

// ── Records tab (Ranking page) ────────────────────────────────────
// The all-time record book, season roll-call, and manager leaderboard — the
// one LEAGUE-scoped surface on the otherwise-global Ranking page. The rest of
// Ranking (Players/Picks) is community-wide; Records lets the user FILTER to
// one of their leagues via a local picker (default = the active league). App
// chrome stays league-neutral — this picker is scoped to the tab, not global.

export function RecordsPanel() {
  const { leagues, activeLeagueId } = useActiveLeague();
  // Default the picker to the active league, falling back to the first added.
  const [picked, setPicked] = useState<string | null>(null);
  const rootId = picked ?? activeLeagueId ?? leagues[0]?.rootLeagueId ?? null;
  const { data: book, isLoading } = useRecordBook(rootId);

  if (!rootId) {
    return (
      <NoLeagueState
        heading="Add a league to see records"
        sub="The record book, season-by-season leaders, and an all-time manager leaderboard — for any Sleeper dynasty. The rest of the Ranking page works without one."
        compact
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* League filter — only when the user follows more than one. */}
      {leagues.length > 1 && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-[12px] text-[#75757f]">Records for</p>
          <LeaguePicker leagues={leagues} selected={rootId} onSelect={setPicked} />
        </div>
      )}

      {isLoading ? (
        <>
          <div className="skeleton h-64 w-full rounded-2xl" />
          <div className="skeleton h-72 w-full rounded-2xl" />
        </>
      ) : !book || !book.hasData ? (
        <SectionCard label="Record Book" sub="All-time single-game records across every dynasty season" flush>
          <p className="text-[12px] text-[#60606a] px-4 sm:px-5 pb-5">
            No games on record yet — records appear once weekly scores are synced.
          </p>
        </SectionCard>
      ) : (
        <>
          {/* Single-game record book */}
          {book.records.length > 0 && (
            <SectionCard label="Record Book" sub="All-time single-game records across every dynasty season" flush>
              <div className="divide-y divide-[#1b1b22]">
                {book.records.map((r) => (
                  <Link key={r.label} to={`/teams/${r.rosterId}`} className="group flex items-center gap-3 px-4 sm:px-5 py-3 hover:bg-[#1b1b22] transition-colors">
                    <Trophy className="h-4 w-4 text-accent-500/70 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] uppercase tracking-[0.1em] text-[#75757f] font-bold">{r.label}</p>
                      <p className="text-[13px] text-white font-medium truncate group-hover:text-accent-400 transition-colors">
                        {r.who} <span className="text-[#60606a] font-normal">· {r.when}</span>
                      </p>
                    </div>
                    <span className="font-display text-[15px] font-bold tabular-nums text-white shrink-0">{r.value}</span>
                    <ChevronRight className="h-4 w-4 text-[#4c4c56] group-hover:text-accent-400 shrink-0 transition-colors" />
                  </Link>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Season roll-call */}
          {book.seasonRoll.length > 0 && (
            <SectionCard label="Season by Season" sub="Regular-season points leader each year (playoff data not synced)" flush>
              <div className="divide-y divide-[#1b1b22]">
                {book.seasonRoll.map((s) => (
                  <div key={s.season} className="flex items-center gap-3 px-4 sm:px-5 py-3">
                    <span className="font-display text-[15px] font-bold tabular-nums text-accent-400 w-12 shrink-0">{s.season}</span>
                    <Link to={`/teams/${s.pointsRosterId}`} className="min-w-0 flex-1 group">
                      <p className="text-[10px] uppercase tracking-[0.1em] text-[#75757f] font-bold flex items-center gap-1">
                        <Flame className="h-3 w-3 text-orange-400" /> Points leader
                      </p>
                      <p className="text-[13px] text-white font-medium truncate group-hover:text-accent-400 transition-colors">
                        {s.pointsName} <span className="text-[#60606a] font-normal">· {fmtPts(s.pointsPf)} pts</span>
                      </p>
                    </Link>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* All-time manager leaderboard */}
          {book.managers.length > 0 && (
            <SectionCard label="All-Time Managers" sub="Combined record across every synced season" flush>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[560px]">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-[0.1em] text-[#60606a] border-b border-[#1b1b22]">
                      <th className="font-bold py-2 pl-4 sm:pl-5 pr-2">#</th>
                      <th className="font-bold py-2 px-2">Manager</th>
                      <th className="font-bold py-2 px-2 text-center">Record</th>
                      <th className="font-bold py-2 px-2 text-right">Win%</th>
                      <th className="font-bold py-2 px-2 text-right">Total PF</th>
                      <th className="font-bold py-2 px-2 pr-4 sm:pr-5 text-center" title="Regular-season #1 finishes">Best</th>
                    </tr>
                  </thead>
                  <tbody>
                    {book.managers.map((m, i) => {
                      const gp = m.wins + m.losses + m.ties;
                      const wp = gp ? m.wins / gp : 0;
                      return (
                        <tr key={m.ownerId} className="group border-b border-[#1b1b22] last:border-0 hover:bg-[#1b1b22] transition-colors">
                          <td className="py-2.5 pl-4 sm:pl-5 pr-2 font-display text-[13px] font-bold tabular-nums text-[#75757f]">{i + 1}</td>
                          <td className="py-2.5 px-2">
                            <Link to={`/teams/${m.rosterId}`} className="flex items-center gap-2.5 min-w-0">
                              <span className="w-7 h-7 rounded-full overflow-hidden bg-[#22222b] shrink-0 ring-1 ring-inset ring-white/10 flex items-center justify-center">
                                {m.avatar ? (
                                  <img src={m.avatar} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
                                ) : (
                                  <Users className="h-3.5 w-3.5 text-[#60606a]" />
                                )}
                              </span>
                              <span className="text-[13px] font-medium text-white truncate group-hover:text-accent-400 transition-colors">{m.name}</span>
                            </Link>
                          </td>
                          <td className="py-2.5 px-2 text-center text-[13px] tabular-nums text-[#d6d6de]">{m.wins}-{m.losses}{m.ties ? `-${m.ties}` : ''}</td>
                          <td className="py-2.5 px-2 text-right text-[12px] tabular-nums text-[#9c9ca7]">{(wp * 100).toFixed(1)}%</td>
                          <td className="py-2.5 px-2 text-right text-[12px] tabular-nums text-[#75757f]">{fmtPts(m.pf)}</td>
                          <td className="py-2.5 px-2 pr-4 sm:pr-5 text-center text-[12px] tabular-nums text-[#9c9ca7]">
                            {m.titles > 0 ? <span className="text-accent-400 font-semibold">{m.titles}×</span> : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-[#60606a] px-4 sm:px-5 py-3">
                "Best" counts regular-season #1 finishes (by record, then points). Playoff/championship results aren't synced from Sleeper.
              </p>
            </SectionCard>
          )}
        </>
      )}
    </div>
  );
}
