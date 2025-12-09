# Design System & UI Overhaul - Sleeper League Dashboard

## Project Overview

You are a senior UI/UX designer and frontend developer tasked with overhauling the design system for a Fantasy Football Dynasty League Dashboard built with React, TypeScript, Vite, and Tailwind CSS. The application is functionally complete but needs a cohesive, professional design system applied throughout.

## Tech Stack
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **Icons**: Lucide React (already installed - use exclusively)
- **Data**: Supabase (PostgreSQL)
- **State**: TanStack Query (React Query)

## Design Direction

### Primary Inspiration
Take heavy design influence from **https://keeptradecut.com** - study their:
- Card layouts and data presentation
- Table designs and data density
- Typography hierarchy and spacing
- Dark/light theme implementation
- How they display player values, rankings, and trade information
- Their use of subtle gradients, borders, and shadows
- Hover states and micro-interactions

### Color Scheme

**Light Mode (Default):**
- Background: White (`#FFFFFF`) and light grays (`slate-50`, `slate-100`)
- Text: Dark grays and black (`slate-900`, `slate-700`, `slate-500`)
- Accent: Kelly Green (`#4CBB17` or similar - use for primary actions, active states, highlights)

**Dark Mode:**
- Background: Near-black (`#0a0a0a`, `#111111`, `#1a1a1a`)
- Text: White and light grays
- Accent: Kelly Green (same accent color, may need slight brightness adjustment for dark backgrounds)

**Theme Toggle:**
- Add a theme toggle in the Settings page
- Persist user preference in localStorage
- Implement using Tailwind's dark mode class strategy

**Position Colors (for player badges):**
- QB: Red tones
- RB: Green tones (differentiate from Kelly Green accent)
- WR: Blue tones
- TE: Orange/Yellow tones
- PICK: Cyan/Teal tones
- Keep these consistent across light/dark modes

### Icon Guidelines

**DO:**
- Use Lucide React icons exclusively (already installed)
- Use icons to enhance understanding, not as decoration
- Keep icons consistent in size within the same context (e.g., all nav icons same size)
- Color icons appropriately: muted for inactive states, accent color for active/primary
- Use icons in buttons where they add clarity (e.g., "Add Player" with Plus icon)

**DON'T:**
- Use emojis anywhere in the application (remove all existing emojis)
- Overuse icons - not every label needs an icon
- Mix icon styles or use icons from other packages
- Use icons as the sole indicator of meaning (pair with text when needed)

### Layout Structure

**Sidebar (Left - Keep this pattern):**
- Fixed left sidebar on desktop (current implementation is good)
- Collapsible/drawer on mobile
- Clean section headers (Home, Tools, League)
- Active state should be clearly visible with Kelly Green accent
- Smooth hover transitions

**Main Content Area:**
- Consistent padding and max-width constraints
- Responsive grid layouts
- Card-based design for distinct content sections

### Typography

- Use system font stack or a clean sans-serif (Inter, -apple-system, etc.)
- Clear hierarchy: Page titles → Section headers → Card headers → Body text → Captions
- Consistent font weights: Bold for headings, Medium for labels, Regular for body
- Appropriate line heights for readability

### Component Patterns

**Cards:**
- Subtle borders in light mode, slightly lighter backgrounds in dark mode
- Consistent border-radius (recommend `rounded-xl` for cards, `rounded-lg` for inner elements)
- Subtle shadows in light mode, no/minimal shadows in dark mode
- Clear visual separation between header, content, and footer areas

**Tables:**
- Zebra striping or hover highlights for rows
- Sticky headers for long lists
- Compact but readable row heights
- Sortable columns with clear indicators

**Buttons:**
- Primary: Kelly Green background, white text
- Secondary: Bordered/ghost style
- Destructive: Red tones for delete/remove actions
- Consistent padding, border-radius, and sizing

**Form Elements:**
- Clean, bordered inputs
- Clear focus states with Kelly Green ring
- Consistent height and padding
- Proper labels and placeholder text

