import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, AlertCircle, Mail, Lock, UserRound, Search, Check, Users, ChevronLeft, Pencil } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useActiveLeague } from '../lib/active-league';
import { openAuth } from '../lib/auth-modal';
import { myTeamStore } from '../lib/my-team-store';
import {
  findLeaguesForUsername,
  findMyRoster,
  ingestLeague,
  listLeagueTeams,
  type DiscoveredLeague,
  type LeagueTeamOption,
} from '../lib/add-league';

// ── Welcome: full-page sign-up onboarding ─────────────────────────
// Account → connect leagues → confirm teams, as a dedicated page (the modal
// version cramped step 3 into nested scroll areas — see AuthModal, which is
// now sign-in only). The Sleeper handle from step 2 auto-detects their roster
// in each league; auto-detected teams collapse to a confirmed card so the
// common case is glance-and-finish. Every step past account creation is
// skippable; accounts are never a wall.

type Step = 0 | 1 | 2;

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const STEP_LABELS = ['Account', 'Leagues', 'Your teams'] as const;

interface LeagueSetup {
  league: DiscoveredLeague;
  teams: LeagueTeamOption[];
  rosterId: number | null;
  autoDetected: boolean;
  /** Auto-detected leagues render collapsed until the user asks to change. */
  expanded: boolean;
}

const inputCls =
  'w-full h-11 pl-10 pr-3 rounded-xl bg-[#141419] border border-[#2a2a34] text-[15px] text-white placeholder:text-[#60606a] focus:outline-none focus:border-accent-500/60 disabled:opacity-50';
const primaryBtnCls =
  'w-full flex items-center justify-center gap-2 h-11 rounded-xl bg-accent-500 text-[#06110a] text-[15px] font-semibold hover:bg-accent-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

