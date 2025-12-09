# UI/UX Redesign Plan

> **Note**: This is the reference document for the UI/UX redesign. See `UI_UX_AGENT_PROMPT.md` for the agent instructions.

---

## Tech Stack

- **Framework**: React 18 with TypeScript
- **Styling**: Tailwind CSS (utility classes only)
- **Icons**: Lucide React
- **State**: TanStack Query
- **Data**: Supabase

**Design system (colors, dark mode) is already complete. Do not change.**

---

## Global Spacing Standards

Apply these spacing standards **consistently across all pages**:

### Page Container
```tsx
<div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
```

### Section Spacing
- **Between major sections**: `space-y-8` or `gap-8`
- **Between cards in a grid**: `gap-6`
- **Inside cards**: `p-6` (desktop), `p-4` (mobile)
- **Between card header and content**: `mb-4` or `mb-6`
- **Between list items**: `space-y-3` or `divide-y`

### Typography Spacing
- **Page title to description**: `mt-1` or `mt-2`
- **Section header to content**: `mb-4` or `mb-6`
- **Label to value**: `mt-1`

---

## Component Patterns

### Section Headers
Every section should have a clear header explaining its purpose:
```tsx
<div className="mb-6">
  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Section Title</h2>
  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Brief description of what this shows</p>
</div>
```

### Cards
```tsx
<div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-6 shadow-sm dark:shadow-none">
  {/* Card content */}
</div>
```

### List Items (Clickable)
```tsx
<button className="w-full text-left p-4 rounded-lg border border-slate-200 dark:border-zinc-700 hover:border-accent-300 dark:hover:border-accent-500/50 hover:bg-accent-50/50 dark:hover:bg-accent-500/5 transition-all">
  {/* List item content */}
</button>
```

### Data Display (Label + Value)
```tsx
<div>
  <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Label</span>
  <p className="text-lg font-semibold text-slate-900 dark:text-white mt-1">Value</p>
</div>
```

### Empty States
```tsx
<div className="flex flex-col items-center justify-center py-12 text-center">
  <div className="w-16 h-16 bg-slate-100 dark:bg-zinc-800 rounded-2xl flex items-center justify-center mb-4">
    <Icon className="h-8 w-8 text-slate-400" />
  </div>
  <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">No Data</h3>
  <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm">Helpful description</p>
</div>
```

---

## Page-by-Page Redesign Plan

---

### 1. Dashboard (`Dashboard.tsx`)

**Current Issues:**
- Good overall structure but could use more breathing room
- Quick links section feels cramped

**Redesign Plan:**

**Layout Structure:**
```
┌─────────────────────────────────────────────────────────┐
│ Header: "Dashboard" + "Connected" badge                 │
├─────────────────────────────────────────────────────────┤
│ League Hero Card (full width, gradient)                 │
│ - League name, season, team count, status              │
├─────────────────────────────────────────────────────────┤
│ ┌─────────┬─────────┬─────────┐                        │
│ │ Teams   │ Matchups│ Trades  │  Stats Row             │
│ └─────────┴─────────┴─────────┘                        │
├─────────────────────────────────────────────────────────┤
│ Quick Actions Grid (larger touch targets)               │
│ ┌─────────────┬─────────────┬─────────────┐            │
│ │ Standings   │ Matchups    │ Transactions│            │
│ └─────────────┴─────────────┴─────────────┘            │
├─────────────────────────────────────────────────────────┤
│ Recent Activity / Sync Status                           │
└─────────────────────────────────────────────────────────┘
```

**Changes Required:**
- Add `p-6 lg:p-8` container padding
- Increase gap between sections to `space-y-8`
- Make quick action cards taller with better descriptions

---

### 2. Rosters (`Rosters.tsx`) ⚠️ MAJOR REDESIGN

**Current Issues:**
- Grid layout is confusing
- Shows "username" instead of "team name"
- Team grades/values are not clearly labeled
- Expanded roster view is cluttered