**Badges/Tags:**
- Position badges with appropriate colors
- Rank badges (1st, 2nd, 3rd place indicators)
- Status badges (injury status, trade status)

### Mobile Responsiveness

**Requirements:**
- All pages must be fully functional on mobile
- Touch-friendly tap targets (minimum 44px)
- Appropriate text sizes (no text smaller than 14px on mobile)
- Single-column layouts on small screens
- Collapsible sections where appropriate
- Bottom navigation consideration for key actions
- Swipeable elements where intuitive

**Breakpoints (Tailwind defaults):**
- `sm`: 640px
- `md`: 768px
- `lg`: 1024px
- `xl`: 1280px

### Pages to Style

1. **Dashboard** - Overview stats, quick glances
2. **Trade Evaluator** - Multi-team trade builder with KTC values
3. **KTC Values** - Player/pick rankings table
4. **Standings** - League standings table
5. **Rosters** - Team cards with player lists and position grades
6. **Matchups** - Weekly matchup displays
7. **Transactions** - Trade/waiver history
8. **Drafts** - Draft history and picks
9. **Draft Capital** - Pick ownership visualization
10. **Sync Status** - Data sync monitoring
11. **Settings** - League info and theme toggle

### Specific Improvements Needed

1. **Remove all emojis** - Replace the 🏈 football emoji in the sidebar header with an appropriate Lucide icon or a simple text logo
2. **Implement dark mode** - Full dark mode support with toggle
3. **Standardize spacing** - Consistent gaps, padding, margins throughout
4. **Improve data tables** - Better styling for the KTC Values and other list views
5. **Enhance Trade Evaluator** - Make it visually impressive as a key feature
6. **Polish roster cards** - The position ranking badges need refinement
7. **Loading states** - Consistent skeleton loaders or spinners
8. **Empty states** - Well-designed empty state illustrations/messages
9. **Error states** - Clear error messaging with recovery actions

### Code Quality Standards

- Use Tailwind CSS utilities (avoid custom CSS unless absolutely necessary)
- Create reusable component patterns
- Keep components focused and composable
- Use TypeScript strictly (no `any` types where avoidable)
- Follow React best practices (proper key props, memoization where beneficial)
- Ensure accessibility (proper ARIA labels, keyboard navigation, color contrast)

### File Structure Reference

```
dashboard/src/
├── components/
│   └── Layout.tsx          # Sidebar and main layout
├── pages/
│   ├── Dashboard.tsx
│   ├── TradeEvaluator.tsx
│   ├── KTCValues.tsx
│   ├── Standings.tsx
│   ├── Rosters.tsx
│   ├── Matchups.tsx
│   ├── Transactions.tsx
│   ├── Drafts.tsx
│   ├── DraftCapital.tsx
│   ├── SyncStatus.tsx
│   └── LeagueSetup.tsx     # Settings page
├── lib/
│   ├── supabase.ts
│   └── sleeper-api.ts
├── types/
│   └── database.ts
├── App.tsx
├── main.tsx
├── App.css
└── index.css
```

### Deliverables

1. **Theme System** - Dark/light mode with Kelly Green accent
2. **Component Library** - Consistent, reusable styled components
3. **All Pages Styled** - Every page following the design system
4. **Mobile Responsive** - All pages work beautifully on mobile
5. **Accessibility** - WCAG 2.1 AA compliance
6. **Performance** - No unnecessary re-renders, optimized assets

### Getting Started

1. First, review all existing pages to understand the current state
2. Study keeptradecut.com for design patterns
3. Create a theme/design token system in Tailwind config if needed
4. Start with the Layout component (sidebar, theme toggle)
5. Work through each page systematically
6. Test on both desktop and mobile viewports
7. Verify dark/light modes on every change

---

**Remember**: Consistency is paramount. Every interaction, every shadow, every spacing unit should feel intentional and part of a unified system. When in doubt, refer back to keeptradecut.com for guidance on how to present fantasy football data beautifully.
