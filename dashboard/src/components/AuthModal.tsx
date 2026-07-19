import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { X, Loader2, AlertCircle, Mail, Lock, UserRound, Search, Check, Users, ChevronLeft } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useActiveLeague } from '../lib/active-league';
import { OPEN_AUTH_EVENT } from '../lib/auth-modal';
import { myTeamStore } from '../lib/my-team-store';
import {
  findLeaguesForUsername,
  findMyRoster,
  ingestLeague,
  listLeagueTeams,
  type DiscoveredLeague,
  type LeagueTeamOption,
} from '../lib/add-league';

// ── Sign-up wizard / sign-in modal ────────────────────────────────
// Sign-up is a three-step onboarding: account → connect leagues → confirm
// teams. The Sleeper handle from step 2 lets us auto-detect their roster in
// each league (owner_id match), so step 3 is usually just "yep, that's me."
// Sign-in stays a plain two-field form — returning users already have their
// leagues saved. Every step past account creation is skippable; accounts are
// never a wall.

type Mode = 'signin' | 'signup';
type Step = 0 | 1 | 2; // account → leagues → teams

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

const STEP_LABELS = ['Account', 'Leagues', 'Your teams'] as const;

interface LeagueSetup {
  league: DiscoveredLeague;
  teams: LeagueTeamOption[];
  /** Selected roster (auto-detected when possible); null = not chosen. */
  rosterId: number | null;
  /** True when the pre-selection came from an owner_id match. */
  autoDetected: boolean;
}

