import { TrendingUp, TrendingDown, ArrowRightLeft, Eye, Flame } from 'lucide-react';

// ── Design Lab (/lab) ────────────────────────────────────────────────────────
// A throwaway showcase for the ground-up visual rebuild. Renders the candidate
// "fantasy-app-style" player row + player card + feed card across two refined-
// monochrome variations on REAL top-player data, so we can pick a direction
// before touching any shared component. Not linked in nav; self-contained.

const IMG = (id: string) => `https://sleepercdn.com/content/nfl/players/${id}.jpg`;

interface P { id: string; name: string; pos: string; team: string; age: number; value: number; rank: number; trend: number; }
const PLAYERS: P[] = [
  { id: '4984', name: 'Josh Allen', pos: 'QB', team: 'BUF', age: 30, value: 9999, rank: 1, trend: 0 },
  { id: '9488', name: 'Jaxon Smith-Njigba', pos: 'WR', team: 'SEA', age: 24, value: 9781, rank: 2, trend: 120 },
  { id: '9509', name: 'Bijan Robinson', pos: 'RB', team: 'ATL', age: 24, value: 9569, rank: 3, trend: 60 },
  { id: '11604', name: 'Brock Bowers', pos: 'TE', team: 'LV', age: 23, value: 9360, rank: 4, trend: -80 },
  { id: '11560', name: 'Caleb Williams', pos: 'QB', team: 'CHI', age: 24, value: 9157, rank: 5, trend: -514 },
  { id: '6786', name: 'Nico Collins', pos: 'WR', team: 'HOU', age: 26, value: 8763, rank: 6, trend: 210 },
];

// Position hues — kept subtle in monochrome; used only as a small identity cue.
const POS_HUE: Record<string, string> = {
  QB: '#f87171', RB: '#60a5fa', WR: '#fbbf24', TE: '#2dd4bf', DEF: '#a78bfa',
};

function Avatar({ id, size = 44, radius = 12 }: { id: string; size?: number; radius?: number }) {
  return (
    <div
      className="overflow-hidden bg-white/[0.04] shrink-0 ring-1 ring-inset ring-white/10"
      style={{ width: size, height: size, borderRadius: radius }}
    >
      <img src={IMG(id)} alt="" className="w-full h-full object-cover object-top" onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
    </div>
  );
}

function PosChip({ pos }: { pos: string }) {
  const hue = POS_HUE[pos] ?? '#9c9ca7';
  return (
    <span
      className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold leading-none"
      style={{ color: hue, backgroundColor: `${hue}1f` }}
    >
      {pos}
    </span>
  );
}