export default function Welcome() {
  const navigate = useNavigate();
  const { user, signUp, updateProfile } = useAuth();
  const { leagues: added, addLeague, setActiveLeague } = useActiveLeague();
  const queryClient = useQueryClient();

  // A signed-in user landing here starts at league connect, not account.
  const [step, setStep] = useState<Step>(user ? 1 : 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [handle, setHandle] = useState('');
  const [searched, setSearched] = useState(false);
  const [sleeperUserId, setSleeperUserId] = useState<string | null>(null);
  const [discovered, setDiscovered] = useState<DiscoveredLeague[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [setups, setSetups] = useState<LeagueSetup[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [finishing, setFinishing] = useState<string | null>(null);
  const doneIds = useRef<Set<string>>(new Set());

  const addedIds = useMemo(() => new Set(added.map((l) => l.rootLeagueId)), [added]);

  // ── Step 0: account ──
  const usernameValid = USERNAME_RE.test(username.trim());
  const accountValid = usernameValid && email.trim().includes('@') && password.length >= 6;

  const submitAccount = async () => {
    setError(null);
    setBusy(true);
    try {
      await signUp(email.trim(), password, username.trim());
      setHandle(username.trim());
      setStep(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong — try again.');
    } finally {
      setBusy(false);
    }
  };

  // ── Step 1: find + select leagues ──
  const search = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await findLeaguesForUsername(handle);
      setSleeperUserId(res.sleeperUserId);
      // The Sleeper lookup doubles as profile setup: their Sleeper avatar
      // becomes the account's profile picture (best-effort, fire-and-forget).
      if (res.sleeperUserId) {
        void updateProfile({ sleeperUserId: res.sleeperUserId, avatarUrl: res.sleeperAvatarUrl });
      }
      setDiscovered(res.leagues);
      setSelected(new Set(res.leagues.length === 1 ? [res.leagues[0].league_id] : []));
      setSearched(true);
      if (res.leagues.length === 0) {
        setError(`No ${res.season} leagues found for "${res.displayName}". Try a league ID from your Sleeper URL.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lookup failed');
    } finally {
      setBusy(false);
    }
  };

  const toggleLeague = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Step 2: load teams + auto-detect ──
  const goToTeams = async () => {
    setError(null);
    setLoadingTeams(true);
    setStep(2);
    try {
      const chosen = discovered.filter((l) => selected.has(l.league_id));
      const loaded = await Promise.all(
        chosen.map(async (league): Promise<LeagueSetup> => {
          const [teams, mine] = await Promise.all([
            listLeagueTeams(league.league_id).catch(() => [] as LeagueTeamOption[]),
            sleeperUserId ? findMyRoster(league.league_id, sleeperUserId) : Promise.resolve(null),
          ]);
          return { league, teams, rosterId: mine, autoDetected: mine != null, expanded: mine == null };
        })
      );
      setSetups(loaded);
    } finally {
      setLoadingTeams(false);
    }
  };

  const setPick = (leagueId: string, rosterId: number | null) => {
    setSetups((prev) =>
      prev.map((s) =>
        s.league.league_id === leagueId ? { ...s, rosterId, autoDetected: false, expanded: rosterId == null } : s
      )
    );
  };

  const expand = (leagueId: string) => {
    setSetups((prev) => prev.map((s) => (s.league.league_id === leagueId ? { ...s, expanded: true } : s)));
  };

  // ── Finish ──
  const finish = async () => {
    setError(null);
    const failures: string[] = [];
    let firstRoot: string | null = null;

    for (const s of setups) {
      const id = s.league.league_id;
      try {
        setFinishing(s.league.name);
        let root = id;
        let name = s.league.name;
        let season = s.league.season;
        if (!doneIds.current.has(id) && !addedIds.has(id)) {
          const res = await ingestLeague(id);
          root = res.rootLeagueId;
          name = res.name;
          season = res.season;
        }
        doneIds.current.add(id);
        if (s.rosterId != null) myTeamStore.set(root, s.rosterId);
        addLeague({ rootLeagueId: root, name, season });
        queryClient.invalidateQueries({ queryKey: ['import-status', root] });
        firstRoot ??= root;
      } catch (e) {
        failures.push(`${s.league.name}: ${e instanceof Error ? e.message : 'failed'}`);
      }
    }
    setFinishing(null);

    if (failures.length > 0) {
      setError(`Some leagues didn't import — ${failures.join('; ')}. You can retry, or add them later from Settings.`);
      return;
    }
    if (firstRoot) setActiveLeague(firstRoot);
    navigate('/');
  };

  const errorRow = error && (
    <div className="mt-3 flex items-start gap-2 text-[13px] text-red-400">
      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
      <span>{error}</span>
    </div>
  );

  return (
    <div className="min-h-dvh">
      <div className="p-4 sm:p-6 lg:p-8 max-w-lg mx-auto">
        {/* Progress */}
        <div className="flex items-center gap-2 mb-6 pt-2">
          {STEP_LABELS.map((label, i) => (
            <div key={label} className="flex-1">
              <div className={`h-1 rounded-full transition-colors ${i <= step ? 'bg-accent-500' : 'bg-[#22222b]'}`} />
              <p className={`mt-1.5 text-[10px] font-bold uppercase tracking-[0.14em] ${i === step ? 'text-accent-400' : 'text-[#5a5a64]'}`}>
                {label}
              </p>
            </div>
          ))}
        </div>

        {/* ── Step 0: account ── */}
        {step === 0 && (
          <div>
            <h1 className="font-display text-2xl font-bold text-white tracking-tight">Create your account</h1>
            <p className="mt-1 text-[14px] text-[#9c9ca7]">Save your leagues so they follow you to any device.</p>

            <form className="mt-6" onSubmit={(e) => { e.preventDefault(); if (accountValid && !busy) submitAccount(); }}>
              <div className="space-y-3">
                <div className="relative">
                  <UserRound className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#60606a]" />
                  <input autoFocus value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" autoComplete="username" disabled={busy} className={inputCls} />
                </div>
                {username.length > 0 && !usernameValid && (
                  <p className="text-[12px] text-[#75757f] pl-1">3–20 characters — letters, numbers, and underscores.</p>
                )}
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#60606a]" />
                  <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" disabled={busy} className={inputCls} />
                </div>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#60606a]" />
                  <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (6+ characters)" disabled={busy} className={inputCls} />
                </div>
              </div>
              {errorRow}
              <button type="submit" disabled={!accountValid || busy} className={`mt-5 ${primaryBtnCls}`}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Continue'}
              </button>
              <p className="mt-3 text-[12px] text-[#60606a] text-center">
                No verification email, no spam — your email is just your login.
              </p>
              <p className="mt-5 text-[13px] text-[#75757f] text-center">
                Already have an account?{' '}
                <button type="button" onClick={() => { navigate('/'); openAuth(); }} className="text-accent-400 hover:text-accent-300 font-medium transition-colors">
                  Sign in
                </button>
              </p>
            </form>
          </div>
        )}

        {/* ── Step 1: connect leagues ── */}
        {step === 1 && (
          <div>
            <h1 className="font-display text-2xl font-bold text-white tracking-tight">Connect your leagues</h1>
            <p className="mt-1 text-[14px] text-[#9c9ca7]">Find your Sleeper leagues and pick the ones to add.</p>

            <form className="mt-6" onSubmit={(e) => { e.preventDefault(); if (handle.trim() && !busy) search(); }}>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#60606a]" />
                  <input autoFocus value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="Sleeper username or league ID" disabled={busy} className={inputCls} />
                </div>
                <button type="submit" disabled={!handle.trim() || busy} className="h-11 px-5 rounded-xl bg-accent-500 text-[#06110a] text-[14px] font-semibold hover:bg-accent-400 transition-colors disabled:opacity-40">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Find'}
                </button>
              </div>
            </form>

            {errorRow}

            {discovered.length > 0 && (
              <div className="mt-5">
                <p className="text-[11px] uppercase tracking-[1.5px] text-[#60606a] font-semibold mb-2">Select your leagues</p>
                <div className="space-y-2">
                  {discovered.map((l) => {
                    const isSelected = selected.has(l.league_id);
                    const isAdded = addedIds.has(l.league_id);
                    return (
                      <button
                        key={l.league_id}
                        onClick={() => toggleLeague(l.league_id)}
                        className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl border transition-colors text-left ${
                          isSelected ? 'bg-accent-500/[0.08] border-accent-500/50' : 'bg-[#141419] border-[#22222b] hover:border-[#363641]'
                        }`}
                      >
                        <span className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${isSelected ? 'bg-accent-500 border-accent-500' : 'border-[#3a3a44]'}`}>
                          {isSelected && <Check className="h-3.5 w-3.5 text-[#06110a]" />}
                        </span>
                        <div className="w-9 h-9 rounded-lg bg-[#22222b] flex items-center justify-center shrink-0 overflow-hidden">
                          {l.avatar ? (
                            <img src={`https://sleepercdn.com/avatars/thumbs/${l.avatar}`} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <Users className="h-4 w-4 text-[#60606a]" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-semibold text-white truncate">{l.name}</p>
                          <p className="text-[12px] text-[#75757f]">{l.season} · {l.total_rosters} teams{isAdded ? ' · already added' : ''}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <button onClick={goToTeams} disabled={selected.size === 0} className={`mt-5 ${primaryBtnCls}`}>
              Continue{selected.size > 0 ? ` with ${selected.size} league${selected.size > 1 ? 's' : ''}` : ''}
            </button>
            <button onClick={() => navigate('/')} className="mt-2 w-full h-10 text-[13px] text-[#75757f] hover:text-[#9c9ca7] transition-colors">
              {searched ? 'Skip for now — I’ll add leagues later' : 'Skip for now'}
            </button>
          </div>
        )}

        {/* ── Step 2: confirm teams ── */}
        {step === 2 && (
          <div>
            <h1 className="font-display text-2xl font-bold text-white tracking-tight">Confirm your teams</h1>
            <p className="mt-1 text-[14px] text-[#9c9ca7]">Tell us which team is yours in each league.</p>

            {loadingTeams ? (
              <div className="flex items-center justify-center gap-2 py-16 text-[#75757f]">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-[14px]">Finding your teams…</span>
              </div>
            ) : (
              <div className="mt-6 space-y-3">
                {setups.map((s) => {
                  const mine = s.rosterId != null ? s.teams.find((t) => t.rosterId === s.rosterId) : null;

                  // Confirmed card: auto-detected (or already picked) and not
                  // being edited — the common case, one glance.
                  if (!s.expanded && mine) {
                    return (
                      <div key={s.league.league_id} className="rounded-xl bg-[#141419] border border-[#22222b] px-3.5 py-3">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[13px] font-semibold text-[#c4c4cd] truncate">{s.league.name}</p>
                          {s.autoDetected && (
                            <span className="text-[10px] uppercase tracking-wide font-bold text-accent-400 bg-accent-500/15 px-1.5 py-0.5 rounded shrink-0">
                              Auto-detected
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-[#22222b] flex items-center justify-center shrink-0 overflow-hidden">
                            {mine.avatar ? (
                              <img src={mine.avatar} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <UserRound className="h-4 w-4 text-[#60606a]" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0 flex items-center gap-1.5">
                            <Check className="h-4 w-4 text-accent-400 shrink-0" />
                            <p className="text-[14px] font-semibold text-white truncate">{mine.name}</p>
                          </div>
                          <button
                            onClick={() => expand(s.league.league_id)}
                            className="flex items-center gap-1 text-[12px] text-[#75757f] hover:text-white px-2 py-1 rounded-md hover:bg-[#1b1b22] transition-colors shrink-0"
                          >
                            <Pencil className="h-3 w-3" /> Change
                          </button>
                        </div>
                      </div>
                    );
                  }

                  // Picker: no detection, or the user asked to change.
                  return (
                    <div key={s.league.league_id} className="rounded-xl bg-[#141419] border border-[#22222b] px-3.5 py-3">
                      <p className="text-[13px] font-semibold text-[#c4c4cd] truncate mb-2">{s.league.name}</p>
                      {s.teams.length === 0 ? (
                        <p className="text-[13px] text-[#75757f]">Couldn't load teams — you can pick yours later.</p>
                      ) : (
                        <div className="space-y-0.5">
                          {s.teams.map((t) => {
                            const isMine = s.rosterId === t.rosterId;
                            return (
                              <button
                                key={t.rosterId}
                                onClick={() => setPick(s.league.league_id, isMine ? null : t.rosterId)}
                                className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left transition-colors ${
                                  isMine ? 'bg-accent-500/[0.12]' : 'hover:bg-[#1b1b22]'
                                }`}
                              >
                                <div className="w-7 h-7 rounded-md bg-[#22222b] flex items-center justify-center shrink-0 overflow-hidden">
                                  {t.avatar ? (
                                    <img src={t.avatar} alt="" className="w-full h-full object-cover" />
                                  ) : (
                                    <UserRound className="h-3.5 w-3.5 text-[#60606a]" />
                                  )}
                                </div>
                                <span className={`flex-1 min-w-0 truncate text-[14px] ${isMine ? 'text-white font-semibold' : 'text-[#9c9ca7]'}`}>{t.name}</span>
                                {isMine && <Check className="h-4 w-4 text-accent-400 shrink-0" />}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {errorRow}

            <button onClick={finish} disabled={loadingTeams || !!finishing} className={`mt-5 ${primaryBtnCls}`}>
              {finishing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Importing {finishing}…
                </>
              ) : (
                'Finish setup'
              )}
            </button>
            <div className="mt-2 flex items-center justify-between">
              <button onClick={() => { setStep(1); setError(null); }} disabled={!!finishing} className="flex items-center gap-1 h-10 text-[13px] text-[#75757f] hover:text-[#9c9ca7] transition-colors disabled:opacity-40">
                <ChevronLeft className="h-3.5 w-3.5" /> Back
              </button>
              <p className="text-[12px] text-[#60606a]">You can change your team anytime.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
