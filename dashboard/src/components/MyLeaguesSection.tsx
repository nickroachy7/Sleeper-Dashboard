import { Plus, Trash2, Check, Trophy, Radar } from 'lucide-react';
import { useLeague } from '../hooks/queries';
import { useActiveLeague } from '../lib/active-league';
import { openAddLeague } from '../lib/add-league-modal';

/**
 * "My Leagues" — manage the set of leagues the visitor has added: switch the
 * active one, remove leagues, or add another. The leagues live in localStorage
 * (see league-store.ts); this section is the primary CRUD surface for them.
 */
export function MyLeaguesSection() {
  const { data: active } = useLeague();
  const { leagues, activeLeagueId, setActiveLeague, removeLeague } = useActiveLeague();
  const activeRootId = activeLeagueId ?? active?.league_id ?? null;

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
            return (
              <div key={l.rootLeagueId} className="flex items-center gap-3 px-4 py-3">
                <span className={`w-2 h-2 rounded-full shrink-0 ${isActive ? 'bg-accent-500' : 'bg-[#3a3a44]'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-white truncate">{l.name}</p>
                  <p className="text-[11px] text-[#75757f]">{l.season} Season</p>
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
            );
          })}
        </div>
      )}
    </section>
  );
}
