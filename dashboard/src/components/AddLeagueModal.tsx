import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, Loader2, Check, AlertCircle, Users } from 'lucide-react';
import { useActiveLeague } from '../lib/active-league';
import { OPEN_ADD_LEAGUE_EVENT } from '../lib/add-league-modal';
import { findLeaguesForUsername, ingestLeague, type DiscoveredLeague } from '../lib/add-league';

type Phase = 'input' | 'searching' | 'results' | 'importing';

export function AddLeagueModal() {
  const { leagues: added, addLeague } = useActiveLeague();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('input');
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [discovered, setDiscovered] = useState<DiscoveredLeague[]>([]);
  const [displayName, setDisplayName] = useState('');
  const [matchedBy, setMatchedBy] = useState<'league' | 'user'>('user');
  const [importingId, setImportingId] = useState<string | null>(null);

  const addedIds = new Set(added.map((l) => l.rootLeagueId));

  useEffect(() => {
    const onOpen = () => {
      setOpen(true);
      setPhase('input');
      setError(null);
      setDiscovered([]);
      setImportingId(null);
    };
    window.addEventListener(OPEN_ADD_LEAGUE_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_ADD_LEAGUE_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && phase !== 'importing') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, phase]);

  if (!open) return null;

  const close = () => {
    if (phase === 'importing') return; // don't abandon an in-flight import
    setOpen(false);
  };

  const search = async () => {
    setError(null);
    setPhase('searching');
    try {
      const res = await findLeaguesForUsername(username);
      setDisplayName(res.displayName);
      setMatchedBy(res.matchedBy);
      setDiscovered(res.leagues);
      setPhase('results');
      if (res.leagues.length === 0) {
        setError(`No ${res.season} leagues found for "${res.displayName}". Try a league ID from your Sleeper URL instead.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lookup failed');
      setPhase('input');
    }
  };

  const pick = async (league: DiscoveredLeague) => {
    if (addedIds.has(league.league_id)) {
      addLeague({ rootLeagueId: league.league_id, name: league.name, season: league.season });
      setOpen(false);
      return;
    }
    setError(null);
    setImportingId(league.league_id);
    setPhase('importing');
    try {
      const res = await ingestLeague(league.league_id);
      addLeague({ rootLeagueId: res.rootLeagueId, name: res.name, season: res.season });
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
      setPhase('results');
      setImportingId(null);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-[12vh]" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={close} />
      <div className="relative w-full max-w-md rounded-2xl bg-[#0f0f14] border border-[#2a2a34] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1b1b22]">
          <div>
            <h2 className="text-[15px] font-bold text-white">Add a league</h2>
            <p className="text-[12px] text-[#75757f]">Enter your Sleeper username or league ID.</p>
          </div>
          <button
            onClick={close}
            disabled={phase === 'importing'}
            aria-label="Close"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#9c9ca7] hover:text-white hover:bg-[#1b1b22] transition-colors disabled:opacity-40"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5">
          {/* Username input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (phase !== 'searching' && phase !== 'importing') search();
            }}
          >
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#60606a]" />
                <input
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Sleeper username or league ID"
                  disabled={phase === 'importing'}
                  className="w-full h-10 pl-9 pr-3 rounded-lg bg-[#141419] border border-[#2a2a34] text-[14px] text-white placeholder:text-[#60606a] focus:outline-none focus:border-accent-500/60 disabled:opacity-50"
                />
              </div>
              <button
                type="submit"
                disabled={!username.trim() || phase === 'searching' || phase === 'importing'}
                className="h-10 px-4 rounded-lg bg-accent-500 text-[#06110a] text-[13px] font-semibold hover:bg-accent-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {phase === 'searching' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Find'}
              </button>
            </div>
          </form>

          {error && (
            <div className="mt-3 flex items-start gap-2 text-[12px] text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0 mt-px" />
              <span>{error}</span>
            </div>
          )}

          {/* Results */}
          {(phase === 'results' || phase === 'importing') && discovered.length > 0 && (
            <div className="mt-4">
              <p className="text-[11px] uppercase tracking-[1.5px] text-[#60606a] font-semibold mb-2">
                {matchedBy === 'league' ? 'League found' : `${displayName}'s leagues`}
              </p>
              <div className="space-y-1.5 max-h-[40vh] overflow-y-auto">
                {discovered.map((l) => {
                  const isAdded = addedIds.has(l.league_id);
                  const isImporting = importingId === l.league_id;
                  return (
                    <button
                      key={l.league_id}
                      onClick={() => pick(l)}
                      disabled={phase === 'importing'}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[#141419] border border-[#22222b] hover:border-accent-500/50 hover:bg-[#17171d] transition-colors text-left disabled:opacity-50 disabled:hover:border-[#22222b]"
                    >
                      <div className="w-8 h-8 rounded-lg bg-[#22222b] flex items-center justify-center shrink-0 overflow-hidden">
                        {l.avatar ? (
                          <img src={`https://sleepercdn.com/avatars/thumbs/${l.avatar}`} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <Users className="h-4 w-4 text-[#60606a]" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-white truncate">{l.name}</p>
                        <p className="text-[11px] text-[#75757f]">{l.season} · {l.total_rosters} teams</p>
                      </div>
                      {isImporting ? (
                        <Loader2 className="h-4 w-4 text-accent-400 animate-spin shrink-0" />
                      ) : isAdded ? (
                        <span className="text-[11px] text-accent-400 flex items-center gap-1 shrink-0"><Check className="h-3.5 w-3.5" /> Added</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {phase === 'importing' && (
            <p className="mt-3 text-[12px] text-[#75757f]">
              Importing all seasons from Sleeper — this can take up to a minute.
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
