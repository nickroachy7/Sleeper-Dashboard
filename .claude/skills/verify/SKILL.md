---
name: verify
description: How to launch and drive this app to verify changes end-to-end (Vite SPA + hosted Supabase backend).
---

# Verifying Sleeper-Dashboard changes

## Launch
- Dev server: `cd dashboard && npx vite --port 5199 --strictPort` (background). `.env` already points at the hosted Supabase project — no local stack, no Docker.
- There is no local Supabase; DB/auth changes hit production. `supabase db push` is a production deploy — get explicit user approval first.

## Drive (headless browser)
- Playwright is NOT a dashboard dep. Scratch install: `cd /tmp/<dir> && npm init -y && npm i playwright` (browsers are already cached in ~/Library/Caches/ms-playwright).
- Seed a guest league before testing league flows:
  `localStorage['sleeper_dash.leagues'] = JSON.stringify([{rootLeagueId:'1312080194361638912',name:'Dynasty Reloaded',season:'2026'}])`
  plus `sleeper_dash.activeLeagueId` and `sleeper_dash.myTeam` (`{"<rootLeagueId>": rosterId}`).

## Gotchas
- **SessionContributeModal** auto-opens once per session (z-[70] overlay) and swallows clicks under Playwright. Suppress with `sessionStorage.setItem('sleeper_dash.contributed','1')` before interacting.
- Supabase auth rejects `@example.com` sign-ups ("Email address invalid") — use a real-looking domain for test accounts.
- Settings page logs benign 404s/warnings for `sync.cron_jobs` / `sync.recent_runs` views — pre-existing, not a regression.
- Sign-up requires "Confirm email" to be OFF in the Supabase dashboard (Auth → Sign In / Up) for the no-verification flow; if ON, the app surfaces "email confirmation is required by the server".
