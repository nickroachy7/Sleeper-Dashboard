import { CHART_POS as POS, CHART_NEG as NEG } from './theme';
import type { TeamAnalytics, LineupEfficiency } from '../../hooks/detail';

const fmt = (v: number) => Math.round(v).toLocaleString();
const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

/**
 * Analytical views of a team, each answering a manager's real question:
 *  1. Contention Window — roster value by age (prime now vs young/old).
 *  2. Coach Rating — actual lineup output vs the best they could have set.
 *  3. Scoring & Luck — actual record vs all-play (schedule-luck-neutral) record.
 */
export function TeamAnalyticsCharts({ data, lineup }: { data: TeamAnalytics; lineup?: LineupEfficiency | null }) {
  return (
    <div className="space-y-4">
      <ContentionWindow data={data} />
      {lineup && <CoachRating data={lineup} />}
      <ScoringLuck data={data} />
    </div>
  );
}

// ── Coach Rating: actual lineup output vs optimal ───────────────────
function CoachRating({ data }: { data: LineupEfficiency }) {
  const { weeks, efficiency, pointsLeft, rank, teams, leagueAvgEfficiency, season } = data;
  const maxOptimal = Math.max(1, ...weeks.map((w) => w.optimal));
  const avgLeft = weeks.length ? pointsLeft / weeks.length : 0;
  const beatsAvg = efficiency >= leagueAvgEfficiency;

  return (
    <Card
      title="Coach Rating"
      sub={`How much of your roster's ceiling you actually started in ${season}. The gap on each bar is points left on your bench.`}
    >
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 mb-4">
        <div>
          <span className="font-display text-2xl font-bold text-white tabular-nums">{Math.round(efficiency * 100)}%</span>
          <span className="ml-2 text-[12px] text-[#75757f]">of ceiling started</span>
        </div>
        <span className="text-[11px] font-semibold text-accent-400">
          {ordinal(rank)} of {teams} lineup setters
        </span>
        <span className={`text-[11px] font-semibold ${beatsAvg ? 'text-accent-400' : 'text-amber-400/90'}`}>
          {beatsAvg ? '▲' : '▼'} {Math.abs(Math.round((efficiency - leagueAvgEfficiency) * 100))} pts vs league avg
        </span>
        <span className="text-[11px] text-[#60606a] tabular-nums">
          {fmt(pointsLeft)} left on bench · {avgLeft.toFixed(1)}/wk
        </span>
      </div>

      {/* Per-week: muted bar = your best possible, green fill = what you started */}
      <div className="flex items-end gap-1.5" style={{ height: 150 }}>
        {weeks.map((w) => {
          const eff = w.optimal > 0 ? w.actual / w.optimal : 1;
          const trackH = Math.max(3, (w.optimal / maxOptimal) * 130);
          const fillH = trackH * Math.min(eff, 1);
          return (
            <div key={w.week} className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0 h-full">
              <div
                className="w-full max-w-[26px] rounded-t bg-[#3a3a44] relative flex items-end"
                style={{ height: trackH }}
                title={`Week ${w.week}: started ${w.actual.toFixed(1)} of ${w.optimal.toFixed(1)} (${Math.round(eff * 100)}%)`}
              >
                <div className="w-full rounded-t" style={{ height: fillH, backgroundColor: POS, opacity: 0.9 }} />
              </div>
              <span className="text-[9px] text-[#60606a] tabular-nums leading-none">{w.week}</span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-3 text-[10px] text-[#75757f] mt-2">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: POS }} />Started</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[#3a3a44]" />Bench ceiling</span>
      </div>
    </Card>
  );
}

function Card({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <section className="bg-[#141419] rounded-2xl p-4 sm:p-5 border border-[#22222b]">
      <p className="text-[11px] font-bold text-accent-500 tracking-[0.18em] uppercase mb-0.5">{title}</p>
      <p className="text-[10px] text-[#75757f] mb-4">{sub}</p>
      {children}
    </section>
  );
}

// ── 1. Contention Window: value by age ──────────────────────────────
function ContentionWindow({ data }: { data: TeamAnalytics }) {
  const { ageBuckets, weightedAge, leagueWeightedAge } = data;
  const max = Math.max(1, ...ageBuckets.map((b) => b.value));
  // Prime dynasty window ~22-26: color those bars accent, others muted.
  const isPrime = (age: number) => age >= 22 && age <= 26;
  const primeValue = ageBuckets.filter((b) => isPrime(b.age)).reduce((s, b) => s + b.value, 0);
  const totalValue = ageBuckets.reduce((s, b) => s + b.value, 0);
  const primePct = totalValue ? Math.round((primeValue / totalValue) * 100) : 0;
  const younger = weightedAge < leagueWeightedAge;

  return (
    <Card
      title="Contention Window"
      sub="Where your roster's value sits by player age. Peaks at 22–26 (dynasty prime) mean win-now; a young skew means building."
    >
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 mb-4">
        <div>
          <span className="font-display text-2xl font-bold text-white tabular-nums">{weightedAge.toFixed(1)}</span>
          <span className="ml-2 text-[12px] text-[#75757f]">avg age (value-weighted)</span>
        </div>
        <span className={`text-[11px] font-semibold ${younger ? 'text-accent-400' : 'text-amber-400/90'}`}>
          {younger ? '▼' : '▲'} {Math.abs(weightedAge - leagueWeightedAge).toFixed(1)} yr {younger ? 'younger' : 'older'} than league
        </span>
        <span className="text-[11px] text-[#60606a]">{primePct}% of value in prime (22–26)</span>
      </div>

      <div className="flex items-end gap-1.5" style={{ height: 176 }}>
        {ageBuckets.map((b) => (
          <div key={b.age} className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0 h-full">
            <span className="text-[8px] text-[#60606a] tabular-nums leading-none">
              {b.value >= 1000 ? `${Math.round(b.value / 1000)}k` : ''}
            </span>
            <div
              className="w-full max-w-[26px] rounded-t transition-all"
              style={{
                height: Math.max(3, (b.value / max) * 150),
                backgroundColor: isPrime(b.age) ? POS : '#3a3a44',
              }}
              title={`Age ${b.age}: ${fmt(b.value)}`}
            />
            <span className="text-[9px] text-[#60606a] tabular-nums leading-none">{b.age}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── 2. Scoring & Luck: actual vs all-play record ────────────────────
function ScoringLuck({ data }: { data: TeamAnalytics }) {
  const { scoring } = data;
  if (!scoring.length) {
    return (
      <Card title="Scoring & Luck" sub="Weekly scoring and how much of your record was skill vs schedule luck.">
        <p className="text-[12px] text-[#60606a] py-6 text-center">Not enough completed weeks yet.</p>
      </Card>
    );
  }
  return (
    <Card
      title="Scoring & Luck"
      sub="Actual win% vs all-play win% (how you'd do against everyone each week). All-play far above actual = unlucky; below = lucky."
    >
      <div className="space-y-3">
        {scoring.map((s) => {
          const actualPct = s.games ? s.wins / s.games : 0;
          const luck = s.allPlayWinPct - actualPct; // + = unlucky, − = lucky
          return (
            <div key={s.season}>
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-[12px] font-semibold text-white">{s.season}</span>
                <span className="text-[11px] text-[#75757f] tabular-nums">
                  {s.wins}-{s.losses} · {s.avg.toFixed(0)} pts/wk · ±{s.stdev.toFixed(0)}
                </span>
              </div>
              {/* Dual bar: actual (solid) over all-play (muted track) */}
              <div className="relative h-5 rounded-md bg-[#1b1b22] overflow-hidden">
                <div className="absolute inset-y-0 left-0 bg-[#3a3a44]" style={{ width: `${s.allPlayWinPct * 100}%` }} />
                <div className="absolute inset-y-0 left-0 rounded-md" style={{ width: `${actualPct * 100}%`, backgroundColor: POS, opacity: 0.85 }} />
                <div className="absolute inset-0 flex items-center justify-between px-2 text-[9px] font-semibold">
                  <span className="text-white">{Math.round(actualPct * 100)}% actual</span>
                  <span className="text-[#9c9ca7]">{Math.round(s.allPlayWinPct * 100)}% all-play</span>
                </div>
              </div>
              <p className="text-[9px] mt-0.5 tabular-nums" style={{ color: Math.abs(luck) < 0.06 ? '#60606a' : luck > 0 ? NEG : POS }}>
                {Math.abs(luck) < 0.06 ? 'record matched performance'
                  : luck > 0 ? `unlucky — deserved ~${Math.round(s.allPlayWinPct * s.games)} wins`
                  : `lucky — performance said ~${Math.round(s.allPlayWinPct * s.games)} wins`}
              </p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
