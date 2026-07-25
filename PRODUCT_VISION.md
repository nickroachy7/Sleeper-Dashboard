# YAP — Product Vision & Roadmap

*Working definition, 2026-07-25. This supersedes the single-league framing in
DESIGN_SPEC.md and folds in the April refinement review. It is opinionated on
purpose — the point is to commit to a spine.*

---

## 0. The one line

**YAP is where dynasty managers argue their takes and watch the crowd settle the
score.** Every opinion you cast — who's better, who wins a trade, how you'd rank
a room — feeds one living market of player value that belongs to the community,
not a scraper. Values are the *scoreboard*; the *opinions* are the game.

The name already says it. You come to yap. The engine listens.

---

## 1. What YAP actually is today (honest inventory)

Not the original vision (a weekly league newsletter). Today it's a public,
account-optional dynasty platform on top of Sleeper with four real assets:

1. **A community opinion engine.** Real Sleeper trades + crowd votes (pairwise,
   trade-calculator, ranking reorders) flow into `value_events`, a Glicko-2
   engine rates every player *and* pick on one scale, and that becomes the
   value/rank the whole app reads (`VALUE_SOURCE = 'community'`). This is the
   differentiated core: **our own data, not a KTC scrape.**
2. **A cross-league feed** ("The Wire") — trades and roster moves across all a
   user's leagues, with "who'd you rather?" vote cards woven in.
3. **Shareable identity** — `/u/<username>`: your personal ranking board that
   *diverges from the crowd* (▲/▼ vs-crowd deltas), plus a Trophy Case derived
   from real Sleeper matchup history.
4. **Genuinely deep solo analytics** — Trade Evaluator/Finder (star-premium
   math, partner-fit, roster-fit), all-play "luck-neutral" standings, Coach
   Rating, contention windows, player Outlooks, head-to-head history, and a
   text-to-SQL league assistant in the search bar.

**The honest problem** (this is the whole reason for this doc): YAP is a
*best-in-class single-player game with a thin multiplayer layer*. Almost every
insight terminates in a passive view. The feed has no human heartbeat. There are
zero notifications. Rich comparative data (trophies, board deltas, trade net,
coach rating) never becomes competitive *across people*. The intended viral
artifact — the profile — dead-ends in a "coming soon" tab. The codebase itself
keeps flagging where the multiplayer hooks were meant to go and never got built.

That gap is the opportunity. We don't need more analytics. We need to make the
analytics we have *social, opinionated, and alive*.

---

## 2. The spine: the Community Opinion Engine

Everything hangs off one loop. This is the decision that orders the roadmap.

```
        YOU HAVE A TAKE                          YAP MAKES IT MATTER
   ┌────────────────────────┐             ┌────────────────────────────┐
   │  vote (who's better?)   │            │  moves the community value  │
   │  grade a trade          │  ───────▶  │  moves YOUR board vs crowd  │
   │  rank a room            │            │  earns standing / trophies  │
   │  react / call it        │            │  shows up in others' feeds  │
   └────────────────────────┘             └────────────────────────────┘
             ▲                                          │
             │                                          ▼
             └──────────  the crowd's verdict pulls you back  ──────────┘
              ("you're higher on Nabers than 78% of managers")
```

