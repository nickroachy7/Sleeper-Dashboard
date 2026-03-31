# Dynasty Reloaded Newsletter — Design Spec

## Project Overview

**Dynasty Reloaded** is a weekly automated newsletter for a 12-team Superflex, Half-PPR, Tight End Premium (TEP) dynasty fantasy football league hosted on Sleeper. The system pulls live data from two sources — the **Sleeper API** (rosters, trades, draft picks) and **KeepTradeCut** (dynasty player valuations in SF+TEP format) — then generates a single, continuous high-definition PNG image styled as a dark-mode editorial newsletter.

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                   build_newsletter.py                │
│              (main orchestrator / renderer)           │
│                                                      │
│   1. Fetch data from sources                         │
│   2. Build dynamic HTML from templates                │
│   3. Embed all images as base64 data URIs            │
│   4. Render to HD PNG via Playwright (headless Chrome)│
└────────────┬──────────────────┬───────────────────────┘
             │                  │
     ┌───────▼───────┐  ┌──────▼────────┐
     │ ktc_scraper.py │  │sleeper_league.py│
     │               │  │                │
     │ Scrapes KTC   │  │ Sleeper REST   │
     │ dynasty SF+TEP│  │ API (public)   │
     │ player values  │  │                │
     │               │  │ - Rosters      │
     │ Cache: 6hr TTL│  │ - Trades       │
     │ ktc_cache.json│  │ - Players      │
     │               │  │                │
     │               │  │ Cache: 24hr TTL│
     │               │  │ sleeper_players │
     │               │  │ _cache.json    │
     └───────────────┘  └────────────────┘
```

### Files

| File | Purpose |
|---|---|
| `build_newsletter.py` | Main entry point. Fetches data, builds HTML, embeds images, renders PNG. Run `python build_newsletter.py` each week. |
| `ktc_scraper.py` | Scrapes KeepTradeCut dynasty rankings pages, extracts the embedded `playersArray` JSON, returns SF+TEP values on a 0–9,999 scale. Caches to `ktc_cache.json` (6hr TTL). |
| `sleeper_league.py` | Pulls rosters, users, and transactions from the Sleeper public API for league `1312080194361638912`. Caches the full NFL player database to `sleeper_players_cache.json` (24hr TTL). |
| `generate_newsletter_pdf.py` | Legacy/standalone renderer. Converts a static HTML file to PNG via Playwright. Superseded by `build_newsletter.py` for dynamic generation. |
| `dynasty_reloaded_newsletter_v3.html` | Original static HTML newsletter (v3). Kept for reference; no longer used by the dynamic pipeline. |

### Dependencies

| Package | Purpose |
|---|---|
| `requests` | HTTP fetching (KTC pages, Sleeper API, image downloads) |
| `playwright` | Headless Chromium for HTML-to-PNG rendering |

```bash
# Setup
python3 -m venv .venv
source .venv/bin/activate
pip install requests playwright
playwright install chromium
```

---

## Data Sources

### KeepTradeCut (KTC)

- **URL**: `https://keeptradecut.com/dynasty-rankings?page={0-9}&filters=QB|WR|RB|TE|RDP&format=0`
- **Format**: `format=0` = Superflex
- **Extraction method**: Regex-parse the `playersArray` JavaScript variable embedded in each page's HTML
- **Value used**: `superflexValues.tep.value` (Superflex + single TEP — matches league settings)
- **Scale**: 0–9,999 (relative; top assets like Josh Allen sit near 9,999)
- **Coverage**: ~465 players + ~36 draft picks across 10 pages
- **Cache**: `ktc_cache.json`, 6-hour TTL, force-refresh via `scrape_ktc(force=True)`
- **Rate limiting**: 0.5s delay between page fetches

#### KTC Player Object Fields Used

| Field | Maps To |
|---|---|
| `superflexValues.tep.value` | Primary display value |
| `superflexValues.tep.rank` | Overall rank |
| `superflexValues.tep.tier` | Tier grouping |
| `superflexValues.value` | SF value (non-TEP, stored as `sf_value`) |
| `playerName` | Display name / dict key |
| `position` | Position (`QB`, `RB`, `WR`, `TE`, `RDP` for picks) |
| `team` | NFL team abbreviation |
| `age` | Player age |
| `trend` | Value trend direction |

### Sleeper API

- **Base URL**: `https://api.sleeper.app/v1/`
- **League ID**: `1312080194361638912`
- **Auth**: None required (public API)
- **Endpoints used**:

