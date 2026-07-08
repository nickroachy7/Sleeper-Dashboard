import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  /** Show "Showing X-Y of Z" label (default: true) */
  showItemCount?: boolean;
}

export function Pagination({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
  showItemCount = true,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  // Generate page numbers with ellipsis
  const pages: (number | string)[] = [];
  if (totalPages <= 5) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (currentPage > 3) pages.push('...');
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    for (let i = start; i <= end; i++) {
      if (!pages.includes(i)) pages.push(i);
    }
    if (currentPage < totalPages - 2) pages.push('...');
    if (!pages.includes(totalPages)) pages.push(totalPages);
  }

  return (
    <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
      {showItemCount && (
        <p className="text-xs text-[#75757f] order-2 sm:order-1">
          Showing {startItem}–{endItem} of {totalItems}
        </p>
      )}
      <div className={`flex items-center gap-1 ${showItemCount ? 'order-1 sm:order-2' : ''}`}>
        <button
          onClick={() => onPageChange(1)}
          disabled={currentPage === 1}
          className="p-2 rounded-md border border-[#1f1f27] bg-[#141419] hover:bg-[#1b1b22] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <svg className="h-4 w-4 text-[#9c9ca7]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
        </button>
        <button
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          className="p-2 rounded-md border border-[#1f1f27] bg-[#141419] hover:bg-[#1b1b22] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="h-4 w-4 text-[#9c9ca7]" />
        </button>

        <div className="hidden sm:flex items-center gap-1">
          {pages.map((page, idx) => {
            if (page === '...') {
              return <span key={`ellipsis-${idx}`} className="px-2 text-[#75757f] text-xs">…</span>;
            }
            return (
              <button
                key={page}
                onClick={() => onPageChange(page as number)}
                className={`min-w-[36px] h-9 px-3 rounded-md text-sm font-medium transition-colors ${
                  currentPage === page
                    ? 'bg-accent-500 text-white'
                    : 'bg-[#141419] border border-[#1f1f27] text-[#9c9ca7] hover:bg-[#1b1b22]'
                }`}
              >
                {page}
              </button>
            );
          })}
        </div>

        <span className="sm:hidden text-xs text-[#9c9ca7] min-w-[40px] text-center">
          {currentPage}/{totalPages}
        </span>

        <button
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          className="p-2 rounded-md border border-[#1f1f27] bg-[#141419] hover:bg-[#1b1b22] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight className="h-4 w-4 text-[#9c9ca7]" />
        </button>
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage === totalPages}
          className="p-2 rounded-md border border-[#1f1f27] bg-[#141419] hover:bg-[#1b1b22] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <svg className="h-4 w-4 text-[#9c9ca7]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