function TrendPill({ trend }: { trend: number }) {
  if (!trend) return <span className="text-[11px] text-faint tabular-nums">—</span>;
  const up = trend > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums ${up ? 'text-emerald-400' : 'text-red-400'}`}>
      <Icon className="h-3 w-3" />{up ? '+' : ''}{trend}
    </span>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// VARIANT A — "Clean list, hero value"
// Fantasy-app staple: rank + headshot + name/pos, value as a right-aligned hero
// number with the trend beneath. Tight, scannable, mono-disciplined. Position
// is a small tinted chip (the only color). Whole row is one tap target.
// ══════════════════════════════════════════════════════════════════════════════
function RowA({ p }: { p: P }) {
  const medal = p.rank === 1 ? '#ffd700' : p.rank === 2 ? '#c0c0c0' : p.rank === 3 ? '#cd7f32' : null;
  return (
    <div className="flex items-center gap-3.5 px-4 py-3 hover:bg-white/[0.03] transition-colors cursor-pointer group">
      <span
        className="w-7 text-center font-display text-[15px] font-bold tabular-nums shrink-0"
        style={{ color: medal ?? '#6b6b76' }}
      >
        {p.rank}
      </span>
      <Avatar id={p.id} size={46} radius={14} />
      <div className="flex-1 min-w-0">
        <div className="text-[15px] font-semibold text-white truncate group-hover:text-white">{p.name}</div>
        <div className="flex items-center gap-1.5 mt-1">
          <PosChip pos={p.pos} />
          <span className="text-[11px] text-muted font-medium">{p.team}</span>
          <span className="text-line-strong">·</span>
          <span className="text-[11px] text-faint">{p.age} yo</span>
        </div>
      </div>
      <div className="flex flex-col items-end shrink-0">
        <span className="font-display text-[18px] font-bold text-white tabular-nums leading-none">{p.value.toLocaleString()}</span>
        <span className="mt-1"><TrendPill trend={p.trend} /></span>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// VARIANT B — "Depth-chart card row"
// Each player is a self-contained rounded tile with a left position-hue rail,
// a bigger headshot, and a value block with a mini progress meter (value vs
// #1). More card-like, more air, more of a "collectible" feel — Underdog-ish.
// ══════════════════════════════════════════════════════════════════════════════
function RowB({ p }: { p: P }) {
  const hue = POS_HUE[p.pos] ?? '#9c9ca7';
  const pct = Math.round((p.value / 9999) * 100);
  const medal = p.rank === 1 ? '#ffd700' : p.rank === 2 ? '#c0c0c0' : p.rank === 3 ? '#cd7f32' : null;
  return (
    <div className="relative flex items-center gap-3.5 rounded-2xl bg-white/[0.02] hover:bg-white/[0.04] ring-1 ring-inset ring-white/[0.06] pl-4 pr-4 py-3 cursor-pointer overflow-hidden transition-colors">
      {/* left position-hue rail */}
      <span className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: hue }} />
      <span className="w-6 text-center font-display text-[14px] font-extrabold tabular-nums shrink-0" style={{ color: medal ?? '#6b6b76' }}>{p.rank}</span>
      <Avatar id={p.id} size={52} radius={16} />
      <div className="flex-1 min-w-0">
        <div className="text-[15px] font-semibold text-white truncate">{p.name}</div>
        <div className="flex items-center gap-1.5 mt-1">
          <PosChip pos={p.pos} />
          <span className="text-[11px] text-muted font-medium">{p.team} · {p.age}</span>
        </div>
        {/* value-vs-#1 meter */}
        <div className="mt-2 h-1 w-full max-w-[160px] rounded-full bg-white/[0.06] overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: hue, opacity: 0.7 }} />
        </div>
      </div>
      <div className="flex flex-col items-end shrink-0">
        <span className="font-display text-[19px] font-bold text-white tabular-nums leading-none">{p.value.toLocaleString()}</span>
        <span className="mt-1.5"><TrendPill trend={p.trend} /></span>
      </div>
    </div>
  );
}

// Player hero card (detail-page header candidate) for each variant.
function PlayerCardA({ p }: { p: P }) {
  return (
    <div className="rounded-2xl bg-gradient-to-b from-white/[0.06] to-transparent ring-1 ring-inset ring-white/10 p-5">
      <div className="flex items-center gap-4">
        <Avatar id={p.id} size={72} radius={20} />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-2xl font-bold text-white tracking-tight">{p.name}</h2>
          <div className="flex items-center gap-2 mt-1.5">
            <PosChip pos={p.pos} />
            <span className="text-[13px] text-muted">{p.team} · {p.age} yrs</span>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <button className="h-9 px-3 rounded-xl bg-white/[0.06] ring-1 ring-inset ring-white/10 text-[13px] font-semibold text-white flex items-center gap-1.5"><Eye className="h-4 w-4" /> Watch</button>
          <button className="h-9 px-3 rounded-xl bg-white text-[#0b0b0f] text-[13px] font-bold flex items-center gap-1.5"><ArrowRightLeft className="h-4 w-4" /> Trade</button>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 mt-5">
        {[['Value', p.value.toLocaleString()], ['Rank', `#${p.rank}`], ['30-day', p.trend ? `${p.trend > 0 ? '+' : ''}${p.trend}` : 'Flat']].map(([l, v]) => (
          <div key={l} className="rounded-xl bg-white/[0.03] ring-1 ring-inset ring-white/[0.06] px-4 py-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-faint">{l}</div>
            <div className="font-display text-[22px] font-bold text-white tabular-nums leading-none mt-1.5">{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-faint mb-3">{title}</p>
      {children}
    </div>
  );
}

