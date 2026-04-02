import { TrendingUp, TrendingDown, type LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  trend?: number;
  trendLabel?: string;
  icon?: LucideIcon;
  accentColor?: 'green' | 'gold' | 'blue' | 'purple' | 'default';
}

const accentBorderColors: Record<string, string> = {
  green: 'border-l-emerald-500',
  gold: 'border-l-amber-400',
  blue: 'border-l-blue-500',
  purple: 'border-l-purple-500',
  default: 'border-l-[#2a2a2a]',
};

export function StatCard({ label, value, trend, trendLabel, icon: Icon, accentColor = 'default' }: StatCardProps) {
  return (
    <div className={`bg-[#0a0a0a] rounded-xl p-4 border-l-[3px] ${accentBorderColors[accentColor]} animate-smooth hover:bg-[#0d0d0d]`}>
      <div className="flex items-start justify-between mb-2">
        <span className="text-[10px] font-bold text-[#555555] tracking-[2px] uppercase leading-none">
          {label}
        </span>
        {Icon && (
          <Icon className="h-3.5 w-3.5 text-[#333333]" />
        )}
      </div>
      <div className="flex items-end justify-between gap-2">
        <span className="text-2xl font-extrabold text-white tracking-tight leading-none">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </span>
        {trend !== undefined && trend !== 0 && (
          <div className={`flex items-center gap-0.5 ${trend > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {trend > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            <span className="text-[11px] font-semibold">{trendLabel || (trend > 0 ? `+${trend}` : trend)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
