# Community value system

A KTC-free player value pipeline. Values are generated from **facts** (nflverse
production, age, draft capital) plus **your own crowd** (real trades, calculator
checks, pairwise votes) — nothing proprietary is scraped or stored. This lets
the dashboard go public without depending on KeepTradeCut.

## How it fits the existing app

`player_values` / `player_value_history` already carry a `source` column. The
community pipeline writes rows with `source = 'community'` **alongside** the
existing `keeptradecut` rows — the two never collide (unique key includes
`source`). The app reads whichever source `VALUE_SOURCE` points at.

```
dashboard/src/lib/value-source.ts   →  export const VALUE_SOURCE = 'keeptradecut'
```

Every value read in the app funnels through that constant. Cutover = change it
to `'community'`. Nothing else changes.

## Data flow

```
nflverse facts ─┐
                ├─► objective prior ─► seed community_ratings + player_values
Sleeper age/draft ┘                        │
                                           ▼
pairwise votes ─┐                     Glicko-2 engine ─► player_values
real trades     ├─► value_events ────► (compute-community-       + player_value_history
calculator      ┘                       values edge fn)           (source = 'community')
```

## Tables (migration `20260710_community_value_system.sql`)

| table | role |
|---|---|
| `player_facts` | objective nflverse+Sleeper facts, one row per player-season |
| `value_events` | normalized "side A preferred over side B" signals |
| `community_ratings` | persistent Glicko-2 state (rating, RD, volatility) |

Plus `rating_deviation` columns added to `player_values` / `player_value_history`
so the app can show how settled a value is.

## Run order (first-time bootstrap)

All scripts need `VITE_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the env.

```bash
# 0. apply the migration to the live DB
supabase db push

# 1. pull objective facts (defaults to last 4 seasons)
cd dashboard
npx tsx scripts/ingest-nflverse-facts.ts 2021 2022 2023 2024

# 2. seed the prior → community values + Glicko state.
#    add --backfill to also write historical snapshots for past seasons
#    (this is what gives old players a KTC-free value history to chart)
npx tsx scripts/seed-community-prior.ts --backfill

# 3. deploy + run the engine (also schedule it, e.g. daily)
supabase functions deploy compute-community-values
supabase functions invoke compute-community-values
```

After step 2 you can already point `VALUE_SOURCE` at `'community'` in a local
build to eyeball the board before committing to the cutover.

## The prior model

`dashboard/scripts/lib/prior.ts`. Deliberately **not** a regression fit against
KTC (that would bake their output back in). It's a transparent heuristic:

```
score = recency-weighted PPR ppg  (position-relative)
      + youth   (position-specific age curve)
      + draft capital (decays as a real track record accumulates)
```

Scores are z-scored within position so QBs and WRs share the top of the board,
then rank is mapped onto a 0–9999 dynasty curve. Superflex boosts QB scarcity.

## The engine

`supabase/functions/compute-community-values/`. Each run:

1. ingests new completed Sleeper trades into `value_events` (deduped on
   `transaction_id`; a fair executed trade = outcome 0.5),
2. converts unprocessed events into Glicko-2 matches (real trades weighted 3×,
   calculator 1.5×, anonymous taps 1×),
3. updates `community_ratings`,
4. re-derives the 0–9999 board and upserts `player_values` +
   `player_value_history`,
5. marks events processed.

Unsettled players (rookies, thin sample) have a wide rating deviation and move
fast; heavily-traded stars settle and stay sticky.

## Cutover checklist

1. Bootstrap + let the engine run until the board looks right.
2. Flip `VALUE_SOURCE` to `'community'`, deploy.
3. Delete the KTC scrape: `sync-ktc-values` function, its cron, the
   `backfill-missing-ktc-*` scripts, and `pages/KTCValues.tsx` + its route/nav.
4. Optionally `DELETE FROM player_values WHERE source = 'keeptradecut'`.