export function AuthModal() {
  const { signIn, signUp, updateProfile } = useAuth();
  const { leagues: added, addLeague, setActiveLeague } = useActiveLeague();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('signup');
  const [step, setStep] = useState<Step>(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 0 — account
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Step 1 — league discovery
  const [handle, setHandle] = useState('');
  const [searched, setSearched] = useState(false);
  const [sleeperUserId, setSleeperUserId] = useState<string | null>(null);
  const [discovered, setDiscovered] = useState<DiscoveredLeague[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Step 2 — team confirmation
  const [setups, setSetups] = useState<LeagueSetup[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [finishing, setFinishing] = useState<string | null>(null); // league name being set up
  // Leagues fully ingested this session — a retry after a partial failure
  // must not re-ingest (and re-rate-limit) the ones that succeeded.
  const doneIds = useRef<Set<string>>(new Set());

  const addedIds = useMemo(() => new Set(added.map((l) => l.rootLeagueId)), [added]);

  useEffect(() => {
    const onOpen = () => {
      setOpen(true);
      setMode('signup');
      setStep(0);
      setError(null);
      setBusy(false);
      setSearched(false);
      setDiscovered([]);
      setSelected(new Set());
      setSetups([]);
      setFinishing(null);
      doneIds.current = new Set();
    };
    window.addEventListener(OPEN_AUTH_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_AUTH_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy && !finishing) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, finishing]);

  if (!open) return null;

  const close = () => {
    if (!busy && !finishing) setOpen(false);
  };

  // ── Step 0: create the account ──
  const usernameValid = USERNAME_RE.test(username.trim());
  const accountValid = usernameValid && email.trim().includes('@') && password.length >= 6;

  const submitAccount = async () => {
    setError(null);
    setBusy(true);
    try {
      await signUp(email.trim(), password, username.trim());
      // Best guess: their handle here is often their Sleeper username too.
      setHandle(username.trim());
      setStep(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong — try again.');
    } finally {
      setBusy(false);
    }
  };

  const submitSignIn = async () => {
    setError(null);
    setBusy(true);
    try {
      await signIn(email.trim(), password);
      setOpen(false);
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

  // ── Step 2: load teams + auto-detect rosters ──
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
          return { league, teams, rosterId: mine, autoDetected: mine != null };
        })
      );
      setSetups(loaded);
    } finally {
      setLoadingTeams(false);
    }
  };

  const setPick = (leagueId: string, rosterId: number | null) => {
    setSetups((prev) => prev.map((s) => (s.league.league_id === leagueId ? { ...s, rosterId, autoDetected: false } : s)));
  };

  // ── Finish: ingest each league, save team picks, activate the first ──
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
        // Pick first, then add: the account store's upsert reads the pick, so
        // it lands server-side in one write.
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
    setOpen(false);
  };

  const inputCls =
    'w-full h-10 pl-9 pr-3 rounded-lg bg-[#141419] border border-[#2a2a34] text-[14px] text-white placeholder:text-[#60606a] focus:outline-none focus:border-accent-500/60 disabled:opacity-50';
  const primaryBtnCls =
    'w-full flex items-center justify-center gap-2 h-10 rounded-lg bg-accent-500 text-[#06110a] text-[14px] font-semibold hover:bg-accent-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-[10vh]" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={close} />
      <div className="relative w-full max-w-md rounded-2xl bg-[#0f0f14] border border-[#2a2a34] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1b1b22]">
          <div>
            <h2 className="text-[15px] font-bold text-white">
              {mode === 'signin' ? 'Welcome back' : STEP_LABELS[step] === 'Account' ? 'Create your account' : STEP_LABELS[step] === 'Leagues' ? 'Connect your leagues' : 'Confirm your teams'}
            </h2>
            <p className="text-[12px] text-[#75757f]">
              {mode === 'signin'
                ? 'Sign in to pick up your saved leagues.'
                : step === 0
                  ? 'Save your leagues so they follow you to any device.'
                  : step === 1
                    ? 'Find your Sleeper leagues and pick the ones to add.'
                    : 'Tell us which team is yours in each league.'}
            </p>
          </div>
          <button
            onClick={close}
            disabled={busy || !!finishing}
            aria-label="Close"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#9c9ca7] hover:text-white hover:bg-[#1b1b22] transition-colors disabled:opacity-40"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Step dots (sign-up only) */}
        {mode === 'signup' && (
          <div className="flex items-center gap-1.5 px-5 pt-4">
            {STEP_LABELS.map((label, i) => (
              <div key={label} className="flex items-center gap-1.5">
                <span
                  className={`h-1.5 rounded-full transition-all ${
                    i === step ? 'w-6 bg-accent-500' : i < step ? 'w-3 bg-accent-500/50' : 'w-3 bg-[#2a2a34]'
                  }`}
                />
              </div>
            ))}
            <span className="ml-2 text-[10px] uppercase tracking-[1.5px] text-[#60606a] font-semibold">
              Step {step + 1} of 3
            </span>
          </div>
        )}

        <div className="p-5">
          {/* ── Sign-in (simple form) ── */}
          {mode === 'signin' && (
            <form onSubmit={(e) => { e.preventDefault(); if (email.trim().includes('@') && password.length >= 6 && !busy) submitSignIn(); }}>
              <div className="space-y-2.5">
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#60606a]" />
                  <input autoFocus type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" disabled={busy} className={inputCls} />
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#60606a]" />
                  <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" disabled={busy} className={inputCls} />
                </div>
              </div>
              {error && (
                <div className="mt-3 flex items-start gap-2 text-[12px] text-red-400">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-px" />
                  <span>{error}</span>
                </div>
              )}
              <button type="submit" disabled={!email.trim().includes('@') || password.length < 6 || busy} className={`mt-4 ${primaryBtnCls}`}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><UserRound className="h-4 w-4" /> Sign in</>}
              </button>
              <p className="mt-4 text-[12px] text-[#75757f] text-center">
                New here?{' '}
                <button type="button" onClick={() => { setMode('signup'); setError(null); }} className="text-accent-400 hover:text-accent-300 font-medium transition-colors">
                  Create an account
                </button>
              </p>
            </form>
          )}

          {/* ── Step 0: account ── */}
          {mode === 'signup' && step === 0 && (
            <form onSubmit={(e) => { e.preventDefault(); if (accountValid && !busy) submitAccount(); }}>
              <div className="space-y-2.5">
                <div className="relative">
                  <UserRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#60606a]" />
                  <input
                    autoFocus
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Username"
                    autoComplete="username"
                    disabled={busy}
                    className={inputCls}
                  />
                </div>
                {username.length > 0 && !usernameValid && (
                  <p className="text-[11px] text-[#75757f] pl-1">3–20 characters — letters, numbers, and underscores.</p>
                )}
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#60606a]" />
                  <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" disabled={busy} className={inputCls} />
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#60606a]" />
                  <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (6+ characters)" disabled={busy} className={inputCls} />
                </div>
              </div>
              {error && (
                <div className="mt-3 flex items-start gap-2 text-[12px] text-red-400">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-px" />
                  <span>{error}</span>
                </div>
              )}
              <button type="submit" disabled={!accountValid || busy} className={`mt-4 ${primaryBtnCls}`}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Continue'}
              </button>
              <p className="mt-2.5 text-[11px] text-[#60606a] text-center">
                No verification email, no spam — your email is just your login.
              </p>
              <p className="mt-4 text-[12px] text-[#75757f] text-center">
                Already have an account?{' '}
                <button type="button" onClick={() => { setMode('signin'); setError(null); }} className="text-accent-400 hover:text-accent-300 font-medium transition-colors">
                  Sign in
                </button>
              </p>
            </form>
          )}

          {/* ── Step 1: connect leagues ── */}
          {mode === 'signup' && step === 1 && (
            <div>
              <form onSubmit={(e) => { e.preventDefault(); if (handle.trim() && !busy) search(); }}>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#60606a]" />
                    <input
                      autoFocus
                      value={handle}
                      onChange={(e) => setHandle(e.target.value)}
                      placeholder="Sleeper username or league ID"
                      disabled={busy}
                      className={inputCls}
                    />
                  </div>
                  <button type="submit" disabled={!handle.trim() || busy} className="h-10 px-4 rounded-lg bg-accent-500 text-[#06110a] text-[13px] font-semibold hover:bg-accent-400 transition-colors disabled:opacity-40">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Find'}
                  </button>
                </div>
              </form>

              {error && (
                <div className="mt-3 flex items-start gap-2 text-[12px] text-red-400">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-px" />
                  <span>{error}</span>
                </div>
              )}

              {discovered.length > 0 && (
                <div className="mt-4">
                  <p className="text-[11px] uppercase tracking-[1.5px] text-[#60606a] font-semibold mb-2">
                    Select your leagues
                  </p>
                  <div className="space-y-1.5 max-h-[36vh] overflow-y-auto">
                    {discovered.map((l) => {
                      const isSelected = selected.has(l.league_id);
                      const isAdded = addedIds.has(l.league_id);
                      return (
                        <button
                          key={l.league_id}
                          onClick={() => toggleLeague(l.league_id)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors text-left ${
                            isSelected ? 'bg-accent-500/[0.08] border-accent-500/50' : 'bg-[#141419] border-[#22222b] hover:border-[#363641]'
                          }`}
                        >
                          <span className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${isSelected ? 'bg-accent-500 border-accent-500' : 'border-[#3a3a44]'}`}>
                            {isSelected && <Check className="h-3.5 w-3.5 text-[#06110a]" />}
                          </span>
                          <div className="w-8 h-8 rounded-lg bg-[#22222b] flex items-center justify-center shrink-0 overflow-hidden">
                            {l.avatar ? (
                              <img src={`https://sleepercdn.com/avatars/thumbs/${l.avatar}`} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <Users className="h-4 w-4 text-[#60606a]" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-semibold text-white truncate">{l.name}</p>
                            <p className="text-[11px] text-[#75757f]">{l.season} · {l.total_rosters} teams{isAdded ? ' · already added' : ''}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <button onClick={goToTeams} disabled={selected.size === 0} className={`mt-4 ${primaryBtnCls}`}>
                Continue{selected.size > 0 ? ` with ${selected.size} league${selected.size > 1 ? 's' : ''}` : ''}
              </button>
              <button onClick={close} className="mt-2 w-full h-9 text-[12px] text-[#75757f] hover:text-[#9c9ca7] transition-colors">
                {searched ? 'Skip for now — I’ll add leagues later' : 'Skip for now'}
              </button>
            </div>
          )}

          {/* ── Step 2: confirm teams ── */}
          {mode === 'signup' && step === 2 && (
            <div>
              {loadingTeams ? (
                <div className="flex items-center justify-center gap-2 py-10 text-[#75757f]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-[13px]">Finding your teams…</span>
                </div>
              ) : (
                <div className="space-y-4 max-h-[46vh] overflow-y-auto pr-1">
                  {setups.map((s) => (
                    <div key={s.league.league_id}>
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-[12px] font-semibold text-[#c4c4cd] truncate">{s.league.name}</p>
                        {s.autoDetected && (
                          <span className="text-[10px] uppercase tracking-wide font-bold text-accent-400 bg-accent-500/15 px-1.5 py-0.5 rounded shrink-0">
                            Auto-detected
                          </span>
                        )}
                      </div>
                      <div className="space-y-1 max-h-40 overflow-y-auto rounded-lg border border-[#22222b] p-1 bg-[#101015]">
                        {s.teams.length === 0 ? (
                          <p className="px-2 py-1.5 text-[12px] text-[#75757f]">Couldn't load teams — you can pick yours later.</p>
                        ) : (
                          s.teams.map((t) => {
                            const isMine = s.rosterId === t.rosterId;
                            return (
                              <button
                                key={t.rosterId}
                                onClick={() => setPick(s.league.league_id, isMine ? null : t.rosterId)}
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
                                <span className={`flex-1 min-w-0 truncate text-[13px] ${isMine ? 'text-white font-semibold' : 'text-[#9c9ca7]'}`}>{t.name}</span>
                                {isMine && <Check className="h-4 w-4 text-accent-400 shrink-0" />}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {error && (
                <div className="mt-3 flex items-start gap-2 text-[12px] text-red-400">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-px" />
                  <span>{error}</span>
                </div>
              )}

              <button onClick={finish} disabled={loadingTeams || !!finishing} className={`mt-4 ${primaryBtnCls}`}>
                {finishing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Importing {finishing}…
                  </>
                ) : (
                  'Finish setup'
                )}
              </button>
              <div className="mt-2 flex items-center justify-between">
                <button onClick={() => { setStep(1); setError(null); }} disabled={!!finishing} className="flex items-center gap-1 h-9 text-[12px] text-[#75757f] hover:text-[#9c9ca7] transition-colors disabled:opacity-40">
                  <ChevronLeft className="h-3.5 w-3.5" /> Back
                </button>
                <p className="text-[11px] text-[#60606a]">You can change your team anytime.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
