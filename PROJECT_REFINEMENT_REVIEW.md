# Sleeper Dashboard — Refinement Review

**Date:** April 9, 2026
**Scope:** Full-project sweep focused on whether features deliver real, actionable insights to a dynasty fantasy user. Extra focus on the Trade Evaluator and Trade Finder per your request.

---

## TL;DR

The dashboard has a solid skeleton: clean routing, sensible data layer via Supabase + TanStack Query, a thoughtful trade-value-adjustment algorithm, and a consistent visual language (TradeCard, AssetRow, PageHeader). What's holding it back from being genuinely useful is that almost every feature stops at *raw valuation* and never answers the question a dynasty manager actually asks: **"what does this do for my team?"**

The Trade Evaluator tells you who "wins" the KTC math. The Trade Finder surfaces value-neutral packages. Neither one tells you whether the trade improves your starting lineup, exposes a positional hole, helps your window (contend vs rebuild), or why the other team would ever say yes. That's the gap to close, and it's the single biggest lever on the product's value.

The good news: the foundations (adjusted value math, pick tiering, the TradeCard UI) are reusable. The refinements below are mostly *layers* you can add on top, not rewrites.

---

## The Biggest Gap (Read This First)

Every trade feature currently answers one question: *"Does side A's KTC total roughly equal side B's KTC total (with tier/stud/piece adjustments)?"*

A dynasty manager is actually asking:

1. Does this improve my **starting lineup** this week / this season?
2. Does it create or fill a **positional hole**?
3. Does it fit my **window** — am I contending, retooling, or rebuilding?
4. Does it **age up or age down** my roster?
5. Why would the **other team** accept this?
6. How does this compare to **historical trades** in the league and at the position?

Right now, none of these are answered. The adjusted-value math is a good *component*, but the product is only showing that component. This is the highest-leverage refinement direction for the whole project.

---

## Trade Evaluator — Deep Dive

**Files:** `src/pages/TradeEvaluator.tsx`, `src/lib/trade-value-adjustment.ts`, `src/lib/trade-shared.ts`

### What's working
- The two-side builder mirrors TradeCard styling — visually consistent with the rest of the app.
- `analyzeTrade()` produces a rich result object (`rawDifference`, `adjustedDifference`, tier mismatch explanation, fairness tier, winner index).
- Smooth stud-bonus gradient (fixed the old cliff-effect at 7000). Nice work.
- Dynamic near-even threshold via `FAIRNESS_CONFIG`.

### What's underdelivering

**1. Rich analysis is computed but never shown.**
`analyzeTrade()` returns `explanation`, `valueAdjustment`, `side1.adjustmentBreakdown`, `side2.adjustmentBreakdown`, etc. In `TradeEvaluator.tsx` only `fairness`, `adjustedDifference`, and `tierMismatchExplanation` make it to the UI. The user sees a single diff number and a bar chart. The *why* is hidden.
- Fix: surface each adjustment as its own line (raw → +stud → +consolidation → −pieces → −tier mismatch → adjusted). This is how KTC itself explains things and it builds trust in the number.

**2. No roster-fit analysis.**
After a trade, the evaluator should answer: *"What does each team's starting lineup and positional depth look like?"* Today it just shows a KTC total.
- Add a post-trade snapshot per side: projected starters at each roster slot (QB/RB/WR/TE/Flex/SF), total KTC by position, and a diff vs pre-trade. This is the single most valuable addition you could make.

**3. No context about the teams trading.**
Record, standings, playoff odds, draft pick tier, roster age — none of it factors in. A 30-year-old QB going to a contender is very different from the same player going to a rebuilder.
- Add a small "context strip" under each team selector: W-L, league rank, roster avg age, biggest positional strength/weakness. Then use that context to tag the trade ("Contender consolidation", "Rebuild move", "Win-now swing").

**4. "Near even" threshold is a magic number.**
`isNearEven = diff < 500` is hardcoded (line 132). Should scale with trade size — 500 KTC is rounding error on a $30k trade but a blowout on a $2k waiver swap.
- Fix: `isNearEven = diff < Math.max(300, totalAdjusted * 0.03)`.

