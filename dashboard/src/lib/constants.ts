// ── Pagination ────────────────────────────────────────────────────
export const ITEMS_PER_PAGE = 50;

// ── React Query ───────────────────────────────────────────────────
export const STALE_TIME_MS = 5 * 60 * 1000; // 5 minutes
export const SYNC_REFETCH_INTERVAL_MS = 30_000; // 30 seconds for sync/cron status

// ── Draft/Pick Constants ──────────────────────────────────────────
export const DRAFT_ROUNDS = [1, 2, 3, 4] as const;
export const FUTURE_YEARS = ['2025', '2026', '2027', '2028'] as const;

// ── Batch Sizes ───────────────────────────────────────────────────
export const SYNC_BATCH_SIZE = 100;
