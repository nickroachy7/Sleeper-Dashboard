/**
 * The active player-value source for the whole app — the community (YAP)
 * pipeline. This is our own user-driven data: trades and Rank 'Em votes feed it.
 *
 * The `player_values` / `player_value_history` tables can hold multiple sources
 * side by side (keyed by `source`). We've cut over to `'community'`; every value
 * read in the app flows through this constant, so the whole product reads the
 * same source. The legacy KeepTradeCut scrape (`sync-ktc-values`) still seeds
 * baseline data and can be retired once the community board is fully settled.
 */
export const VALUE_SOURCE: 'keeptradecut' | 'community' = 'community';