**Redesign Plan:**

**Layout Structure:**
```
┌─────────────────────────────────────────────────────────┐
│ Header: "Rosters" + Team count badge                    │
├─────────────────────────────────────────────────────────┤
│ VERTICAL LIST OF TEAMS (not grid!)                      │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐│
│ │ Team Card (collapsed)                               ││
│ │ ┌─────────────────────────────────────────────────┐ ││
│ │ │ Team Name              Total Value: 45,230      │ ││
│ │ │ Owner: username        ▼ Expand                 │ ││
│ │ └─────────────────────────────────────────────────┘ ││
│ │                                                     ││
│ │ Position Grades Bar (horizontal, always visible)    ││
│ │ ┌────┬────┬────┬────┬──────┐                       ││
│ │ │ QB │ RB │ WR │ TE │PICKS │  with rank badges    ││
│ │ │ #3 │ #1 │ #5 │ #8 │ #2   │                       ││
│ │ └────┴────┴────┴────┴──────┘                       ││
│ └─────────────────────────────────────────────────────┘│
│                                                         │
│ ┌─────────────────────────────────────────────────────┐│
│ │ Team Card (EXPANDED)                                ││
│ │ [Team header same as above]                         ││
│ │                                                     ││
│ │ ┌─────────────────────────────────────────────────┐ ││
│ │ │ PLAYERS (organized by position)                 │ ││
│ │ │                                                 │ ││
│ │ │ Quarterbacks                                    │ ││
│ │ │ ├── Patrick Mahomes    KC    9,500              │ ││
│ │ │ └── Trey Lance         DAL   1,200              │ ││
│ │ │                                                 │ ││
│ │ │ Running Backs                                   │ ││
│ │ │ ├── Bijan Robinson     ATL   8,200              │ ││
│ │ │ ├── Breece Hall        NYJ   7,100              │ ││
│ │ │ └── ...                                         │ ││
│ │ └─────────────────────────────────────────────────┘ ││
│ │                                                     ││
│ │ ┌─────────────────────────────────────────────────┐ ││
│ │ │ DRAFT PICKS                                     │ ││
│ │ │                                                 │ ││
│ │ │ 2025                     2026                   │ ││
│ │ │ ├── Early 1st  4,500     ├── Mid 1st    3,200  │ ││
│ │ │ ├── Mid 2nd    1,200     └── Late 3rd     400  │ ││
│ │ │ └── Late 3rd     400                           │ ││
│ │ └─────────────────────────────────────────────────┘ ││
│ └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

**Key Changes:**
1. **Single column layout** - vertical list, not grid
2. **Team Name** prominently displayed (not username)
3. **Owner name** shown smaller, secondary
4. **"Team Value Grades" section header** with explanation
5. **Position grades** shown as horizontal bar with clear labels
6. **Expanded view** organized by position groups
7. **Players grouped** under position headers (QB, RB, WR, TE)
8. **Draft picks grouped** by year with tier labels

**Data Display Requirements:**
- Always show: Team Name, Owner, Total Value
- Always show: Position grades bar (QB/RB/WR/TE/PICKS ranks)
- On expand: Grouped player list + grouped pick list

---

### 3. Transactions (`Transactions.tsx`) ⚠️ MAJOR REDESIGN

**Current Issues:**
- Trade details are confusing - unclear what each team received
- No visual separation between trade sides
- Player names without position context

**Redesign Plan:**

**Layout Structure for Trades:**
```
┌─────────────────────────────────────────────────────────┐
│ TRADE - Dec 8, 2024                                     │
├─────────────────────────────────────────────────────────┤
│ ┌─────────────────────┐   ┌─────────────────────┐      │
│ │ TEAM A RECEIVES:    │   │ TEAM B RECEIVES:    │      │
│ │                     │ ⇄ │                     │      │
│ │ • Patrick Mahomes   │   │ • 2025 Early 1st    │      │
│ │   QB · KC · 9,500   │   │   Pick · 4,500      │      │
│ │                     │   │                     │      │
│ │ • Trey Lance        │   │ • Davante Adams     │      │
│ │   QB · DAL · 1,200  │   │   WR · LV · 3,200   │      │
│ │                     │   │                     │      │
│ │ Total: 10,700       │   │ Total: 7,700        │      │
│ └─────────────────────┘   └─────────────────────┘      │
│                                                         │
│ Trade Differential: Team A +3,000 (Win)                 │
└─────────────────────────────────────────────────────────┘
```

**Layout Structure for Waivers/Free Agents:**
```
┌─────────────────────────────────────────────────────────┐
│ WAIVER CLAIM - Dec 7, 2024                              │
├─────────────────────────────────────────────────────────┤
│ Team Name                                               │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐│
│ │ ➕ ADDED: Jordan Mason                              ││
│ │    RB · SF · Undrafted                              ││
│ └─────────────────────────────────────────────────────┘│
│ ┌─────────────────────────────────────────────────────┐│
│ │ ➖ DROPPED: Chris Rodriguez                         ││
│ │    RB · WAS                                         ││
│ └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

