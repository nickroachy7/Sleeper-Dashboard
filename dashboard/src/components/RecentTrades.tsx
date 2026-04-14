import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { TradeCard, type TradeSide } from './TradeCard';
import type { Fairness } from '../types/domain';

interface TradePlayer {
  id: string;
  name: string;
  position: string;
  team: string | null;
  value: number;
}

interface TradeSideAssets {
  teamName: string;
  players: TradePlayer[];
  picks: any[];
  totalValue: number;
  adjustedValue?: number;
}

interface TradeWithTeams {
  id: string;
  date: string;
  teamAssets: Record<number, TradeSideAssets>;
  fairness?: Fairness;
  sides: TradeSideAssets[];
}

interface RecentTradesProps {
  trades: TradeWithTeams[];
}

export function RecentTrades({ trades }: RecentTradesProps) {
  if (trades.length === 0) return null;

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[10px] font-bold text-[#555555] tracking-[3px] uppercase mb-1">THE WIRE</p>
          <h2 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">Recent Trades</h2>
        </div>
        <Link to="/transactions" className="text-[11px] text-[#555555] hover:text-accent-400 transition-colors flex items-center gap-0.5">
          All Trades <ChevronRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="space-y-3">
        {trades.slice(0, 3).map((trade) => {
          // Convert to TradeCard sides format
          const sides: TradeSide[] = Object.entries(trade.teamAssets).map(([, assets]: [string, any]) => ({
            teamName: assets.teamName,
            players: assets.players.map((p: TradePlayer) => ({
              id: p.id,
              name: p.name,
              position: p.position,
              team: p.team,
              value: p.value,
            })),
            picks: assets.picks.map((pick: any) => ({
              season: pick.season,
              round: pick.round,
              value: pick.value || 0,
            })),
            totalValue: assets.totalValue,
            adjustedValue: assets.adjustedValue,
          }));

          return (
            <TradeCard
              key={trade.id}
              sides={sides}
              date={trade.date}
              fairness={trade.fairness}
            />
          );
        })}
      </div>
    </section>
  );
}
