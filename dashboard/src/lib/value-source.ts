/**
 * The active player-value source for the whole app.
 *
 * The `player_values` / `player_value_history` tables can hold multiple sources
 * side by side (keyed by `source`). Today that's KeepTradeCut; the community
 * pipeline writes rows tagged `'community'` in parallel without disturbing KTC.
 *
 * CUTOVER: once the community board is seeded and validated, change this one
 * constant to `'community'`. Every value read in the app flows through it, so
 * the whole product switches over atomically — no other code changes needed.
 * After cutover, the KTC scrape + sync-ktc-values function can be deleted.
 *
 * The dedicated KTC page (pages/KTCValues.tsx) intentionally does NOT use this
 * constant — it always reads KTC so it can serve as a comparison during the
 * transition. Remove that page at cutover if you no longer want it.
 */
export const VALUE_SOURCE: 'keeptradecut' | 'community' = 'community';
