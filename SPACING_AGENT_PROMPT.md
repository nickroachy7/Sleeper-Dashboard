# UI Spacing & Padding Agent Prompt

## Project Context
You are working on a Fantasy Football Dynasty League Dashboard built with:
- **React 18 + TypeScript**
- **Tailwind CSS v4** (utility-first CSS framework)
- **Vite** as the build tool
- **Location**: `/Users/n.roach/Desktop/Sleeper League/dashboard/`

## Your Mission
Audit and fix ALL spacing and padding issues across the entire project to ensure a polished, professional appearance. The goal is **visual breathing room** - elements should never touch edges, overlap, or feel cramped.

## Key Files to Review
All files in `dashboard/src/pages/`:
- `Dashboard.tsx`
- `Standings.tsx`
- `Rosters.tsx`
- `Matchups.tsx`
- `Transactions.tsx`
- `Drafts.tsx`
- `DraftCapital.tsx`
- `TradeEvaluator.tsx`
- `KTCValues.tsx`
- `PlayerValues.tsx`
- `LeagueSetup.tsx`
- `SyncStatus.tsx`

Also review:
- `dashboard/src/components/Layout.tsx` (sidebar navigation)
- `dashboard/src/index.css` (global styles)

## Spacing Standards to Apply

### 1. Page Container Padding
Every page's main container should have generous padding:
```tsx
// GOOD
<div className="p-8 lg:p-12 max-w-7xl mx-auto">

// BAD - too cramped
<div className="p-4 max-w-7xl mx-auto">
<div className="p-6 lg:p-8 max-w-7xl mx-auto">
```

### 2. Section Spacing (Vertical)
Use explicit margins between major sections (NOT `space-y-*` which may not work in Tailwind v4):
```tsx
// GOOD - explicit margins
<div className="mb-8">  {/* Header section */}
<div className="mt-8 mb-8">  {/* Middle section */}
<div className="mt-8">  {/* Final section */}

// BAD - may not render properly
<div className="space-y-8">
```

### 3. List Item Spacing
Cards/items in a list should have gaps between them:
```tsx
// GOOD
<div className="space-y-6">  {/* For vertical lists */}
<div className="grid gap-6">  {/* For grids */}

// BAD - too tight
<div className="space-y-2">
<div className="space-y-4">
<div className="grid gap-4">
```

### 4. Card Internal Padding
Cards and containers need internal breathing room:
```tsx
// GOOD
<div className="p-6">  {/* Standard card padding */}
<div className="px-6 py-5">  {/* Asymmetric if needed */}

// BAD - too cramped
<div className="p-3">
<div className="p-4">
```

### 5. Table Cell Padding
Table cells need adequate padding:
```tsx
// GOOD
<td className="px-5 py-4">
<th className="px-5 py-4">

// BAD
<td className="px-3 py-2">
<td className="px-4 py-3">
```

### 6. Grid Gaps
Grids should have generous gaps:
```tsx
// GOOD
<div className="grid grid-cols-2 gap-6">
<div className="grid grid-cols-3 gap-8">

// BAD
<div className="grid grid-cols-2 gap-2">
<div className="grid grid-cols-3 gap-4">
```

### 7. Sidebar Navigation
Nav items should have comfortable spacing:
```tsx
// GOOD
<div className="space-y-2">  {/* Between nav items */}
<a className="px-4 py-3">  {/* Nav link padding */}

// BAD
<div className="space-y-1">
<a className="px-3 py-2">
```

## Common Issues to Fix

1. **Elements touching page edges** - Add container padding
2. **List items stacked too tight** - Increase `space-y-*` or `gap-*` values
3. **Cards with cramped content** - Increase internal `p-*` padding
4. **Sections bleeding into each other** - Add explicit `mb-8` / `mt-8` margins
5. **Table rows too compact** - Increase cell padding
6. **Header too close to content** - Add `mb-8` after header sections
7. **Sidebar items cramped** - Increase nav padding and spacing

## Process

1. **Read each page file** to understand its structure
2. **Identify spacing issues** by looking for:
   - `p-4` or smaller padding on containers
   - `gap-4` or smaller on grids
   - `space-y-4` or smaller on lists
   - Missing margins between sections
   - `p-3` or smaller inside cards
3. **Apply fixes** using `replace_string_in_file` or `multi_replace_string_in_file`
4. **Verify no errors** after each change using `get_errors`

## DO NOT Change
- Color scheme or design tokens
- Component structure or logic
- Typography sizes
- Functionality

## Output
After completing all fixes, provide a summary of:
- Files modified
- Key spacing changes made
- Any remaining issues found