The magic isn't the value number. It's the **tension between your take and the
crowd's**. That tension is:
- a *reason to vote* (make the board yours),
- a *reason to share* (prove your read),
- a *reason to come back* (did the market move to me or away from me?),
- and a *reason to argue* (the social layer we haven't built).

**Why this spine and not the other two:** "Social network" and "league
companion" are both real, but neither is defensible on its own — Sleeper owns the
league graph, and a generic dynasty social feed is a cold-start ghost town. The
opinion engine is the *only* thing YAP has that nobody else does, it gets better
with every user (data network effect), and it is the raw material that makes the
social layer and the league companion worth using. So: **opinion engine is the
spine; social and league are the two things it powers.** All three ship — but in
that dependency order.

---

## 3. The north star: depth of engagement per session

You chose depth-per-session, and it fits the spine perfectly. A "value lookup"
is a 15-second bounce. An *opinion* session is: cast a few votes → see where you
disagree with the crowd → defend or update → check who else is out on a limb. We
want sessions measured in **meaningful actions**, not seconds.

**North-star metric:** *Opinions per active session* — votes + trade grades +
ranking edits + reactions + calls, per session, by a returning user.

**Supporting metrics** (guardrails so we don't juice the wrong thing):
- **Take-to-crowd delta health** — % of users with ≥10 "moved" players (they've
  formed a real board, not just tapped through defaults).
- **Return-to-resolve rate** — % of users who come back after the crowd moves on
  a player they had a strong take on (the retention hook).
- **Trust** — do users believe the values? Measured by trade-tool usage +
  qualitative "would you cite this to a leaguemate?"
- **Viral coefficient** (secondary) — invites/shares per active user. Not the
  target, but the thing that makes depth compound.

Explicitly *not* the target: raw DAU or time-on-site. We want fewer, denser,
opinion-rich sessions over idle scrolling.

---

## 4. The three users, one spine

You said design for all three. The spine lets us — each gets a different *entry*
into the same loop:

| User | What pulls them in | Their opinion-loop entry | What "love" looks like |
|---|---|---|---|
| **Commissioner** (whole-league evangelist) | Make my league more fun/settle arguments | League-wide takes: "rank our league's rosters," league trade grades, a league leaderboard of hottest takes | Drags 11 friends in; YAP becomes league canon |
| **Dynasty grinder** (3–8 leagues, daily) | Sharpen my edge; work trades | The cross-league feed + Rank 'Em + trade tools; their board *is* their edge | Board becomes their identity; checks daily to defend/update takes |
| **Casual leaguemate** (1–2 leagues, nudged) | Low-effort fun, don't look dumb | One-tap votes in the feed, trophies, "you vs your league" | Converts from nudge to habit via a single satisfying tap |

The commissioner is the **wedge** (win one, get twelve), the grinder is the
**power user** (defines the ceiling), the casual is the **volume** (proves the
one-tap loop). Design order in the roadmap reflects this: build the loop for the
grinder (it's mostly there), make it *social* for the commissioner's league,
make the entry *one-tap* for the casual.

---

## 5. Differentiators / the moat

1. **Community-owned values with receipts.** KTC/FantasyCalc are black boxes.
   YAP can show *why* a value moved: "up 340 this week — 3 real trades + 61 votes
   leaned in." Transparency is a wedge against the incumbents and it's already
   half-built (the chat exposes its SQL; the engine logs every event).
2. **Real trades as ground truth.** We ingest actual completed Sleeper trades
   into the same rating scale as votes. No competitor grounds opinion in what
   managers *actually did*. This is a credibility moat.
3. **Your take vs the crowd, as identity.** The personal board that diverges
   from consensus is a genuinely novel artifact. Nobody else turns "you're higher
   on X than 78% of managers" into a shareable, competitive object.
4. **Depth on tap.** The solo analytics (Coach Rating, luck-neutral records,
   Outlooks) are already deeper than most paid tools — they become *hooks* once
   they're comparative.

---

## 6. Roadmap

Four phases. Each is independently shippable and moves the north star. Ordered by
*leverage on depth-per-session*, respecting the dependency (engine → social →
league). Rough sizing is relative, not calendar.

### Phase 1 — Make the opinion loop *legible and rewarding* (the foundation)

*Thesis: people vote more when they can see their opinion matter. Today the loop
is invisible after the tap.*

> **STATUS (2026-07-25): 1a, 1b, 1c SHIPPED to main and verified live.** 1d
> (Daily-5) not started. See commits 488e474 (take-vs-crowd), 5009bf9 (value
> receipts + staged count RPC — migration NOT yet deployed), 4ed83c2 (Since you
> were away). All three verified against prod with a seeded test account +
> Playwright.

- **1a. "Your take vs the crowd" everywhere.** Every player row/detail shows the
  gap between the viewer's board and consensus ("You: WR4 · Crowd: WR9"). Turns
  passive rankings into a running argument. *Builds on the board + deltas already
  in Profile.tsx.*
- **1b. Value-move receipts.** On PlayerDetail, replace/augment the static
  Outlook with "**why this moved**": last 7/30d value delta + the events behind
  it (N real trades, M votes, direction). *The engine already has the events;
  this is surfacing.*
- **1c. Resolve notifications (the return hook).** The single highest-leverage
  missing primitive. "The crowd moved 220 toward your take on Nabers." "A player
  on your board spiked." "Your leaguemate made a trade." Start with a
  notifications table + an in-app bell; email/push later. *Nothing like this
  exists today; it is the reason to open the app on a given day.*
- **1d. One-tap contribution surfaces that respect attention.** Replace the
  once-per-session interrupt modal with a persistent, dismissible "Daily 5"
  opinion streak (5 quick calls, then you're done) — habit, not interruption.

**Moves the needle on:** opinions/session (1a, 1d), return-to-resolve (1c),
trust (1b).

### Phase 2 — Make opinions *social* (the multiplayer layer)

*Thesis: opinions are inherently competitive and communal. Right now you yap into
the void.*

- **2a. Hot Takes leaderboard.** Global + per-league boards of the spiciest
  defensible takes (biggest vs-crowd deltas that the market later *agreed* with =
  "called it"). Turns the board delta into status. *Raw signal exists per-user;
  never ranked across people.*
- **2b. Compare boards / follow.** Profile-vs-profile ("where you two disagree
  most"), and a lightweight follow so a grinder's board has an audience. The
  minimum social graph — no DMs, no timeline, just "whose reads do I track."
- **2c. Reactions + calls on feed items.** Give the machine-generated feed a
  human heartbeat: react to a trade, "fair/fleece" call on a trade (which is
  *also* a value vote — the react IS a contribution). *The feed union is already
  architected for new item kinds.*
- **2d. League takes.** For the commissioner wedge: "rank your league's rosters,"
  league-scoped hot-take board, "the league agrees/disagrees with you." Makes YAP
  league canon and pulls whole leagues in.

**Moves the needle on:** viral coefficient (2a/2b/2d), opinions/session (2c),
and the commissioner + casual users specifically.

### Phase 3 — Close the tool loops (utility that retains)

*Thesis: the trade tools are terminal calculators. Make them part of the loop.*

- **3a. Watchlist + value alerts.** Watch players/picks; get a resolve-notif when
  a target moves into trade range. Ties Phase 1c to the trade tools.
- **3b. Trade proposals.** "Open in Evaluator" exists; add "send to leaguemate"
  (even as a shareable link/image first, before any Sleeper write). Closes the
  finder→evaluator→dead-end gap.
- **3c. "Trades happening around this player."** On PlayerDetail, show real
  comparable trades from the ingested data. Grounds every valuation in reality.

**Moves the needle on:** depth/session, trust, and stickiness for the grinder.

### Phase 4 — Widen the opinion surface (the Rank 'Em multi-gauge vision)

*Thesis (yours, from the rank-em-multi-gauge memory): pairwise is one gauge. A
richer contribution surface gathers better signal and stays fresh.*

- New modalities feeding the same engine: **tiering** (drag into tiers),
  **over/under** on a value, **rank-a-room** (already prototyped as a chat
  widget — promote it), **hot-or-not streaks**, **"build the rankings" drafts.**
- More assistant widgets (trade-builder, chart, standings) so the text-to-SQL
  agent becomes a genuine co-pilot, not a buried search mode.

**Moves the needle on:** opinions/session (variety sustains volume), data quality
(more gauges = richer signal).

---

## 7. What to explicitly NOT build (or cut)

Focus is the product. Say no to:
- **A generic social timeline / posts / DMs.** We are not building Twitter. The
  social layer is *opinion-native* (reactions, calls, board-compares) — every
  social act is also a data contribution. No free-text feed.
- **Live scoreboard / gameday.** Sleeper does this well and it's a maintenance
  sink. Point to Sleeper; don't compete on it.
- **Playoff brackets / championship sync.** Acknowledged Sleeper API limitation.
  Keep the honest "regular-season #1" framing; don't fake it.
- **Non-dynasty / redraft formats (for now).** Depth in dynasty > breadth. The
  value curve and premiums are dynasty-tuned; stay there until the loop is loved.
- **The "Leagues" profile tab as currently stubbed** — either build it as "the
  leagues this manager plays + their standing" or remove the placeholder. Don't
  ship a dead tab on the viral surface.

---

## 8. The data foundation is ready (from the 2026-07 audit)

This vision leans on the engine being trustworthy. As of the July data audit it
is: values now cover the long tail (rookie/name-match gap fixed), the board no
longer truncates, RLS isolates user opinions correctly, and the personal-board
Elo trigger is verified. The opinion loop can be built on solid ground. See
`memory/data-side-audit-2026-07.md` and `memory/data-layer-map.md`.

Two engine capabilities this roadmap will lean on that already exist and are
under-used: **value history** (`player_value_history`, drives receipts + alerts)
and **event attribution** (`value_events.user_id`, drives hot-take leaderboards).

---

## 9. The first bet (if we build one thing next)

**Phase 1c: the notification/resolve primitive**, paired with **1a "your take vs
the crowd."** Rationale: the app has no reason-to-return today, and the spine's
whole payoff — "did the market come to my take?" — is invisible. Shipping the
resolve loop turns a deep tool people *visit* into an opinion game people *return
to*. It's also the substrate Phases 2 and 3 both need (leaderboards and alerts
are both notifications). Highest leverage per unit of build.

---

## 10. Risks & honest unknowns

- **Cold-start on social.** Leaderboards/compare are dull with few users. Mitigate
  by seeding with the grinder cohort first and keeping league-scoped social
  (which is populated from day one via Sleeper data) ahead of global social.
- **Vote quality vs volume.** More gauges risk noisier signal. The Glicko RD +
  recency decay already guard this; watch it as volume grows.
- **Notification fatigue.** The thing that brings people back can drive them away.
  Ship with tight defaults (resolve-only, batched) and user control.
- **Trust is fragile.** One visibly-wrong value (a rookie at $0, a stale star)
  undermines the whole "our values are real" pitch. The audit closed the current
  gaps; keep a standing data-quality guard (the new vitest suite is a start).
```
