# Backend Recovery Guide

**Status: RECOVERED (July 8, 2026).** The original Supabase project
(`ieviegvkitwwtttgrcso`) was removed after free-tier inactivity. A new project
was provisioned end-to-end and all data re-synced from Sleeper + KeepTradeCut:

- **Project:** `sleeper-dashboard` (`yxtnocecnqutcvltptya`), org "Yap Sports Database",
  us-east-1 — https://supabase.com/dashboard/project/yxtnocecnqutcvltptya
- **Synced:** 4 seasons (2023–2026), 48 rosters, 984 transactions, 434 traded picks,
  432 draft picks, 445 KTC player values, 36 pick values
- **Cron:** all five sync jobs scheduled via pg_cron + Vault and verified firing
- **Local secrets:** DB password and API keys in `supabase/.temp/` (gitignored)
- **Still to do:** update `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` in
  Railway if the deployed frontend is still wanted (local `dashboard/.env` is
  already updated)

The steps below remain as the playbook for any future re-provisioning.

---

## League reference

The dashboard tracks **Dynasty Reloaded** (12-team). Chain from Sleeper's API:

| Season | league_id |
|--------|-----------------------|
| 2026   | `1312080194361638912` |
| 2025   | `1180365427496943616` |
| 2024   | `1048274277511962624` |
| 2023   | `990713355411271680`  |

Only the current-season row needs seeding — `sync-league-data` traverses
`previous_league_id` and backfills the rest.

## Re-provisioning steps

1. **Create a project** (CLI works if `supabase orgs list` succeeds):
   ```sh
   supabase projects create sleeper-dashboard \
     --org-id trfdfmhpoezdyyzseimf --db-password <PW> --region us-east-1
   ```

2. **Link and push the schema** (three migrations: initial schema → cron/realtime
   → value history + upsert indexes):
   ```sh
   supabase link --project-ref <REF>
   supabase db push
   ```

3. **Deploy the edge functions** (no secrets needed — `SUPABASE_URL` /
   `SUPABASE_SERVICE_ROLE_KEY` are injected automatically):
   ```sh
   for fn in sync-players sync-league-data sync-nfl-state sync-ktc-values sync-transactions-live; do
     supabase functions deploy $fn
   done
   ```

4. **Seed the Vault secrets the cron jobs read** (SQL editor or psql via
   `postgres.<REF>@aws-0-us-east-1.pooler.supabase.com:5432`). Note: managed
   Supabase denies `ALTER DATABASE/ROLE ... SET`, so Vault is the only option:
   ```sql
   SELECT vault.create_secret('https://<REF>.supabase.co', 'project_url');
   SELECT vault.create_secret('<SERVICE_ROLE_KEY>', 'service_role_key');
   ```

5. **Seed the league row:**
   ```sql
   INSERT INTO leagues (league_id, name, season, status, total_rosters)
   VALUES ('1312080194361638912', 'Dynasty Reloaded', '2026', 'in_season', 12);
   ```

6. **Run the first sync in order** (POST with the service role key as Bearer):
   `sync-players` → `sync-nfl-state` → `sync-league-data` → `sync-ktc-values`.
   Cron keeps everything fresh afterwards (and counts as activity, which keeps
   the free-tier project from pausing).

7. **Point the frontend at it** — `dashboard/.env` and Railway env vars:
   ```
   VITE_SUPABASE_URL=https://<REF>.supabase.co
   VITE_SUPABASE_ANON_KEY=<ANON_KEY>
   ```

8. **Regenerate types:**
   ```sh
   supabase gen types typescript --linked > dashboard/src/types/database.ts
   ```
   Sleeper API shapes live separately in `dashboard/src/types/sleeper.ts`, so
   regeneration is safe.

## Verification checklist

- `SELECT jobname, active FROM cron.job` — five active jobs
- `SELECT * FROM sync_log ORDER BY started_at DESC LIMIT 5` — completed runs
- App Home page shows power rankings and recent trades with KTC values
