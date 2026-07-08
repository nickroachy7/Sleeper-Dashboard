import { useState, useMemo, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';
import { type TradeAsset, useClickOutside, getPlayerImageUrl } from '../lib/trade-shared';

interface AssetDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  items: TradeAsset[];
  onSelect: (item: TradeAsset) => void;
  emptyMessage?: string;
}

export function AssetDropdown({
  isOpen,
  onClose,
  title,
  items,
  onSelect,
  emptyMessage = 'No items available',
}: AssetDropdownProps) {
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useClickOutside(dropdownRef, onClose);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Reset search when the dropdown closes (state-adjust-during-render pattern)
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (!isOpen) setSearch('');
  }

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
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      <div
        ref={dropdownRef}
        className="fixed z-50 left-4 right-4 top-1/2 -translate-y-1/2 max-w-md mx-auto bg-[#141419] border border-[#2e2e38] rounded-xl shadow-2xl overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-[#1f1f27] flex items-center justify-between">
          <span className="text-sm font-semibold text-white">{title}</span>
          <button onClick={onClose} className="p-1.5 hover:bg-[#1f1f27] rounded-lg transition-colors">
            <X className="h-4 w-4 text-[#80808c]" />
          </button>
        </div>

        <div className="p-3 border-b border-[#1f1f27]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#75757f]" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 text-sm bg-[#1b1b22] border border-[#2e2e38] rounded-lg text-white placeholder-[#75757f] focus:outline-none focus:border-accent-500/50 transition-colors"
            />
          </div>
        </div>

        <div className="max-h-80 overflow-y-auto overscroll-contain">
          {filteredItems.length === 0 ? (
            <div className="p-8 text-sm text-[#75757f] text-center">{emptyMessage}</div>
          ) : (
            <div className="divide-y divide-[#1b1b22]">
              {filteredItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    onSelect(item);
                    onClose();
                  }}
                  className="w-full px-4 py-3 hover:bg-[#1b1b22] transition-colors flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {item.type === 'player' ? (
                      <img
                        src={getPlayerImageUrl(item.id.replace('player-', ''))}
                        alt=""
                        className="w-5 h-5 rounded-full object-cover bg-[#1b1b22] flex-shrink-0"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-[#1b1b22] flex items-center justify-center flex-shrink-0">
                        <span className="text-[8px] font-bold text-[#75757f]">PK</span>
                      </div>
                    )}
                    <span className="text-sm text-white truncate">{item.name}</span>
                    {item.type === 'player' && (
                      <span className="text-[#60606a] text-[13px] shrink-0">
                        ({item.position || '?'}
                        {item.team ? `, ${item.team}` : ''})
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-semibold text-accent-400 tabular-nums shrink-0">
                    {item.value.toLocaleString()}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