**5. Winner determination has a latent bug.**
`winnerIndex = side1.adjustedTotal <= side2.adjustedTotal ? 0 : 1` (trade-value-adjustment.ts:331). When totals are exactly equal, side 0 is declared winner. Combined with the UI's "W"/"L" badges, this displays a winner on a perfectly even trade.
- Fix: return `winnerIndex: null` when totals are equal.

**6. No 3-team trades.**
Sleeper supports them, the transactions page handles them, but the evaluator hardcodes two sides.
- Optional medium-term: make `tradeSides` a dynamic array with an "Add team" button. The analysis math can stay 1-to-1 between pairs.

**7. Tier mismatch explanation is one-sided.**
`calculateTierMismatchPenalty` sets `explanation` to the first mismatch it finds and never overwrites — if both sides give up elites without equivalent return, only one direction is shown.
- Fix: return an array of explanations or mention both directions.

**8. Empty side doesn't guide the user.**
When one side has 0 assets, analysis is hidden without explanation. A new user won't know the evaluator is "waiting" for them.
- Fix: show a muted "Add at least one asset to each side to see analysis" hint.

**9. `FAIRNESS_CONFIG.border`, `.text`, `.barColor` are imported but unused** after the redesign. Dead code in `trade-shared.ts`. Either prune or start using them for consistent color treatment.

**10. No trade comparables.**
Useful: "3 similar trades happened in this league at this value range" — pulled from `transactions` table. Gives users historical reference.

**11. No "what if this goes wrong" / sensitivity.**
KTC values have variance. A single-point diff doesn't convey uncertainty. Show a ±10% band or label any trade inside ±5% as effectively a coin flip.

### Recommended Trade Evaluator roadmap

Priority order (each layer is independently shippable):

- **P0 — Explain the number.** Expand the analysis panel to show raw → adjustments → adjusted for both sides, with tooltips explaining each. Fix the winner=0 tie bug. Scale "near even" with trade size. *(1–2 days)*
- **P0 — Roster impact.** Add a "Post-trade roster" section per side: starting lineup, depth by position, total KTC by position, and a delta badge (+QB, −RB) compared to pre-trade. *(2–4 days, reuses buildPlayersForRoster.)*
- **P1 — Team context.** Context strip (record, rank, age) and auto-tag the trade type. *(1–2 days)*
- **P1 — Historical comparables.** Query `transactions` for trades within ±15% of this trade's adjusted value. *(1 day)*
- **P2 — Multi-team trades.** Convert to N-sided model. *(3–5 days, touches the analysis math.)*

---

## Trade Finder — Deep Dive

**Files:** `src/pages/TradeFinder.tsx`

This is the feature that needs the most work. Functionally it's a matchmaker — currently a matchmaker optimizing for the wrong objective.

### What's working
- Dump / Acquire mode split is intuitive.
- Pre-compute of team combos is a good perf instinct.
- Two-pass tolerance (wide pre-filter, tight post-analysis) is smart.
- "Give-package with extras" (sweeteners) in dump mode is a clever touch.
- Filters UI (positions, max pieces, preference) looks clean.

### Problems, in order of severity

**1. Optimizes for "fair" rather than "good for me".**
`scoreScenario` weights fairness (40%), top-asset quality (35%), concentration (25%). None of those factors in *what the user actually needs*. A rebuilder trading an aging WR is not helped by a package of "equal value" current starters — they want picks and youth.
- Fix: introduce `teamContext` (derived from standings + roster age + positional strength). Re-weight the score based on it. Add a "roster fit" score: does the return package fill a positional hole for the user, or add to a glut?

**2. Never considers why the trade partner would agree.**
The Finder treats the other team as a vending machine. In reality, each surfaced scenario should only appear if *their* adjusted-value side makes sense for their roster too. A trade that's "fair" but strips the Lions of their only RB2 won't happen.
- Fix: for each candidate scenario, compute a `partnerFitScore` using the same roster-fit logic applied to them. Drop scenarios where the partner's fit is negative. This alone will dramatically improve the realism of results.

