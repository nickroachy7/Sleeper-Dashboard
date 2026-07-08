# Backend Recovery Guide

**Status (July 2026):** The original Supabase project (`ieviegvkitwwtttgrcso`) no longer
exists — its hostname doesn't resolve and the CLI reports "Resource has been removed."
Free-tier projects get paused after ~1 week of inactivity and removed later; this one
was idle since April.

**The good news:** nothing important was lost. Every table is re-syncable from the
Sleeper API and KeepTradeCut. The only unrecoverable data is `sync_log` history and any
`player_value_history` snapshots (that table was brand new and likely empty anyway).
The full schema now lives in `supabase/migrations/`, so re-provisioning is ~15 minutes.

## League reference

The dashboard tracked **Dynasty Reloaded** (12-team). Current chain from Sleeper's API:

| Season | league_id |
|--------|-----------------------|
| 2026   | `1312080194361638912` |
| 2025   | `1180365427496943616` |
| 2024   | `1048274277511962624` |
| 2023   | `990713355411271680`  |

Only the 2026 row needs seeding — `sync-league-data` traverses `previous_league_id`
and backfills the rest. (You're also in "DK Dynasty", 2026 id `1313965360898146304`,
if that was ever meant to be added.)

## Steps

1. **Create a new Supabase project** at [database.new](https://database.new).
   Note the project ref, anon key, and service role key (Project Settings → API).

2. **Re-link the CLI** (the old login token is also stale):
   ```sh
   cd Sleeper-Dashboard
   supabase login
   supabase link --project-ref <NEW_PROJECT_REF>
   ```

3. **Push the schema** — three migrations run in order
   (initial schema → realtime/cron → value history + upsert indexes):
   ```sh
   supabase db push
   ```

4. **Deploy the edge functions:**
   ```sh
   supabase functions deploy sync-players
   supabase functions deploy sync-league-data
   supabase functions deploy sync-nfl-state
   supabase functions deploy sync-ktc-values
   supabase functions deploy sync-transactions-live
   ```
   No secrets to set — they use `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`,
   which Supabase injects automatically.

5. **Seed the league row** (SQL editor in the dashboard):
   ```sql
   INSERT INTO leagues (league_id, name, season, status, total_rosters)
   VALUES ('1312080194361638912', 'Dynasty Reloaded', '2026', 'in_season', 12);
   ```

6. **Run the first sync, in this order** (each is an HTTP POST; use the dashboard's
   "invoke" button or curl with the service role key as Bearer token):
   1. `sync-players` (~5 min, populates the players table other syncs FK against)
   2. `sync-nfl-state`
   3. `sync-league-data` (all four seasons — takes a few minutes)
   4. `sync-ktc-values`

7. **Update the frontend env** in `dashboard/.env` (and the same two vars in
   Railway if the deployed site is still wanted):
   ```
   VITE_SUPABASE_URL=https://<NEW_PROJECT_REF>.supabase.co
   VITE_SUPABASE_ANON_KEY=<NEW_ANON_KEY>
   ```

8. **Re-create the cron schedules.** The `sync-transactions-live` job from the
   20260402 migration is installed but points at `app.settings.*` settings that
   don't exist on the new project. Either set them:
   ```sql
   ALTER DATABASE postgres SET app.settings.supabase_url = 'https://<NEW_PROJECT_REF>.supabase.co';
   ALTER DATABASE postgres SET app.settings.supabase_service_role_key = '<SERVICE_ROLE_KEY>';
   ```
   or re-schedule the jobs with hardcoded URLs (see the note at the bottom of
   `supabase/migrations/20260402_live_transaction_sync.sql`). Intended cadence:
   - `sync-transactions-live` — every 5 min
   - `sync-league-data` — every 6 h
   - `sync-players` — daily 4 AM ET
   - `sync-ktc-values` — daily 6 AM ET
   - `sync-nfl-state` — hourly

9. **Regenerate types** (optional but keeps `database.ts` honest):
   ```sh
   supabase gen types typescript --linked > dashboard/src/types/database.ts
   ```
   Note: the reconstructed schema drops tables the app never used
   (`articles`, `player_projections`, `playoff_brackets`, `trade_analyses`, `yf_*`),
   so the generated file will be smaller than the old one. `tsc` should still pass;
   if it doesn't, a type import somewhere references a dropped table.

10. **Keep it alive.** Free-tier projects pause after ~1 week without traffic.
    The cron jobs in step 8 count as activity, so once they're running the project
    stays warm. If you skip cron, expect to have to unpause the project manually.
