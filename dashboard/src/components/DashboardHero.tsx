import { Trophy, Flame, Coins, ArrowLeftRight } from 'lucide-react';

interface PulseStat {
  icon: typeof Trophy;
  label: string;
  value: string;
  sub?: string;
  accent: string;
}

interface DashboardHeroProps {
  leagueName: string;
  season: string;
  totalRosters: number;
  status?: string | null;
  topTeam?: { name: string; value: number } | null;
  topAsset?: { name: string; value: number } | null;
  leagueValue?: number;
  tradeCount?: number;
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1000).toFixed(0)}K`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}

const STATUS_LABEL: Record<string, string> = {
  in_season: 'In Season',
  drafting: 'Drafting',
  complete: 'Complete',
  pre_draft: 'Pre-Draft',
};

export function DashboardHero({
  leagueName,
  season,
  totalRosters,
  status,
  topTeam,
  topAsset,
  leagueValue,
  tradeCount,
}: DashboardHeroProps) {
  const stats: PulseStat[] = [];

  if (topTeam) {
    stats.push({
      icon: Trophy,
      label: 'Top Team',
      value: topTeam.name,
      sub: `${topTeam.value.toLocaleString()} pts`,
      accent: '#ffd700',
    });
  }
  if (topAsset) {
    stats.push({
      icon: Flame,
      label: 'Top Asset',
      value: topAsset.name,
      sub: `${topAsset.value.toLocaleString()} KTC`,
      accent: '#f97316',
    });
  }
  if (leagueValue) {
    stats.push({
      icon: Coins,
      label: 'League Value',
      value: formatCompact(leagueValue),
      sub: `${totalRosters} rosters`,
      accent: '#22c55e',
    });
  }
  if (tradeCount !== undefined) {
    stats.push({
      icon: ArrowLeftRight,
      label: 'Recent Trades',
      value: String(tradeCount),
      sub: 'last activity',
      accent: '#8b5cf6',
    });
  }

  return (
    <section className="relative overflow-hidden rounded-2xl border border-[#22222b] bg-gradient-to-br from-[#16161c] via-[#141419] to-[#111116]">
      {/* Ambient accent glow */}
      <div className="pointer-events-none absolute -top-24 -right-16 h-56 w-56 rounded-full bg-accent-500/10 blur-3xl" />

      <div className="relative px-5 py-5 sm:px-6 sm:py-6">
        {/* Identity */}
        <div className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
          <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent-500">
            {status ? (STATUS_LABEL[status] ?? status) : 'League HQ'}
          </span>
        </div>
        <h1 className="font-display text-2xl sm:text-[32px] font-bold text-white tracking-tight leading-tight">
          {leagueName}
        </h1>
        <p className="text-[13px] text-[#9c9ca7] mt-0.5">
          {season} Dynasty Season · {totalRosters} Teams
        </p>

        {/* Pulse stats */}
        {stats.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mt-5">
            {stats.map((s) => {
              const Icon = s.icon;
              return (
                <div
                  key={s.label}
                  className="rounded-xl border border-[#22222b] bg-[#101015]/60 px-3.5 py-3 backdrop-blur-sm"
                >
                  <div className="flex items-center gap-1.5 mb-2">
                    <Icon className="h-3.5 w-3.5" style={{ color: s.accent }} />
                    <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#75757f]">
                      {s.label}
                    </span>
                  </div>
                  <p className="font-display text-[15px] font-bold text-white truncate leading-tight">
                    {s.value}
                  </p>
                  {s.sub && (
                    <p className="text-[11px] text-[#75757f] tabular-nums mt-0.5 truncate">{s.sub}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