| Endpoint | Returns |
|---|---|
| `GET /league/{id}` | League name, season, status, settings |
| `GET /league/{id}/users` | `user_id` to `display_name` mapping |
| `GET /league/{id}/rosters` | All rosters: `owner_id`, `players[]`, `starters[]`, `taxi[]`, `reserve[]` |
| `GET /league/{id}/transactions/{round}` | Trades, waivers, drops per round (rounds 0–18) |
| `GET /players/nfl` | Full NFL player database (~11,500 players, ~50MB) |

- **Player cache**: `sleeper_players_cache.json`, 24-hour TTL
- **Player fields cached**: `full_name`, `position`, `team`, `espn_id`

### Player Headshots

- **Source**: Sleeper CDN
- **URL pattern**: `https://sleepercdn.com/content/nfl/players/{sleeper_id}.jpg`
- **Coverage**: Near-100% for all rostered NFL players
- **Why not ESPN**: ESPN's headshot IDs (`espn_id`) are missing for ~43% of players in Sleeper's database, particularly recent draftees. Sleeper CDN uses the same `player_id` already present in roster data, giving reliable universal coverage.

### Player Name Matching (KTC <> Sleeper)

Sleeper and KTC use slightly different name formats. The matching pipeline:

1. **Exact match** — try `player_name` directly in KTC dict
2. **Normalized match** — lowercase, strip suffixes (Jr., Sr., II, III, IV), remove punctuation
3. **Last-name fallback** — if only one KTC player shares the last name, use that match

### Draft Pick Value Matching

Sleeper describes picks as `"{year} Round {n} (from {team})"`. KTC labels them as `"2026 Mid 1st"`, `"2027 Early 2nd"`, etc.

- Rounds 1–3: Mapped to KTC's "Mid" qualifier by default (exact draft position unknown pre-draft)
- Rounds 4+: Assigned a flat value of 100 (negligible dynasty value)

---

## Visual Design

### Canvas

| Property | Value |
|---|---|
| Content width | 620px (within 750px viewport) |
| Viewport width | 750px |
| Device scale factor | 3x (renders at 2,250px actual width for HD) |
| Output format | PNG, full-page screenshot |
| Typical file size | 2–3 MB |
| Background | `#000000` (pure black) |
| Font stack | `'Helvetica Neue', Helvetica, Arial, sans-serif` |

### Color Palette

| Token | Hex | Usage |
|---|---|---|
| Background | `#000000` | Page background |
| Surface | `#0a0a0a` | Card/pill backgrounds |
| Border primary | `#222222` | Section dividers, header underlines |
| Border secondary | `#151515` | Inter-section thin dividers |
| Border subtle | `#111111` | Table row separators |
| Text primary | `#ffffff` | Headings, player names, values |
| Text secondary | `#cccccc` | Trade item labels |
| Text tertiary | `#888888` | Body copy, descriptions |
| Text muted | `#555555` | Section labels, meta text |
| Text faint | `#444444` | Position tags, original pick notes |
| Text ghost | `#333333` | Attribution, em-dashes |
| Accent green | `#22c55e` | Rising indicators, trade winners, Tier 1 labels |
| Accent yellow | `#eab308` | Stash indicators, Tier 2 labels |
| Accent red | `#ef4444` | QB position color |
| Accent blue | `#3b82f6` | RB position color |
| Accent green (pos) | `#22c55e` | WR position color |
| Accent amber | `#f59e0b` | TE position color |
| Rank gold | `#ffd700` | Power Rankings #1 |
| Rank silver | `#c0c0c0` | Power Rankings #2 |
| Rank bronze | `#cd7f32` | Power Rankings #3 |

### Typography Scale

