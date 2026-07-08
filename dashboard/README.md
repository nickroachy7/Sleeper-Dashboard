# Sleeper Dynasty Dashboard

A dashboard for the **Dynasty Reloaded** Sleeper league (12-team superflex dynasty):
KeepTradeCut-powered trade tools, power rankings, transaction history with trade
grading, and draft capital tracking.

> ⚠️ **Backend status:** the Supabase project was removed after free-tier
> inactivity. The app runs but shows empty states until it's re-provisioned —
> see [`../RECOVERY.md`](../RECOVERY.md) for the ~15-minute restore procedure.

## Stack

- **Frontend:** React 19 + TypeScript + Vite, Tailwind CSS 4, TanStack Query,
  React Router. Deployed on Railway (serves `dist/` via `npm run serve`).
- **Backend:** Supabase (Postgres + edge functions). Schema lives in
  `../supabase/migrations/`; five Deno edge functions in `../supabase/functions/`
  sync data on cron schedules:
  - `sync-players` — Sleeper player database (daily)
  - `sync-league-data` — rosters, users, transactions, picks, matchups, drafts
    for **all** dynasty seasons via the `previous_league_id` chain (every 6 h)
  - `sync-transactions-live` — recent transactions + rosters (every 5 min)
  - `sync-ktc-values` — KeepTradeCut dynasty values, superflex + TEP, with daily
    history snapshots (daily)
  - `sync-nfl-state` — current NFL week (hourly)
- The frontend is read-only against the database (anon key + RLS public-read
  policies); all writes happen in edge functions with the service role.

## Pages

| Route | What it does |
|-------|--------------|
| `/` | Power rankings (KTC-weighted with diminishing returns), value watch, recent trades |
| `/trade` | Trade Evaluator (KTC value adjustment + post-trade roster impact) and Trade Finder (package search with partner-fit and roster-fit scoring) |
| `/values` | KTC value browser: players, picks, and team positional strength |
| `/transactions` | Full transaction history with trade grading and value diffs |
| `/drafts` | Draft history and future draft capital by team |
| `/settings` | Sync status, league info, manual sync triggers |

The trade math lives in `src/lib/trade-value-adjustment.ts` (KTC-style net value
adjustment: stud premiums, piece-count asymmetry, gap recovery) and
`src/lib/trade-shared.ts` (positional weighting, pick valuation, shared helpers).

## Development

```sh
npm install
npm run dev      # Vite dev server on :5173
npm run build    # tsc + vite build
npm run lint     # eslint (kept at zero problems)
```

Requires `.env` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
