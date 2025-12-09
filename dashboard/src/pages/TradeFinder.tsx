import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import {
  Search,
  Plus,
  X,
  ChevronDown,
  Loader2,
  Target,
  TrendingUp,
  TrendingDown,
  Sparkles,
  Check,
  RefreshCw,
  ArrowRight,
} from 'lucide-react';

// Types
interface Player {
  player_id: string;
  full_name: string;
  position: string;
  team: string | null;
}

interface PlayerValue {
  player_id: string;
  value: number;
  player: {
    full_name: string;
    position: string;
    team: string | null;
  };
}

interface PickValue {
  pick_year: string;
  pick_round: number;
  pick_tier: string | null;
  value: number;
}

interface Roster {
  roster_id: number;
  owner_id: string;
  players: string[];
  wins: number;
  losses: number;
  fpts: number;
  ownerName: string;
}

interface TradedPick {
  season: string;
  round: number;
  roster_id: number;
  owner_id: number;
}

interface TradeAsset {
  id: string;
  type: 'player' | 'pick';
  name: string;
  value: number;
  position?: string;
  team?: string | null;
  pickYear?: string;
  pickRound?: number;
  pickTier?: string;
  originalRosterId?: number;
}

interface TradeScenario {
  partnerRosterId: number;
  partnerName: string;
  theyGive: TradeAsset[];
  theyGiveTotal: number;
  youGive: TradeAsset[];
  youGiveTotal: number;
  difference: number;
  percentDiff: number;
  fairness: 'fair' | 'slight' | 'unfair';
}

// Position badge classes
const getPositionBadgeClass = (position: string): string => {
  switch (position) {
    case 'QB':
      return 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-500/30';
    case 'RB':
      return 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30';
    case 'WR':
      return 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30';
    case 'TE':
      return 'bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-500/30';
    case 'PICK':
      return 'bg-cyan-100 dark:bg-cyan-500/20 text-cyan-700 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-500/30';
    default:
      return 'bg-slate-100 dark:bg-zinc-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-zinc-600';
  }
};

function getProjectedPickTier(roster_id: number, rosters: Roster[]): string {
  const sortedRosters = [...rosters].sort((a, b) => {
    const winsA = a.wins || 0;
    const winsB = b.wins || 0;
    if (winsA !== winsB) return winsB - winsA;
    const fptsA = Number(a.fpts) || 0;
    const fptsB = Number(b.fpts) || 0;
    return fptsB - fptsA;
  });

  const standing = sortedRosters.findIndex((r) => r.roster_id === roster_id) + 1;
  const totalRosters = rosters.length;

  if (standing > (totalRosters * 2) / 3) return 'Early';
  if (standing > totalRosters / 3) return 'Mid';
  return 'Late';
}

function getPickDisplayName(year: string, round: number, tier: string): string {
  const roundSuffix = round === 1 ? '1st' : round === 2 ? '2nd' : round === 3 ? '3rd' : `${round}th`;
  return `${year} ${tier} ${roundSuffix}`;
}

function useClickOutside(ref: React.RefObject<HTMLElement | null>, callback: () => void) {
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        callback();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [ref, callback]);
}

