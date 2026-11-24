---
type: Design Doc
title: UI components
description: Whether to move the board's page from hand-written HTML-string views to React with Radix primitives or shadcn/ui, for accessible menus and popovers, cleaner components, themes and easier user changes; trade-offs and a stepwise path.
status: draft
design_status: proposed
tags: [ui, accessibility, themes, customization]
---

# UI components

**Goal:** decide whether the board's page should move to React with Radix (or shadcn/ui, which is built on Radix), to get accessible menus and popovers, cleaner components and easier themes, and to make it easier for users (and Claude on their behalf) to change their own board. Decision open.

Related: [plugin and git tiers](user-customization.md) (git-tier users change their own copy; `/lifeboard-update` merges upstream releases).

## Today

| Area | State |
|---|---|
| Framework | None. The only runtime dependency is zod |
| Views | TypeScript functions return HTML strings (`viewToday`, `viewPlan`, ...); a render loop (`src/packages/ui/app/render.ts`) draws the current view; clicks go through `data-` attributes and one handler (`src/packages/ui/app/events.ts`) |
| Escaping | By hand (`escapeHtml`) |
| Styles | In `index.html` (about 80 KB), with 77 CSS variables and light and dark themes (`data-theme`) |
| Accessibility | Hand-built: 19 ARIA attributes across the UI; no native `<dialog>` or popover |
| Icons | Own set (`src/packages/ui/shared/icons.ts`) |
| Size | About 11,000 lines of TypeScript in `src/`, about half of it UI. The 3D `garden` and `ecosystem` packages are separate and unaffected by this decision |

## Options

| | A. Stay plain TypeScript | B. React + Radix primitives, own CSS | C. React + shadcn/ui |
|---|---|---|---|
| What it is | Keep string views; use native `<dialog>` and popover | Radix's unstyled, accessible components, styled with the board's own CSS and variables | Copy-in components built on Radix, styled with Tailwind |
| Menus, popovers, tabs, selects | Open and close from the browser; keyboard behavior for menus (arrow keys, type to jump) still built by hand | Full keyboard, focus and screen-reader behavior | Same as B |
| Code shape | Unchanged | Components with their own state and typed props; escaping automatic | Same as B |
| Themes | CSS variables (already) | CSS variables; adopt shadcn's standard token names to reuse its themes | shadcn tokens; theme generators' output can be pasted in |
| User CSS tweaks | Readable class names to target | Readable class names to target | Utility classes leave few names to target; changes mean editing the component |
| Claude editing on a user's behalf | Fine | Easier: React is what Claude writes most | Easiest: React plus a large set of ready-made components |
| Updates (`/lifeboard-update`) | Views spread across shared files | One file per component, so edits stay local and merges are smaller | Same as B; shadcn's own model is copy-in |
| Page weight | None added | React plus Radix, about 50 to 70 KB compressed | Same, plus a Tailwind build step |
| Cost | Building menu keyboard behavior by hand | Rewriting the UI half of the code | Same as B, plus restyling to Tailwind |

## Recommendation

Moving is worth it if user customization is central, which is the direction of [user customization](user-customization.md). B keeps the board's CSS and readable class names; C gives the most ready-made pieces at the cost of Tailwind. Either way, no big-bang rewrite:

| Step | Change | Useful even if the move stops here |
|---|---|---|
| 1 | Rename the 77 CSS variables to shadcn's token names (`background`, `foreground`, `primary`, `muted`, `accent`, ...) | Yes: themes from shadcn generators fit; no runtime cost |
| 2 | Choose B or C | |
| 3 | Mount React inside the existing page for the sheet, menus and popovers first, where accessibility matters most | Yes: those are the accessibility wins |
| 4 | Move one tab at a time (Today, Plan, Lists, Life, Grow) | |
| 5 | Remove the string-view render loop once nothing uses it | |

Each step is checked by `pnpm verify`, including the UI smoke test (`tests/e2e/ui-smoke.ts`), and lands as its own PR. Do it before many boards exist, so `/lifeboard-update` does not have to carry every git-tier repo across the whole rewrite.

## Risks and open questions

| Item | Note |
|---|---|
| Two UI systems at once | During the move, string views and React live side by side. Keep the boundary clear: a view is one or the other. |
| Page weight | 50 to 70 KB more on every load. Measure before and after step 3. |
| Customized boards during the move | A board customized before a tab moves gets a large merge when it does. Moving early limits this. |
| Tailwind (option C only) | Adds a build step and makes CSS-only user tweaks harder. |