**Key Changes:**
1. **Clear "TEAM RECEIVES" headers** for each side
2. **Side-by-side layout** for trades (two columns)
3. **Visual arrow/swap icon** between trade sides
4. **Player cards** with position badge + team + value
5. **Total value** for each side
6. **Trade differential** showing who "won"
7. **Different layouts** for trades vs waivers vs free agents

---

### 4. Drafts (`Drafts.tsx`) ⚠️ MAJOR REDESIGN

**Current Issues:**
- Information overload - too much crammed together
- Unclear separation between draft history and traded picks
- Pick order is hard to follow

**Redesign Plan:**

**Layout Structure:**
```
┌─────────────────────────────────────────────────────────┐
│ Header: "Drafts & Draft Capital"                        │
├─────────────────────────────────────────────────────────┤
│ TAB NAVIGATION                                          │
│ ┌────────────────┬─────────────────┐                   │
│ │ Draft History  │ Traded Picks    │                   │
│ └────────────────┴─────────────────┘                   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ TAB: DRAFT HISTORY                                      │
│                                                         │
│ Draft Selector: [2024 Rookie Draft ▼]                   │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐│
│ │ ROUND 1                                             ││
│ │ ┌─────┬─────────────────┬──────────┬──────────────┐ ││
│ │ │Pick │ Player          │ Position │ Team         │ ││
│ │ ├─────┼─────────────────┼──────────┼──────────────┤ ││
│ │ │ 1.01│ Caleb Williams  │ QB       │ Team Alpha   │ ││
│ │ │ 1.02│ Marvin Harrison │ WR       │ Team Beta    │ ││
│ │ │ 1.03│ Malik Nabers    │ WR       │ Team Gamma   │ ││
│ │ │ ... │ ...             │ ...      │ ...          │ ││
│ │ └─────┴─────────────────┴──────────┴──────────────┘ ││
│ └─────────────────────────────────────────────────────┘│
│                                                         │
│ ┌─────────────────────────────────────────────────────┐│
│ │ ROUND 2                                             ││
│ │ [Same table format]                                 ││
│ └─────────────────────────────────────────────────────┘│
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ TAB: TRADED PICKS                                       │
│                                                         │
│ Year Selector: [2025 ▼] [2026] [2027] [2028]           │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐│
│ │ 2025 Draft Pick Ownership                           ││
│ │                                                     ││
│ │ Round 1                                             ││
│ │ ┌─────────────────────────────────────────────────┐ ││
│ │ │ Team Alpha's 1st → Now owned by Team Beta       │ ││
│ │ │ Team Gamma's 1st → Now owned by Team Delta      │ ││
│ │ └─────────────────────────────────────────────────┘ ││
│ │                                                     ││
│ │ Round 2                                             ││
│ │ ┌─────────────────────────────────────────────────┐ ││
│ │ │ [Same format]                                   │ ││
│ │ └─────────────────────────────────────────────────┘ ││
│ └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

**Key Changes:**
1. **Tab separation** between Draft History and Traded Picks
2. **Draft selector dropdown** to choose which draft to view
3. **Picks grouped by round** with clear round headers
4. **Table format** for picks: Pick #, Player, Position, Drafting Team
5. **Traded picks** shown as "Original Owner → Current Owner"
6. **Year selector** for future pick ownership

---

### 5. Trade Evaluator (`TradeEvaluator.tsx`)

**Current Issues:**
- Could use better visual separation between trade sides
- Asset lists need more organization

**Redesign Plan:**

**Layout Structure:**
```
┌─────────────────────────────────────────────────────────┐
│ Header: "Trade Evaluator"                               │
│ Subtitle: "Build and analyze potential trades"          │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ TRADE BUILDER                                           │
│                                                         │
│ ┌──────────────────────┐   ┌──────────────────────┐    │
│ │ SIDE A               │   │ SIDE B               │    │
│ │ [Select Team ▼]      │ ⇄ │ [Select Team ▼]      │    │
│ ├──────────────────────┤   ├──────────────────────┤    │
│ │                      │   │                      │    │
│ │ Assets Being Traded: │   │ Assets Being Traded: │    │
│ │                      │   │                      │    │
│ │ Players:             │   │ Players:             │    │
│ │ • Mahomes  9,500  ✕  │   │ • Adams   3,200  ✕   │    │
│ │                      │   │                      │    │
│ │ Picks:               │   │ Picks:               │    │
│ │ • 2025 1st 4,500 ✕   │   │ (none)               │    │
│ │                      │   │                      │    │
│ │ [+ Add Player]       │   │ [+ Add Player]       │    │
│ │ [+ Add Pick]         │   │ [+ Add Pick]         │    │
│ │                      │   │                      │    │
│ │ ──────────────────── │   │ ──────────────────── │    │
│ │ Total: 14,000        │   │ Total: 3,200         │    │
│ └──────────────────────┘   └──────────────────────┘    │
│                                                         │
├─────────────────────────────────────────────────────────┤
│ TRADE ANALYSIS                                          │
│ ┌─────────────────────────────────────────────────────┐│
│ │                                                     ││
│ │      Side A Value    │    Side B Value             ││
│ │        14,000        │      3,200                  ││
│ │                                                     ││
│ │ ═══════════════════════════════════════════════    ││
│ │ ████████████████████████░░░░░░░  (Value Bar)       ││
│ │                                                     ││
│ │         Difference: +10,800 for Side A             ││
│ │         (Side B needs to add ~10,800 in value)     ││
│ │                                                     ││
│ └─────────────────────────────────────────────────────┘│
│                                                         │
│ [+ Add Third Team]                                      │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Key Changes:**
1. **Clear side labels** "SIDE A" and "SIDE B"
2. **Assets organized** by type (Players, Picks)
3. **Running total** for each side
4. **Visual value bar** comparing both sides
5. **Difference calculation** with recommendation