export default function DesignLab() {
  return (
    <div className="min-h-dvh p-4 sm:p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="font-display text-3xl font-bold text-white tracking-tight">Design Lab</h1>
        <p className="text-[13px] text-muted mt-1 mb-8">Ground-up rebuild candidates · fantasy-app style · refined monochrome · real data</p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* VARIANT A */}
          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <span className="h-5 w-1.5 rounded-full bg-white" />
              <h2 className="font-display text-lg font-bold text-white">Variant A · Clean list, hero value</h2>
            </div>
            <Section title="Ranking list">
              <div className="rounded-2xl bg-[#141419] ring-1 ring-inset ring-white/[0.06] overflow-hidden divide-y divide-white/[0.05]">
                {PLAYERS.map((p) => <RowA key={p.id} p={p} />)}
              </div>
            </Section>
            <Section title="Player card">
              <PlayerCardA p={PLAYERS[4]} />
            </Section>
          </div>

          {/* VARIANT B */}
          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <span className="h-5 w-1.5 rounded-full bg-white" />
              <h2 className="font-display text-lg font-bold text-white">Variant B · Depth-chart card rows</h2>
            </div>
            <Section title="Ranking list">
              <div className="space-y-2">
                {PLAYERS.map((p) => <RowB key={p.id} p={p} />)}
              </div>
            </Section>
            <Section title="Player card">
              <div className="rounded-2xl bg-[#141419] ring-1 ring-inset ring-white/[0.06] p-5 relative overflow-hidden">
                <span className="absolute left-0 top-0 bottom-0 w-1.5" style={{ backgroundColor: POS_HUE[PLAYERS[4].pos] }} />
                <div className="flex items-center gap-4">
                  <Avatar id={PLAYERS[4].id} size={80} radius={22} />
                  <div className="min-w-0 flex-1">
                    <h2 className="font-display text-2xl font-bold text-white tracking-tight">{PLAYERS[4].name}</h2>
                    <div className="flex items-center gap-2 mt-1.5"><PosChip pos={PLAYERS[4].pos} /><span className="text-[13px] text-muted">{PLAYERS[4].team} · {PLAYERS[4].age} yrs</span></div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-display text-3xl font-bold text-white tabular-nums leading-none">{PLAYERS[4].value.toLocaleString()}</div>
                    <div className="text-[12px] text-faint mt-1">#{PLAYERS[4].rank} overall</div>
                  </div>
                </div>
              </div>
            </Section>
          </div>
        </div>

        {/* Feed card candidate (shared style, below both) */}
        <div className="mt-10">
          <Section title="Feed · trade card">
            <div className="max-w-xl rounded-2xl bg-[#141419] ring-1 ring-inset ring-white/[0.06] overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-white/[0.03] border-b border-white/[0.05]">
                <Flame className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-white">Trade</span>
                <span className="text-[11px] text-faint ml-auto">Jul 23 · Dynasty Reloaded</span>
              </div>
              {[['Travy Patty', [PLAYERS[2], PLAYERS[5]], 'W'], ['Darth Benjamin', [PLAYERS[4]], 'L']].map(([team, ps, res], i) => (
                <div key={i as number}>
                  <div className="flex items-center gap-2.5 px-4 py-2 bg-white/[0.02]">
                    <span className="text-[13px] font-bold text-white flex-1">{team as string}</span>
                    <span className={`w-5 h-5 rounded-md text-[11px] font-extrabold flex items-center justify-center ${res === 'W' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>{res as string}</span>
                  </div>
                  {(ps as P[]).map((p) => <RowA key={p.id} p={p} />)}
                </div>
              ))}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