**3. Combinatoric explosion is capped too aggressively.**
For 3-piece returns, only the top 25 assets by value are considered (`filteredAssets.slice(0, 25)`). A 12-team league with 30+ assets per team means the 3-piece return space is silently truncated — the user doesn't know valuable mid-tier combinations are being missed.
- Fix options: (a) raise the cap to 35 when `maxPieces >= 3`, (b) sample instead of truncating, or (c) add a user-visible note that deep 3-piece searches are partial. Also pre-prune: drop assets with value < 500 before combo generation.

**4. "Give-side sweetener" only works in dump mode.**
In acquire mode, `givePackages` is just `[selectedAssets]` (line 285). A user wanting to acquire Ja'Marr Chase can't see scenarios where "your WR3 + a pick" unlocks the deal.
- Fix: mirror the sweetener logic for acquire mode — iterate the user's roster extras to augment what they give up.

**5. Position filter is an OR over return combos and accidentally excludes mixed packages.**
Lines 315–320: if you filter for "RB", `filteredAssets` is reduced to RBs before combinations are generated, so you'll never see "1 RB + 1 pick" packages.
- Fix: filter at the *combo* level — require at least one asset matches the position filter — not at the input level.

**6. `maxPieces` applies only to the return side.**
If I send 1 asset, the return can be up to 3 — but I can't cap my give side at 1. Asymmetric and confusing.
- Fix: apply the limit symmetrically, or rename to "Max return pieces" (which you already do in the label) and also expose "Max give pieces".

**7. Sorting/scoring is opaque.**
The user sees 50 scenarios with no sort control and no way to understand why #1 beat #17. The interleave-exact-with-expanded logic (lines 474–487) is particularly confusing — the ordering is deterministic but not intuitive.
- Fix: expose a sort dropdown (Fairness / Return quality / Concentration / Best fit) and add a small "why this ranked" tooltip on each card. Consider separating "Exact trades" and "Sweetener trades" into two tabs instead of interleaving.

**8. `setTimeout(..., 100)` fake-loading.**
Line 278 uses a 100ms setTimeout purely to let the "Searching..." state render. For real leagues this search can take hundreds of ms and blocks the main thread.
- Fix: move the search into a Web Worker (or at minimum a proper `requestIdleCallback`/`startTransition`) so the UI stays responsive and the loading state is honest.

**9. Target-team selector UX is ambiguous.**
In dump mode, leaving "target team" empty means "search all teams". It's displayed as "Any team" but the clear-X button is present, the clicks flow oddly, and nothing explains the difference between picking one team and leaving it open.
- Fix: make "Any team" an explicit first option in the team picker with an icon, not a default-by-omission.

**10. Pre-filter band (1.5×) is a guess.**
Comment says "to catch trades that may shift after full analysis". That's true but the number is unjustified. Worth measuring empirically: generate all combos, compute the actual max shift between raw-adjusted and post-tier-mismatch adjusted, and set the band accordingly.