---

### 6. Standings (`Standings.tsx`)

**Current Issues:**
- Generally good, could use minor polish

**Improvements:**
- Add more spacing between top 3 cards and table
- Consider adding Points For/Against columns
- Add win streak indicator

---

### 7. Matchups (`Matchups.tsx`)

**Current Issues:**
- Needs clearer matchup cards

**Redesign Plan:**
```
┌─────────────────────────────────────────────────────────┐
│ MATCHUP                                                 │
│ ┌─────────────────────┬───┬─────────────────────┐      │
│ │                     │   │                     │      │
│ │ Team Alpha          │VS │ Team Beta           │      │
│ │ 127.5 pts           │   │ 115.2 pts           │      │
│ │                     │   │                     │      │
│ │ ✓ WINNER            │   │                     │      │
│ └─────────────────────┴───┴─────────────────────┘      │
└─────────────────────────────────────────────────────────┘
```

---

### 8. KTC Values / Player Values (`KTCValues.tsx`, `PlayerValues.tsx`)

**Current Issues:**
- Long table needs better visual hierarchy
- Consider tier grouping

**Improvements:**
- Add tier section headers (Tier 1, Tier 2, etc.)
- Improve filter/search bar styling
- Add alternating row colors

---

### 9. Draft Capital (`DraftCapital.tsx`)