// Asset Dropdown Modal
function AssetDropdown({
  isOpen,
  onClose,
  title,
  searchable = false,
  items,
  onSelect,
  emptyMessage = 'No items available',
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  searchable?: boolean;
  items: TradeAsset[];
  onSelect: (item: TradeAsset) => void;
  emptyMessage?: string;
}) {
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useClickOutside(dropdownRef, onClose);

  useEffect(() => {
    if (isOpen && searchable && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
    if (!isOpen) setSearch('');
  }, [isOpen, searchable]);

  const filteredItems = useMemo(() => {
    if (!search) return items;
    const query = search.toLowerCase();
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(query) ||
        item.position?.toLowerCase().includes(query) ||
        item.team?.toLowerCase().includes(query)
    );
  }, [items, search]);

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div
        ref={dropdownRef}
        className="fixed z-50 left-4 right-4 top-1/2 -translate-y-1/2 max-w-lg mx-auto bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl shadow-2xl overflow-hidden"
      >
        <div className="px-4 py-3 bg-slate-50 dark:bg-zinc-800/50 border-b border-slate-200 dark:border-zinc-700 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{title}</span>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-200 dark:hover:bg-zinc-700 rounded-lg transition-colors">
            <X className="h-4 w-4 text-slate-400" />
          </button>
        </div>

        {searchable && (
          <div className="p-3 border-b border-slate-200 dark:border-zinc-700">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 text-sm bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent transition-colors"
              />
            </div>
          </div>
        )}

        <div className="px-4 py-2 bg-slate-50 dark:bg-zinc-800/30 border-b border-slate-100 dark:border-zinc-800">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {filteredItems.length} {filteredItems.length === 1 ? 'asset' : 'assets'}
          </span>
        </div>

        <div className="max-h-96 overflow-y-auto overscroll-contain">
          {filteredItems.length === 0 ? (
            <div className="p-8 text-sm text-slate-500 text-center">{emptyMessage}</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 dark:bg-zinc-800/50 border-b border-slate-200 dark:border-zinc-700">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Asset</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Type</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                {filteredItems.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => { onSelect(item); onClose(); }}
                    className="hover:bg-slate-50 dark:hover:bg-zinc-800/50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <span className="text-sm text-slate-900 dark:text-white font-medium">{item.name}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-lg ${getPositionBadgeClass(item.type === 'player' ? (item.position || '') : 'PICK')}`}>
                        {item.type === 'player' ? item.position : 'PICK'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-bold text-accent-600 dark:text-accent-400">{item.value.toLocaleString()}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}

export function TradeFinder() {
  const [myRosterId, setMyRosterId] = useState<number>(0);
  const [wantedAssets, setWantedAssets] = useState<TradeAsset[]>([]);
  const [activeDropdown, setActiveDropdown] = useState<'player' | 'pick' | null>(null);
  const [scenarios, setScenarios] = useState<TradeScenario[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [tolerance, setTolerance] = useState<number>(15); // % tolerance for fair trades

  const { data: rosters, isLoading: rostersLoading } = useQuery({
    queryKey: ['rosters-finder'],
    queryFn: async () => {
      const { data: rostersData } = await supabase.from('rosters').select('*');
      const { data: users } = await supabase.from('users').select('*');
      if (!rostersData?.length) return [];
      return (rostersData as any[]).map((roster: any) => {
        const owner = (users as any[])?.find((u: any) => u.user_id === roster.owner_id);
        return { ...roster, ownerName: owner?.display_name || owner?.username || 'Unknown' };
      }) as Roster[];
    },
  });

  const { data: players } = useQuery({
    queryKey: ['players-finder'],
    queryFn: async () => {
      const { data } = await supabase.from('players').select('player_id, full_name, position, team');
      return (data as Player[]) || [];
    },
  });

  const { data: playerValues, isLoading: valuesLoading } = useQuery({
    queryKey: ['playerValues-finder'],
    queryFn: async () => {
      const { data } = await supabase
        .from('player_values')
        .select('player_id, value, player:players(full_name, position, team)');
      const valueMap = new Map<string, PlayerValue>();
      (data || []).forEach((pv: any) => {
        const player = Array.isArray(pv.player) ? pv.player[0] : pv.player;
        if (player) valueMap.set(pv.player_id, { ...pv, player });
      });
      return valueMap;
    },
  });

  const { data: pickValues, isLoading: picksLoading } = useQuery({
    queryKey: ['pickValues-finder'],
    queryFn: async () => {
      const { data } = await supabase.from('pick_values').select('pick_year, pick_round, pick_tier, value');
      return (data as PickValue[]) || [];
    },
  });

  const { data: tradedPicks } = useQuery({
    queryKey: ['tradedPicks-finder'],
    queryFn: async () => {
      const { data } = await supabase.from('traded_picks').select('season, round, roster_id, owner_id');
      return (data as TradedPick[]) || [];
    },
  });

  // Get all picks owned by a specific roster
  const getPicksOwnedByRoster = useCallback((rosterId: number): TradeAsset[] => {
    if (!rosters || !pickValues || !tradedPicks) return [];
    const picks: TradeAsset[] = [];
    const futureYears = ['2025', '2026', '2027', '2028'];
    const rounds = [1, 2, 3, 4];

    for (const year of futureYears) {
      for (const round of rounds) {
        for (const originalRoster of rosters) {
          const tradedPick = tradedPicks.find(
            (tp) => tp.season === year && tp.round === round && tp.roster_id === originalRoster.roster_id
          );
          const currentOwnerId = tradedPick ? tradedPick.owner_id : originalRoster.roster_id;
          if (currentOwnerId === rosterId) {
            const tier = getProjectedPickTier(originalRoster.roster_id, rosters);
            const pickValue = pickValues.find(
              (pv) => pv.pick_year === year && pv.pick_round === round && pv.pick_tier === tier
            );
            if (pickValue) {
              const pickName = getPickDisplayName(year, round, tier);
              const displayName = originalRoster.roster_id !== rosterId
                ? `${pickName} (via ${originalRoster.ownerName})`
                : pickName;
              picks.push({
                id: `pick-${year}-${round}-${originalRoster.roster_id}`,
                type: 'pick',
                name: displayName,
                value: pickValue.value,
                pickYear: year,
                pickRound: round,
                pickTier: tier,
                originalRosterId: originalRoster.roster_id,
              });
            }
          }
        }
      }
    }
    return picks.sort((a, b) => b.value - a.value);
  }, [rosters, pickValues, tradedPicks]);

  // Get all players owned by a specific roster
  const getPlayersOwnedByRoster = useCallback((rosterId: number): TradeAsset[] => {
    if (!rosters) return [];
    const roster = rosters.find((r) => r.roster_id === rosterId);
    if (!roster || !roster.players) return [];

    const playerAssets: TradeAsset[] = [];
    for (const playerId of roster.players) {
      const pv = playerValues?.get(playerId);
      if (pv && pv.player) {
        playerAssets.push({
          id: `player-${playerId}`,
          type: 'player',
          name: pv.player.full_name,
          value: pv.value,
          position: pv.player.position,
          team: pv.player.team,
        });
      } else {
        const player = players?.find((p) => p.player_id === playerId);
        if (player) {
          playerAssets.push({
            id: `player-${playerId}`,
            type: 'player',
            name: player.full_name,
            value: 0,
            position: player.position,
            team: player.team,
          });
        }
      }
    }
    return playerAssets.sort((a, b) => b.value !== a.value ? b.value - a.value : a.name.localeCompare(b.name));
  }, [rosters, playerValues, players]);

  // Get all assets from other teams (for selecting what you want)
  const getAllOtherTeamsAssets = useMemo(() => {
    if (!rosters || myRosterId === 0) return [];
    const assets: TradeAsset[] = [];
    
    for (const roster of rosters) {
      if (roster.roster_id === myRosterId) continue;
      
      // Add players
      const playerAssets = getPlayersOwnedByRoster(roster.roster_id);
      assets.push(...playerAssets);
      
      // Add picks
      const pickAssets = getPicksOwnedByRoster(roster.roster_id);
      assets.push(...pickAssets);
    }
    
    // Remove already selected assets
    const selectedIds = new Set(wantedAssets.map(a => a.id));
    return assets.filter(a => !selectedIds.has(a.id)).sort((a, b) => b.value - a.value);
  }, [rosters, myRosterId, wantedAssets, getPlayersOwnedByRoster, getPicksOwnedByRoster]);

  // Find which roster owns an asset
  const findAssetOwner = useCallback((asset: TradeAsset): number | null => {
    if (!rosters) return null;
    
    if (asset.type === 'player') {
      const playerId = asset.id.replace('player-', '');
      for (const roster of rosters) {
        if (roster.players?.includes(playerId)) {
          return roster.roster_id;
        }
      }
    } else if (asset.type === 'pick') {
      // Parse pick info from ID
      const parts = asset.id.split('-');
      const year = parts[1];
      const round = parseInt(parts[2]);
      const originalRosterId = parseInt(parts[3]);
      
      const tradedPick = tradedPicks?.find(
        (tp) => tp.season === year && tp.round === round && tp.roster_id === originalRosterId
      );
      return tradedPick ? tradedPick.owner_id : originalRosterId;
    }
    return null;
  }, [rosters, tradedPicks]);

  const addWantedAsset = useCallback((asset: TradeAsset) => {
    setWantedAssets(prev => [...prev, asset]);
    setScenarios([]); // Clear scenarios when assets change
  }, []);

  const removeWantedAsset = useCallback((assetId: string) => {
    setWantedAssets(prev => prev.filter(a => a.id !== assetId));
    setScenarios([]); // Clear scenarios when assets change
  }, []);

  const resetFinder = useCallback(() => {
    setWantedAssets([]);
    setScenarios([]);
  }, []);

  // Generate trade scenarios
  const generateScenarios = useCallback(() => {
    if (!rosters || myRosterId === 0 || wantedAssets.length === 0) return;
    
    setIsGenerating(true);
    
    // Group wanted assets by owner
    const assetsByOwner = new Map<number, TradeAsset[]>();
    for (const asset of wantedAssets) {
      const ownerId = findAssetOwner(asset);
      if (ownerId && ownerId !== myRosterId) {
        const existing = assetsByOwner.get(ownerId) || [];
        existing.push(asset);
        assetsByOwner.set(ownerId, existing);
      }
    }

    const myAssets = [
      ...getPlayersOwnedByRoster(myRosterId),
      ...getPicksOwnedByRoster(myRosterId),
    ].sort((a, b) => b.value - a.value);

    const generatedScenarios: TradeScenario[] = [];

    // For each trade partner
    for (const [partnerId, theirAssets] of assetsByOwner) {
      const partnerRoster = rosters.find(r => r.roster_id === partnerId);
      if (!partnerRoster) continue;

      const targetValue = theirAssets.reduce((sum, a) => sum + a.value, 0);
      const toleranceValue = targetValue * (tolerance / 100);
      const minValue = targetValue - toleranceValue;
      const maxValue = targetValue + toleranceValue;

      // Find combinations of my assets that match the value
      const findCombinations = (
        assets: TradeAsset[],
        _target: number,
        min: number,
        max: number,
        maxAssets: number = 4
      ): TradeAsset[][] => {
        const results: TradeAsset[][] = [];
        
        // Helper function for combination search
        const search = (index: number, current: TradeAsset[], currentValue: number) => {
          if (current.length > maxAssets) return;
          if (currentValue >= min && currentValue <= max) {
            results.push([...current]);
          }
          if (currentValue >= max || index >= assets.length) return;
          
          for (let i = index; i < assets.length && results.length < 10; i++) {
            current.push(assets[i]);
            search(i + 1, current, currentValue + assets[i].value);
            current.pop();
          }
        };

        search(0, [], 0);
        return results;
      };

      const combinations = findCombinations(myAssets, targetValue, minValue, maxValue);

      // Create scenarios from combinations
      for (const combo of combinations.slice(0, 3)) { // Limit to 3 scenarios per partner
        const myTotal = combo.reduce((sum, a) => sum + a.value, 0);
        const difference = Math.abs(myTotal - targetValue);
        const percentDiff = targetValue > 0 ? (difference / targetValue) * 100 : 0;

        let fairness: 'fair' | 'slight' | 'unfair';
        if (percentDiff <= 5) fairness = 'fair';
        else if (percentDiff <= 15) fairness = 'slight';
        else fairness = 'unfair';

        generatedScenarios.push({
          partnerRosterId: partnerId,
          partnerName: partnerRoster.ownerName,
          theyGive: theirAssets,
          theyGiveTotal: targetValue,
          youGive: combo,
          youGiveTotal: myTotal,
          difference,
          percentDiff,
          fairness,
        });
      }
    }

    // Sort by fairness (fair first) then by difference
    generatedScenarios.sort((a, b) => {
      const fairnessOrder = { fair: 0, slight: 1, unfair: 2 };
      if (fairnessOrder[a.fairness] !== fairnessOrder[b.fairness]) {
        return fairnessOrder[a.fairness] - fairnessOrder[b.fairness];
      }
      return a.difference - b.difference;
    });

    setScenarios(generatedScenarios);
    setIsGenerating(false);
  }, [rosters, myRosterId, wantedAssets, tolerance, findAssetOwner, getPlayersOwnedByRoster, getPicksOwnedByRoster]);

  const wantedTotal = useMemo(() => {
    return wantedAssets.reduce((sum, a) => sum + a.value, 0);
  }, [wantedAssets]);

  const isLoading = rostersLoading || valuesLoading || picksLoading;

  if (isLoading) {
    return (
      <div className="p-4 max-w-6xl mx-auto">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-accent-500" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-4 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Target className="h-5 w-5 text-accent-500" />
            Trade Finder
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">Select assets you want, get trade scenarios</p>
        </div>
        {wantedAssets.length > 0 && (
          <button
            onClick={resetFinder}
            className="flex items-center gap-1 px-2 py-1 text-slate-500 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800 rounded text-xs font-medium"
          >
            <RefreshCw className="h-3 w-3" />
            Reset
          </button>
        )}
      </div>

      {/* Step 1: Select Your Team */}
      <div className="mb-4 bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 bg-accent-500 text-white rounded-full flex items-center justify-center text-xs font-bold">1</div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Select Your Team</h2>
        </div>
        <div className="relative max-w-xs">
          <select
            value={myRosterId}
            onChange={(e) => {
              setMyRosterId(parseInt(e.target.value));
              setWantedAssets([]);
              setScenarios([]);
            }}
            className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg text-sm font-medium text-slate-900 dark:text-white appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent-500"
          >
            <option value={0}>Select your team...</option>
            {rosters?.map((r) => (
              <option key={r.roster_id} value={r.roster_id}>{r.ownerName}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
        </div>
      </div>

      {/* Step 2: Select Assets You Want */}
      {myRosterId > 0 && (
        <div className="mb-4 bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-accent-500 text-white rounded-full flex items-center justify-center text-xs font-bold">2</div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Select Assets You Want</h2>
            </div>
            {wantedAssets.length > 0 && (
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Total: <span className="text-accent-600 dark:text-accent-400 font-bold">{wantedTotal.toLocaleString()}</span>
              </span>
            )}
          </div>

          {/* Selected Assets */}
          {wantedAssets.length > 0 && (
            <div className="space-y-1.5 mb-3">
              {wantedAssets.map((asset) => {
                const ownerId = findAssetOwner(asset);
                const owner = rosters?.find(r => r.roster_id === ownerId);
                return (
                  <div
                    key={asset.id}
                    className="flex items-center justify-between px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${getPositionBadgeClass(asset.position || 'PICK')}`}>
                        {asset.type === 'player' ? asset.position : 'PICK'}
                      </span>
                      <span className="text-sm font-medium text-slate-900 dark:text-white truncate">{asset.name}</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">from {owner?.ownerName}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{asset.value.toLocaleString()}</span>
                      <button onClick={() => removeWantedAsset(asset.id)} className="p-0.5 hover:bg-emerald-200 dark:hover:bg-emerald-500/20 rounded transition-colors">
                        <X className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add Buttons */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <button
                onClick={() => setActiveDropdown(activeDropdown === 'player' ? null : 'player')}
                className="w-full flex items-center justify-center gap-1.5 py-2 border border-dashed border-slate-300 dark:border-zinc-600 rounded-lg text-xs text-slate-500 hover:border-accent-400 hover:text-accent-600 hover:bg-accent-50 dark:hover:bg-accent-500/5 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Player
              </button>
              <AssetDropdown
                isOpen={activeDropdown === 'player'}
                onClose={() => setActiveDropdown(null)}
                title="Select Player"
                searchable
                items={getAllOtherTeamsAssets.filter(a => a.type === 'player')}
                onSelect={addWantedAsset}
                emptyMessage="No players available"
              />
            </div>
            <div className="relative flex-1">
              <button
                onClick={() => setActiveDropdown(activeDropdown === 'pick' ? null : 'pick')}
                className="w-full flex items-center justify-center gap-1.5 py-2 border border-dashed border-slate-300 dark:border-zinc-600 rounded-lg text-xs text-slate-500 hover:border-purple-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-500/5 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Pick
              </button>
              <AssetDropdown
                isOpen={activeDropdown === 'pick'}
                onClose={() => setActiveDropdown(null)}
                title="Select Pick"
                items={getAllOtherTeamsAssets.filter(a => a.type === 'pick')}
                onSelect={addWantedAsset}
                emptyMessage="No picks available"
              />
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Generate Scenarios */}
      {wantedAssets.length > 0 && (
        <div className="mb-4 bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 bg-accent-500 text-white rounded-full flex items-center justify-center text-xs font-bold">3</div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Generate Trade Scenarios</h2>
          </div>

          <div className="flex flex-wrap items-center gap-3 mb-3">
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500 dark:text-slate-400">Value tolerance:</label>
              <select
                value={tolerance}
                onChange={(e) => setTolerance(parseInt(e.target.value))}
                className="px-2 py-1 text-xs bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-white"
              >
                <option value={5}>±5%</option>
                <option value={10}>±10%</option>
                <option value={15}>±15%</option>
                <option value={20}>±20%</option>
                <option value={25}>±25%</option>
              </select>
            </div>
          </div>

          <button
            onClick={generateScenarios}
            disabled={isGenerating}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-accent-500 hover:bg-accent-600 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {isGenerating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Find Trades
          </button>
        </div>
      )}

      {/* Results */}
      {scenarios.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Check className="h-4 w-4 text-emerald-500" />
            {scenarios.length} Trade Scenario{scenarios.length !== 1 ? 's' : ''} Found
          </h3>

          {scenarios.map((scenario, idx) => (
            <div
              key={idx}
              className={`bg-white dark:bg-zinc-900 rounded-xl border-2 overflow-hidden ${
                scenario.fairness === 'fair'
                  ? 'border-emerald-300 dark:border-emerald-500/50'
                  : scenario.fairness === 'slight'
                  ? 'border-blue-300 dark:border-blue-500/50'
                  : 'border-amber-300 dark:border-amber-500/50'
              }`}
            >
              {/* Header */}
              <div className={`px-4 py-2 flex items-center justify-between ${
                scenario.fairness === 'fair'
                  ? 'bg-emerald-50 dark:bg-emerald-500/10'
                  : scenario.fairness === 'slight'
                  ? 'bg-blue-50 dark:bg-blue-500/10'
                  : 'bg-amber-50 dark:bg-amber-500/10'
              }`}>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 text-xs font-bold rounded uppercase ${
                    scenario.fairness === 'fair'
                      ? 'bg-emerald-500 text-white'
                      : scenario.fairness === 'slight'
                      ? 'bg-blue-500 text-white'
                      : 'bg-amber-500 text-white'
                  }`}>
                    {scenario.fairness === 'fair' ? 'Fair' : scenario.fairness === 'slight' ? 'Close' : 'Stretch'}
                  </span>
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">
                    Trade with {scenario.partnerName}
                  </span>
                </div>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Diff: {scenario.difference.toLocaleString()} ({scenario.percentDiff.toFixed(1)}%)
                </span>
              </div>

              {/* Trade Content */}
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* You Get */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase">You Receive</span>
                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{scenario.theyGiveTotal.toLocaleString()}</span>
                  </div>
                  <div className="space-y-1">
                    {scenario.theyGive.map((asset) => (
                      <div key={asset.id} className="flex items-center justify-between px-2 py-1.5 bg-emerald-50 dark:bg-emerald-500/10 rounded-lg">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${getPositionBadgeClass(asset.position || 'PICK')}`}>
                            {asset.type === 'player' ? asset.position : 'PICK'}
                          </span>
                          <span className="text-xs font-medium text-slate-900 dark:text-white truncate">{asset.name}</span>
                        </div>
                        <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{asset.value.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Arrow (desktop) */}
                <div className="hidden sm:flex items-center justify-center absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                  <ArrowRight className="h-5 w-5 text-slate-300 dark:text-zinc-600 rotate-180" />
                </div>

                {/* You Give */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase">You Send</span>
                    <span className="text-xs font-bold text-red-600 dark:text-red-400">{scenario.youGiveTotal.toLocaleString()}</span>
                  </div>
                  <div className="space-y-1">
                    {scenario.youGive.map((asset) => (
                      <div key={asset.id} className="flex items-center justify-between px-2 py-1.5 bg-red-50 dark:bg-red-500/10 rounded-lg">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${getPositionBadgeClass(asset.position || 'PICK')}`}>
                            {asset.type === 'player' ? asset.position : 'PICK'}
                          </span>
                          <span className="text-xs font-medium text-slate-900 dark:text-white truncate">{asset.name}</span>
                        </div>
                        <span className="text-xs font-semibold text-red-600 dark:text-red-400">{asset.value.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Footer with value comparison */}
              <div className="px-4 py-2 bg-slate-50 dark:bg-zinc-800/50 border-t border-slate-200 dark:border-zinc-700 flex items-center justify-center gap-2">
                {scenario.youGiveTotal > scenario.theyGiveTotal ? (
                  <>
                    <TrendingDown className="h-4 w-4 text-red-500" />
                    <span className="text-xs text-slate-600 dark:text-slate-300">
                      You overpay by <span className="font-bold text-red-600 dark:text-red-400">{scenario.difference.toLocaleString()}</span>
                    </span>
                  </>
                ) : scenario.youGiveTotal < scenario.theyGiveTotal ? (
                  <>
                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                    <span className="text-xs text-slate-600 dark:text-slate-300">
                      You win by <span className="font-bold text-emerald-600 dark:text-emerald-400">{scenario.difference.toLocaleString()}</span>
                    </span>
                  </>
                ) : (
                  <span className="text-xs text-slate-500">Even trade</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* No Results */}
      {wantedAssets.length > 0 && scenarios.length === 0 && !isGenerating && (
        <div className="text-center py-8 text-slate-500 dark:text-slate-400">
          <Target className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Click "Find Trades" to generate scenarios</p>
        </div>
      )}
    </div>
  );
}

export default TradeFinder;
