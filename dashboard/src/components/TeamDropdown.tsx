import { useRef } from 'react';
import { X } from 'lucide-react';
import { type Roster, useClickOutside, getTeamDisplayName } from '../lib/trade-shared';

interface TeamDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  rosters: Roster[];
  /** Roster IDs to exclude from the list */
  excludeRosterIds?: number[];
  onSelect: (roster: Roster) => void;
  title?: string;
}

export function TeamDropdown({
  isOpen,
  onClose,
  rosters,
  excludeRosterIds = [],
  onSelect,
  title = 'Select Team',
}: TeamDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  useClickOutside(dropdownRef, onClose);

  if (!isOpen) return null;

  const filteredRosters = rosters.filter((r) => !excludeRosterIds.includes(r.roster_id));

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      <div
        ref={dropdownRef}
        className="fixed z-50 left-4 right-4 top-1/2 -translate-y-1/2 max-w-sm mx-auto bg-[#0a0a0a] border border-[#222222] rounded-xl shadow-2xl overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-[#151515] flex items-center justify-between">
          <span className="text-sm font-semibold text-white">{title}</span>
          <button onClick={onClose} className="p-1.5 hover:bg-[#151515] rounded-lg transition-colors">
            <X className="h-4 w-4 text-[#666666]" />
          </button>
        </div>
        <div className="max-h-80 overflow-y-auto overscroll-contain divide-y divide-[#111111]">
          {filteredRosters.map((roster) => (
            <button
              key={roster.roster_id}
              onClick={() => {
                onSelect(roster);
                onClose();
              }}
              className="w-full px-4 py-3 text-left hover:bg-[#111111] transition-colors flex items-center justify-between"
            >
              <span className="text-sm text-white font-medium">{getTeamDisplayName(roster)}</span>
              <span className="text-xs text-[#555555] tabular-nums">
                {roster.wins}-{roster.losses}
              </span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