**Current Issues:**
- Matrix view needs clearer headers
- Confusing ownership indicators

**Improvements:**
- Add row/column headers that stick
- Use clearer colors for own pick vs acquired pick vs traded away
- Add legend

---

### 10. League Setup (`LeagueSetup.tsx`)

**Current Issues:**
- Generally good structure

**Improvements:**
- More visual hierarchy in stats section
- Group related settings together

---

### 11. Sync Status (`SyncStatus.tsx`)

**No major changes needed** - this is a utility page.

---

## Implementation Order

1. **Rosters.tsx** - Highest impact, major restructure
2. **Transactions.tsx** - Critical for understanding trades
3. **Drafts.tsx** - Complex, needs tab structure
4. **TradeEvaluator.tsx** - Key feature, needs polish
5. **Dashboard.tsx** - Quick spacing fixes
6. **Standings.tsx** - Minor improvements
7. **Matchups.tsx** - Card redesign
8. **KTCValues.tsx** - Table improvements
9. **DraftCapital.tsx** - Matrix clarity
10. **LeagueSetup.tsx** - Minor polish

---

## Testing Checklist

For each page, verify:
- [ ] Consistent padding (`p-6 lg:p-8` on container)
- [ ] Proper spacing between sections (`space-y-8`)
- [ ] Clear section headers with descriptions
- [ ] Dark mode looks correct
- [ ] Mobile responsive (single column, proper sizing)
- [ ] Data is immediately understandable
- [ ] Position badges use correct colors
- [ ] Loading states show properly
- [ ] Empty states are helpful

---

## Key Principles to Follow

1. **Show team names, not usernames** - Teams have identity
2. **Group related data** - Position groups, time periods, etc.
3. **Use clear labels** - "Team Value Grades" not just numbers
4. **Side-by-side for comparisons** - Trades, matchups
5. **Vertical lists for browsing** - Rosters, transactions
6. **Tables for dense data** - Draft picks, standings
7. **Progressive disclosure** - Collapse by default, expand for detail
8. **Consistent spacing** - Use the standards defined above
9. **White space is clarity** - Don't cram everything together
10. **Mobile-first thinking** - Stack on small screens

---

## Files to Modify

```
dashboard/src/pages/
├── Dashboard.tsx      (minor)
├── Rosters.tsx        (MAJOR)
├── Transactions.tsx   (MAJOR)
├── Drafts.tsx         (MAJOR)
├── TradeEvaluator.tsx (moderate)
├── Standings.tsx      (minor)
├── Matchups.tsx       (moderate)
├── KTCValues.tsx      (minor)
├── PlayerValues.tsx   (minor)
├── DraftCapital.tsx   (moderate)
├── LeagueSetup.tsx    (minor)
└── SyncStatus.tsx     (none)
```

---

## Success Criteria

A user should be able to:
1. **Rosters**: Instantly see team name, value ranking, and position strengths
2. **Transactions**: Immediately understand what each team received in a trade
3. **Drafts**: Quickly find who drafted which player and what round
4. **Trade Evaluator**: Easily build trades and see value comparison
5. **All Pages**: Navigate with zero confusion about what they're looking at

**The goal is zero cognitive load.** Every piece of information should be self-explanatory.