**11. Scenarios cap of 50 with complicated interleave logic.**
Users don't know what's being hidden. Consider:
- Show all that pass (most leagues won't be overwhelming).
- Or: show 25 by default with a "Show more" button.
- Or: group by partner team so each team has its top-N surfaced.

**12. No "save trade" / "share trade" / "copy to evaluator".**
Users find a scenario they like → dead end. Biggest quick win for stickiness: "Open in Evaluator" button on each scenario card, so they can tweak it.

**13. `structuralSharing: false` on the playerValues Map.**
`src/hooks/queries.ts:89` disables structural sharing because Maps aren't supported. That means every invalidation refetches all values and triggers a cascade. Consider storing as a plain Record for structural sharing OR using `select` to transform inside the hook only when consumed.

### Recommended Trade Finder roadmap

- **P0 — Partner fit gate.** Compute adjusted-value impact on the partner's roster, drop scenarios that worsen their positional balance. *(2–3 days.)* This is the single biggest quality win.
- **P0 — User fit score + tunable scoring weights.** Add a "roster fit" dimension (does the return address a positional weakness?), expose sort options, add a transparent "why this ranked" tooltip. *(2 days.)*
- **P0 — Fix position filter at combo level.** *(half day, pure bug.)*
- **P0 — "Open in Evaluator" action.** Route with state so users can continue workflow. *(half day.)*
- **P1 — Symmetric sweetener logic for acquire mode.** *(1 day.)*
- **P1 — Move search into a Web Worker.** *(1–2 days.)* Big UX improvement on larger leagues.
- **P1 — Explicit "Any team" option + UX cleanup on team picker.** *(half day.)*
- **P2 — Tabbed results (exact vs sweeteners) + transparent sorting controls.** *(1 day.)*
- **P2 — Raise combo caps or sample smarter.** *(1 day, needs measurement.)*

---

## Trade Value Adjustment Algorithm

**File:** `src/lib/trade-value-adjustment.ts`

This is genuinely thoughtful code — the smooth stud-bonus gradient and tier-mismatch penalty are both real improvements over a raw sum. A few real issues though:

**1. Winner on ties.** See Evaluator issue #5 above.

**2. Tier mismatch overwrites its own explanation.** Only surfaces one of the two mismatch directions. `explanation = explanation || ...` on lines 119, 124, 129. Should be an array.

**3. Hard-coded tier thresholds don't adapt to league format.** 7000 as "elite" is superflex-y. Standard leagues have a lower ceiling. Consider:
- Reading KTC distribution at load and setting tiers dynamically (e.g. elite = top 5%, star = top 15%), or
- At minimum, exposing thresholds as config so superflex vs. standard can be toggled.

**4. Pieces penalty is coarse.** Four stars get the same 3% penalty as four fliers mixed with one depth piece (both paths hit the `assets.length >= 4` branch but not the lowValuePieces >= 4 branch). Penalty should scale by the *distribution* of values in the package, not just counts.

**5. Tier mismatch only checks the single highest asset on each side.** Trading two ultra-elites for one elite + one depth is not caught. Consider comparing the top-K assets by tier.

**6. Projected pick tier is standings-based, not season-based.** `getProjectedPickTier` in trade-shared.ts uses current wins/losses to project pick tier. During offseason that means every pick is "late" which undervalues rebuilders' future picks. The pick-tier logic should differentiate (a) current season (standings-based) from (b) future years (consensus "market" value), and probably also blend in preseason power rankings.

**7. No positional scarcity adjustment.** QBs in superflex, TEs in TE-premium, RBs in PPR are all worth relative premiums the flat KTC number doesn't fully capture for a specific league. If you persist league settings, use them.

**8. No rookie / taxi / contract flags.** Only relevant if your league format uses them, but worth at least a comment about.

### Recommended algorithm work

- **P0 — Return `winnerIndex: null` on exact ties.** *(5 min.)*
- **P0 — Join tier-mismatch explanations from both sides.** *(15 min.)*
- **P1 — Make thresholds league-aware** (superflex vs standard minimum, pulled from `leagues` table settings). *(1 day.)*
- **P1 — Pieces penalty reform.** Use a Herfindahl-style concentration metric instead of binary thresholds. *(half day.)*
- **P2 — Pick tier: split current-year-standings from future-year-market.** *(1–2 days, requires thinking through data model.)*
- **P2 — Positional scarcity multiplier** driven by league roster slots. *(1 day.)*

---

## Other Pages (Secondary Findings)

### Home.tsx
- Duplicates the rosters fetch instead of using `useRosters`. Move to the shared hook.
- Uses `any[]` liberally. Typing this properly is low effort and catches real bugs.
- `draft_picks` rough-valuing in the trades section hardcodes `round === 1 ? 5000 : 2000 : 800 : 400`. Same crude constants show up in Transactions.tsx. This diverges from your real pick-values table — single source of truth needed.
- Power Rankings use raw total KTC. Consider a toggle to show the *weighted positional* value (the same logic that's already in KTCValues.tsx's `calcWeightedPositionValue`).

### KTCValues.tsx
- Biggest file in the project (713 lines). The `calcWeightedPositionValue` + `POSITION_WEIGHT_TIERS` logic is great and should be **promoted to `trade-shared.ts`** so the Evaluator, Finder, and Home page all use the same definition of "team strength at position X".
- The two tabs (Players, Teams) are large enough they could each be their own file.
- Pick fallback values `round === 1 ? 5000 : ...` repeated here too — centralize.

### Transactions.tsx
- `while (true)` loop fetching 1000 rows at a time without a hard ceiling. For an old league this could pull thousands of rows on every page visit. Paginate server-side via range + a `LIMIT` the user can bump.
- Trade value scoring repeats trade math instead of calling `analyzeTrade()`. Shared code would make this consistent with the Evaluator.
- Hardcoded pick values again.
- `typeFilter`, `sortBy`, `currentPage` are local `useState`. Consider moving to URL params so trades are shareable.

### Drafts.tsx
- Defines its own `Player`, `LeagueUser`, `TradedPick` interfaces instead of importing from `types/domain.ts`. Consolidate.
- Single big `useQuery` that fetches six tables in one function — harder to cache, invalidate, or refetch independently. Split into discrete queries.

### Settings.tsx
- Mixes league config, sync logs, cron management, and danger-zone actions in one 586-line file. The sync-management block feels like it wants to be its own `/admin` route.
- Pattern of `SYNC_TYPE_CONFIG` + `CRON_DESCRIPTIONS` separately is fragile — merge so sync type and its cron description live together.

### General code-quality notes
- `any` shows up in many places (Home, Transactions, Drafts). TypeScript rigor would catch real bugs.
- No tests anywhere. At minimum, add unit tests for `calculateSideValue` / `analyzeTrade` / `calculateTierMismatchPenalty` — they're pure functions with clear invariants and they're the bedrock of your product.
- No error boundaries around Trade Tools. One bad render throws users to a blank screen.
- Two player-value Maps exist (`Map<string, PlayerValue>` and `Map<string, number>`). Collapse to one.
- Multiple pages re-fetch rosters/users/league_users independently — centralize behind `useLeagueData` and dependent hooks.

---

## Prioritized Refinement Plan

If I had to pick the five things that would most improve the *perceived value* of this product per hour of engineering, in order:

1. **Partner-fit filtering in Trade Finder** — stops surfacing unrealistic trades. (2–3 days)
2. **Post-trade roster snapshot in Trade Evaluator** — answers "what does this do for my team". (2–4 days)
3. **Promote `calcWeightedPositionValue` to shared lib and use it everywhere** — unlocks roster-fit and team-context scoring across the app. (1 day)
4. **Explain the adjusted-value number** — show raw → adjustments → adjusted breakdown with tooltips. (1 day)
5. **"Open in Evaluator" on Trade Finder cards + roster-fit score + sort controls** — closes the workflow loop. (2 days)

Roughly a two-week block of focused work would move the product from "accurate calculator" to "genuine dynasty advisor".

---

## Quick Wins (under an hour each)

- `winnerIndex` null on ties (trade-value-adjustment.ts:331).
- Make `isNearEven` scale with trade size (TradeEvaluator.tsx:132).
- Join tier-mismatch explanations instead of overwriting (trade-value-adjustment.ts:119–129).
- Fix position filter to apply at combo level, not input level (TradeFinder.tsx:315–320).
- Centralize the crude pick-round defaults (`5000/2000/800/400`) — they exist in at least three files.
- Delete unused `FAIRNESS_CONFIG.border/text/barColor` fields or start using them.
- Surface `analyzeTrade()`'s `explanation` and `adjustmentBreakdown` strings in the Evaluator UI.
- Add a simple hint when one Evaluator side is empty.
- Strip `any[]` from Home.tsx and Transactions.tsx in the paths that already have types available.

---

## Open Questions I Couldn't Answer From the Code

- Is this superflex, standard, or both? Several defaults assume superflex.
- Is `leagues.settings` being populated with roster slots / scoring format? If yes, positional scarcity is ready to build; if no, that needs data model work first.
- Are you planning to support multiple leagues per user? The current data layer implicitly assumes one current league.
- What's the expected league size? The combinatoric caps matter more in 14- and 16-team leagues.

Answers to these change the specific recommendations in a few spots, especially around algorithm thresholds and combo caps.