| Element | Size | Weight | Color | Extras |
|---|---|---|---|---|
| Masthead title | 20px | 800 | `#ffffff` | `letter-spacing: 4px`, uppercase |
| Masthead date | 12px | 400 | `#555555` | `letter-spacing: 1px`, uppercase |
| League descriptor | 11px | 400 | `#444444` | `letter-spacing: 1px` |
| Section label | 10px | 700 | `#555555` | `letter-spacing: 3px`, uppercase |
| Section title | 24px | 800 | `#ffffff` | `letter-spacing: -0.5px` |
| Section subtitle | 13px | 400 | `#666666` | — |
| Table header | 10px | 700 | `#444444` | `letter-spacing: 2px`, uppercase |
| Player name (table) | 14px | 700 | `#ffffff` | — |
| Player name (card) | 16px | 700 | `#ffffff` | — |
| Value number | 14px | 700 | `#ffffff` | Right-aligned, comma-formatted |
| KTC inline value | 11px | 400 | `#555555` | Parenthetical, e.g. `(4,750)` |
| Trade team name | 13px | 700 | `#ffffff` | — |
| Trade KTC total | 12px | 400 | `#444444` | Float-right |
| Trade item label | 13px | 400 | `#cccccc` | — |
| Pick number | 15px | 800 | `#ffffff` | Draft board |
| Owner name | 14px | 400/700 | `#ffffff` | Bold if silvaben21 (5-pick owner) |
| Attribution | 11px | 400 | `#333333` | "Values via KeepTradeCut.com" |
| Sign-off title | 16px | 800 | `#333333` | `letter-spacing: 4px`, uppercase |

### Spacing & Layout

| Element | Padding |
|---|---|
| Section top padding | `28px` from divider |
| Section label to title | `8px` bottom |
| Title to subtitle | `6px` bottom |
| Subtitle to content | `20px` bottom |
| Content side padding | `28px` left/right (within 620px table) |
| Table row padding | `10px` top/bottom |
| Section bottom spacing | `32px` before divider |
| Divider | 1px solid `#151515`, full content width |

### Components

#### Player Headshot (Circular)

- **Source**: Sleeper CDN
- **Trade rows**: 28x20px, `border-radius: 50%`, `object-fit: cover`
- **Value Watch table**: 36x36px in dedicated column, `border-radius: 50%`
- **Power Rankings**: 28x28px inline with top asset name
- **Fallback**: No image rendered if Sleeper ID unavailable

#### Trade Card

```
┌─ 2px left border (green = winner, #333 = other) ──────────────┐
│  teamName  W                               12,345 KTC         │
│  [headshot] Player Name (POS, TEAM) (value)                    │
│  [headshot] Player Name (POS, TEAM) (value)                    │
│  2026 Round 1 (from team) (value)                              │
└────────────────────────────────────────────────────────────────┘
```

- Left border: 2px solid, `#22c55e` for winner, `#333333` for other sides
- Green **W** badge next to winner team name (only shown for 2- and 3-team trades)
- KTC total right-aligned on the team name row
- Gap summary below: `"Gap: +1,200 KTC to teamName"` (2-team trades only)

#### Power Rankings Row

```
#  │ TEAM                    │  VALUE  │ TOP ASSET
1  │ teamName                │ 99,999  │ [headshot] Player Name
   │ ████████████████░░░░░░  │         │ POS · value
```

- Rank number colored gold/silver/bronze for top 3
- Value bar: percentage width relative to #1 team, `linear-gradient(90deg, #ffffff, #333333)`
- Top 3 team names bolded

#### Draft Board Row

```
PICK │ OWNER        │ ORIG.
1.01 │ teamName     │ via originalTeam
```

- Pick number: 15px bold white
- Owner bold if they hold 5+ picks (silvaben21)
- "via" origin right-aligned in `#444444`; em-dash if original owner

#### Value Watch Row

```
#  │ [headshot] │ PLAYER         │ OWNER     │ VALUE
1  │  [circle]  │ Josh Allen     │ teamName  │ 9,994
   │            │ QB · BUF       │           │
```

- Dedicated 40px image column
- Position label color-coded by position
- 15 players shown

### Section Badges

- **Trade type**: White background, black text, `font-size: 10px`, `font-weight: 800`, `border-radius: 2px`, `letter-spacing: 1px`. Content: "TRADE" or "10-TEAM TRADE"
- **Pick pills** (draft board summary): White bg, black text, `font-size: 13px`, `font-weight: 800`, `padding: 7px 14px`, `border-radius: 3px`

---

## Newsletter Sections (in render order)

### 1. Masthead

Static header with league branding.

| Element | Content |
|---|---|
| Title | "DYNASTY RELOADED" |
| Date | "Weekly · {Mon YYYY}" (auto-generated) |
| Divider | 1px `#222222` |
| Descriptor | "12-TEAM SUPERFLEX · HALF-PPR · TEP · SLEEPER" |

### 2. Power Rankings

**Data-driven.** Teams ranked by total KTC roster value (SF+TEP).

- **Source**: Sleeper rosters + KTC values
- **Content**: All league teams ranked descending by sum of rostered player KTC values
- **Per row**: Rank, team name, value bar, total value, top asset headshot + name
- **Top 3**: Gold/silver/bronze rank numbers, bold names

