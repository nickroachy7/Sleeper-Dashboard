import { ArrowRightLeft, Clock } from 'lucide-react';

interface Player {
  player_id: string;
  full_name: string;
  position: string;
  team: string | null;
}

interface TradeEmbedProps {
  transaction: {
    transaction_id: string;
    created?: number;
    status?: string;
    roster_ids?: number[];
    adds?: Record<string, number>;
    drops?: Record<string, number>;
    draft_picks?: any[];
  };
  teams: { rosterId: number; teamName: string }[];
  players: Map<string, Player>;
  playerValues: Map<string, number>;
  rosterToDraftSlot?: Map<number, number>;
  draftPickResults?: Map<string, string>;
  compact?: boolean;
}

const positionColors: Record<string, string> = {
  QB: 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400',
  RB: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400',
  WR: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400',
  TE: 'bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-400',
  K: 'bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-400',
  DEF: 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400',
};

export function TradeEmbed({
  transaction,
  teams,
  players,
  playerValues,
  rosterToDraftSlot,
  draftPickResults,
  compact = false,
}: TradeEmbedProps) {
  const tx = transaction;
  
  const getPlayer = (playerId: string): Player | undefined => players.get(playerId);
  const getPlayerValue = (playerId: string): number => playerValues.get(playerId) || 0;

  const getPickResult = (pick: any): { playerId: string; player: Player | undefined } | null => {
    if (!draftPickResults || !rosterToDraftSlot) return null;
    const draftSlot = rosterToDraftSlot.get(pick.roster_id);
    if (!draftSlot) return null;
    const key = `${pick.season}-${pick.round}-${draftSlot}`;
    const playerId = draftPickResults.get(key);
    if (!playerId) return null;
    return { playerId, player: getPlayer(playerId) };
  };

  // Get assets for each team
  const teamAssets: Record<number, { players: string[]; picks: any[]; value: number }> = {};
  teams.forEach((team) => {
    teamAssets[team.rosterId] = { players: [], picks: [], value: 0 };
  });

  if (tx.adds) {
    Object.entries(tx.adds).forEach(([playerId, rosterId]) => {
      if (teamAssets[rosterId]) {
        teamAssets[rosterId].players.push(playerId);
        teamAssets[rosterId].value += getPlayerValue(playerId);
      }
    });
  }

  if (tx.draft_picks && Array.isArray(tx.draft_picks)) {
    tx.draft_picks.forEach((pick: any) => {
      if (pick.owner_id && teamAssets[pick.owner_id]) {
        teamAssets[pick.owner_id].picks.push(pick);
        const pickBaseValue = pick.round === 1 ? 5000 : pick.round === 2 ? 2000 : pick.round === 3 ? 800 : 400;
        teamAssets[pick.owner_id].value += pickBaseValue;
      }
    });
  }

  if (teams.length < 2) return null;

  const team1 = teams[0];
  const team2 = teams[1];
  const team1Assets = teamAssets[team1?.rosterId] || { players: [], picks: [], value: 0 };
  const team2Assets = teamAssets[team2?.rosterId] || { players: [], picks: [], value: 0 };

  const formatDate = () => {
    const timestamp = tx.created;
    const date = timestamp ? new Date(timestamp) : new Date();
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const renderAssets = (assets: typeof team1Assets, teamName: string) => (
    <div className={compact ? 'p-3' : 'p-4 sm:p-5'}>
      <div className="mb-2 sm:mb-3">
        <h4 className={`${compact ? 'text-xs' : 'text-sm'} font-bold text-slate-900 dark:text-white`}>{teamName}</h4>
        <span className="text-[10px] sm:text-xs text-emerald-600 dark:text-emerald-400 font-medium">RECEIVES</span>
      </div>
      <div className="space-y-1.5 sm:space-y-2">
        {assets.players.map((playerId) => {
          const player = getPlayer(playerId);
          const value = getPlayerValue(playerId);
          const posClass = positionColors[player?.position || ''] || 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-400';
          return (
            <div key={playerId} className="flex items-center justify-between py-1.5 px-2 sm:px-3 bg-slate-50 dark:bg-zinc-800/50 rounded-lg">
              <div className="flex items-center gap-1.5 sm:gap-2">
                {player?.position && (
                  <span className={`px-1 sm:px-1.5 py-0.5 rounded text-[10px] sm:text-xs font-bold ${posClass}`}>
                    {player.position}
                  </span>
                )}
                <span className={`font-medium text-slate-900 dark:text-white ${compact ? 'text-xs' : 'text-sm'}`}>
                  {player?.full_name || playerId}
                </span>
              </div>
              <span className={`${compact ? 'text-xs' : 'text-sm'} font-semibold text-slate-600 dark:text-slate-400 tabular-nums`}>
                {value > 0 ? value.toLocaleString() : '—'}
              </span>
            </div>
          );
        })}
        {assets.picks.map((pick, idx) => {
          const pickResult = getPickResult(pick);
          return (
            <div key={idx} className="flex items-center justify-between py-1.5 px-2 sm:px-3 bg-purple-50 dark:bg-purple-500/10 rounded-lg">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="px-1 sm:px-1.5 py-0.5 rounded text-[10px] sm:text-xs font-bold bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400">
                  PICK
                </span>
                <div className="flex flex-col">
                  <span className={`font-medium text-slate-900 dark:text-white ${compact ? 'text-xs' : 'text-sm'}`}>
                    {pick.season} Round {pick.round}
                  </span>
                  {pickResult && (
                    <span className="text-[10px] sm:text-xs text-purple-600 dark:text-purple-400">
                      → {pickResult.player?.full_name || pickResult.playerId}
                    </span>
                  )}
                </div>
              </div>
              {pickResult && (
                <span className={`${compact ? 'text-xs' : 'text-sm'} font-semibold text-slate-600 dark:text-slate-400 tabular-nums`}>
                  {getPlayerValue(pickResult.playerId) > 0 ? getPlayerValue(pickResult.playerId).toLocaleString() : '—'}
                </span>
              )}
            </div>
          );
        })}
        {assets.players.length === 0 && assets.picks.length === 0 && (
          <p className="text-xs text-slate-400 dark:text-slate-500 italic">No assets received</p>
        )}
      </div>
      <div className={`mt-auto pt-2 sm:pt-3 border-t border-slate-100 dark:border-zinc-800 ${compact ? 'mt-2' : 'mt-3'}`}>
        <div className="flex items-center justify-between">
          <span className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 font-medium">Total Value</span>
          <span className={`${compact ? 'text-base' : 'text-lg'} font-bold text-slate-900 dark:text-white tabular-nums`}>
            {assets.value.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 shadow-sm dark:shadow-none overflow-hidden my-4">
      <div className={`${compact ? 'px-3 py-2' : 'px-4 sm:px-6 py-3 sm:py-4'} border-b border-slate-100 dark:border-zinc-800 bg-purple-50/50 dark:bg-purple-500/5`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className={`${compact ? 'p-1.5' : 'p-2'} bg-purple-100 dark:bg-purple-500/20 rounded-lg`}>
              <ArrowRightLeft className={`${compact ? 'h-4 w-4' : 'h-5 w-5'} text-purple-600 dark:text-purple-400`} />
            </div>
            <div>
              <h3 className={`font-semibold ${compact ? 'text-sm' : 'text-base'} text-slate-900 dark:text-white`}>Trade</h3>
              <div className="flex items-center gap-1.5 text-[10px] sm:text-xs text-slate-500 dark:text-slate-400">
                <Clock className="h-3 w-3" />
                {formatDate()}
              </div>
            </div>
          </div>
          <span className={`px-2 py-1 rounded-md text-xs font-medium ${
            tx.status === 'complete'
              ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400'
              : 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400'
          }`}>
            {tx.status}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-100 dark:divide-zinc-800">
        {renderAssets(team1Assets, team1?.teamName || 'Team 1')}
        {renderAssets(team2Assets, team2?.teamName || 'Team 2')}
      </div>
    </div>
  );
}