### 3. Trade Recap (The Wire)

**Data-driven.** Recent completed trades with KTC value analysis.

- **Source**: Sleeper transactions API (type `trade`, status `complete`) + KTC values
- **Window**: Configurable; currently 30 days, designed for 7-day weekly cadence
- **Cap**: 15 most recent trades
- **Per trade**: Date, team badge, each side's received assets with individual KTC values, side totals, winner indicator (green border + "W"), and value gap for 2-team trades
- **Player items**: Headshot + "Name (POS, TEAM) (KTC value)"
- **Pick items**: "2026 Round 1 (from teamName) (KTC value)"

### 4. Draft Board (The Board)

**Currently static** — manually updated pick ownership array. Could be automated via Sleeper draft endpoint in future.

- **Content**: 2026 first-round pick-by-pick ownership
- **Per row**: Pick number, current owner, original owner
- **Summary row**: Pick count per owner

### 5. Value Watch

**Data-driven.** Top 15 most valuable players rostered across the league.

- **Source**: All rostered players matched to KTC values
- **Per row**: Rank, circular headshot, player name, position (color-coded), NFL team, owning fantasy team, KTC value
- **Sorted**: Descending by KTC SF+TEP value

### 6. Sign-Off

Static footer.

- **Content**: "DYNASTY RELOADED" title, Sleeper league deep link, generation timestamp, KTC attribution

---

## Rendering Pipeline

```
1. Fetch KTC data        → ktc_cache.json (if stale)
2. Fetch Sleeper data    → sleeper_players_cache.json (if stale)
3. Build HTML string     → ~80K chars of inline-styled HTML tables
4. Find <img> URLs       → regex extraction of all external src attributes
5. Fetch images          → parallel downloads (8 workers, 15s timeout)
6. Embed as base64       → replace src="https://..." with src="data:image/...;base64,..."
7. Write temp HTML file  → /tmp/*.html
8. Playwright screenshot → headless Chromium, 750px viewport, 3x scale, full_page=True
9. Output                → Dynasty_Reloaded_Newsletter.png (~2.5MB)
10. Cleanup              → delete temp HTML
```

### Why base64 embedding?

Playwright renders from a `file://` URL. External images would require network access during render, which is unreliable and slow. Pre-embedding guarantees all images appear in the final screenshot regardless of network conditions at render time.

### Why PNG over PDF?

The user requested a single continuous image with no page breaks. PDF inherently paginates; a full-page Playwright screenshot produces one seamless vertical image at retina resolution (2,250px wide at 3x scale).

---

## Configuration Reference

| Parameter | Location | Default | Description |
|---|---|---|---|
| `PAGE_WIDTH` | `build_newsletter.py` | `750` | Viewport width in CSS pixels |
| `DEVICE_SCALE` | `build_newsletter.py` | `3` | Retina multiplier (3x = 2,250px output) |
| `OUTPUT_FILE` | `build_newsletter.py` | `Dynasty_Reloaded_Newsletter.png` | Output filename |
| Trade window | `build_newsletter.py` | `30 days` | `cutoff` delta; change to `7` for weekly |
| Trade cap | `build_newsletter.py` | `15` | Max trades shown |
| `DEFAULT_TTL_HOURS` | `ktc_scraper.py` | `6` | KTC cache freshness |
| `FETCH_DELAY` | `ktc_scraper.py` | `0.5` | Seconds between KTC page fetches |
| `CACHE_TTL` | `sleeper_league.py` | `86400` (24hr) | Sleeper player DB cache freshness |
| `LEAGUE_ID` | `sleeper_league.py` | `1312080194361638912` | Sleeper league identifier |

---

## Future Enhancements

- **Automate Draft Board**: Pull pick ownership from Sleeper's draft/picks endpoint instead of a static array
- **Weekly cron job**: Schedule `build_newsletter.py` to run weekly via `cron` or a task scheduler
- **Sleeper DM distribution**: Use Sleeper's bot API to push the newsletter image to the league chat
- **Historical tracking**: Store weekly KTC values to show week-over-week value deltas (risers/fallers)
- **Waiver Wire section**: Surface notable free agents not rostered but with rising KTC values
- **Matchup Previews**: During the season, add projected head-to-head matchup analysis
- **Trade calculator**: Embed a mini trade evaluator showing fair-value swaps between teams
