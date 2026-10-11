# MealPlan PWA: implementation plan

## Context
The user wants a personal meal planner to use on a Samsung S23 (Android, Chrome), developed on an Arch Linux PC. We chose a **PWA** over a native Android app because it needs no Android SDK, is tested in the desktop browser and installs to the phone's home screen from Chrome. It is hosted for free as static files (GitHub Pages), so no PC has to stay on. After the first load it runs fully offline. All data stays **on the phone** (IndexedDB). There is no backend and no accounts.

Project folder: `/home/Julius/Documents/Apps/MealPlan` (currently empty, not a git repo). Node/npm are installed. There is no Java or Android SDK, and none is needed.

### Requirements (confirmed with the user)
1. **Calendar** to plan dinners indefinitely far ahead (and look back).
2. **Dinner only**: one meal slot per day.
3. **Multi-day meals = "cook once, eat several days"**: one entry covers a date range (e.g. lasagna Mon–Wed) and shows as a single bar across those days.
4. **Freezer stock**, linked to the calendar:
   - A planned meal can send leftover portions to the freezer.
   - Planning a meal "from the freezer" takes portions out of stock. Deleting or editing that entry puts them back.
   - Each freezer item has an **expiry date the user enters manually**. Show a **warning from 1 month before** that date, and an "expired" state after it.
5. **Meal library**: reusable meals with name, notes, **time it took to make** and **how easy it was** (easy / medium / hard), plus an optional recipe link. Because some recipes come from physical books with no link, each meal can also have **one or more uploaded images** (e.g. a photo of the book page and/or the finished dish) and a free-text source field (e.g. "Jamie's 30-Minute Meals, p. 112").
6. **Backup**: export all data to a **YAML** file and import it again (data lives only on the phone).
- Not wanted for now: shopping list, ingredient tracking, breakfast/lunch slots.

## Tech stack
- **Vite + React + TypeScript** (`npm create vite@latest . -- --template react-ts`)
- **vite-plugin-pwa** for the manifest, service worker (precache everything) and auto-update prompt
- **Dexie** (+ `dexie-react-hooks` `useLiveQuery`) for IndexedDB
- **yaml** (npm package `yaml`) for backup serialization
- **date-fns** for date math. Store dates as local `YYYY-MM-DD` strings, never as `Date`/UTC timestamps, to avoid timezone off-by-one bugs.
- Plain CSS with CSS variables (light/dark via `prefers-color-scheme`), mobile-first, tap targets ≥ 44px. No UI framework needed.
- **Vitest** for unit tests of the logic modules.
- Call `navigator.storage.persist()` on first launch so Chrome doesn't evict the data.

## Data model (`src/db.ts`)
```ts
type ISODate = string; // 'YYYY-MM-DD', local date

interface Meal {            // library
  id: string; name: string; notes?: string; link?: string;
  source?: string;          // e.g. cookbook title + page
  prepMinutes?: number;     // "how long it took"
  difficulty?: 'easy' | 'medium' | 'hard';
  createdAt: number; updatedAt: number;
}

interface PlanEntry {       // a dinner covering one or more days
  id: string;
  startDate: ISODate; endDate: ISODate;   // inclusive; end >= start
  title: string;            // snapshot so entries survive meal deletion
  mealId?: string;          // optional link to library
  freezerItemId?: string;   // set when the meal comes from the freezer
  portionsFromFreezer?: number;
  note?: string;
}

interface FreezerItem {
  id: string; name: string; mealId?: string;
  portions: number;         // current stock; 0 = used up (hide from main list but keep for history)
  frozenDate: ISODate;
  expiryDate: ISODate;      // user enters it manually (required)
  note?: string;
}

interface MealImage {       // stored separately so meal lists stay fast
  id: string; mealId: string;
  blob: Blob;               // resized JPEG/WebP
  kind: 'recipe' | 'result';// recipe page photo vs. finished dish
  order: number; createdAt: number;
}
```
Dexie schema v1: `meals: 'id, name'`, `mealImages: 'id, mealId'`, `plan: 'id, startDate, endDate'`, `freezer: 'id, expiryDate'`. Use `crypto.randomUUID()` for ids. Deleting a meal also deletes its images (in one transaction).

**Images:** add them with `<input type="file" accept="image/*" multiple>`. On Android this offers both the camera and the gallery. Before storing, downscale client-side with canvas/`createImageBitmap` to a max of 1600px on the long edge at about 0.8 quality (typically 200–400 KB) so phone photos (5–10 MB) don't fill up storage. Display them with `URL.createObjectURL` and revoke the URLs on unmount.

## Logic modules (pure, unit-tested)
- `src/logic/plan.ts`
  - `entriesInRange(from, to)`: query `startDate <= to && endDate >= from`
  - `findOverlaps(entry, others)`: since there is only dinner, overlapping entries should trigger a warning in the form ("Tue already has Chili"). Allow saving anyway.
  - `layoutWeekBars(weekStart, entries)`: compute the bar segments (column start/span, row lane) for a month-grid week row, splitting entries that cross week boundaries.
- `src/logic/freezer.ts`
  - `expiryStatus(item, today)` → `'ok' | 'soon' | 'expired'`. 'soon' when `today >= subMonths(expiryDate, 1)`.
  - `takeFromFreezer` / `returnToFreezer` / `addToFreezer`, each run inside a Dexie transaction together with the PlanEntry write, so stock and plan never get out of sync. Editing a freezer-sourced entry's portion count adjusts stock by the difference. Prevent taking more portions than are in stock.
- `src/logic/backup.ts`: `exportAll()` → YAML document `{ version: 1, exportedAt, meals, mealImages, plan, freezer }` downloaded as `mealplan-backup-YYYY-MM-DD.yaml`. Images are embedded as base64 strings (`data` + `mimeType`), so one file holds everything. Expect the file to be several MB with many photos; show its size after export. `importAll(file)` parses with `yaml`, validates the version and shape, asks for confirmation, decodes the images back to Blobs, then replaces all tables in one transaction. On Android, use the Web Share API (`navigator.share({ files })`) when available so the backup can go straight to Drive/email; otherwise download it.

## Screens (bottom tab bar: Calendar · Freezer · Meals · Settings)
1. **Calendar** (`src/views/CalendarView.tsx`)
   - Month grid, Monday first, with prev/next buttons, swipe left/right and a "Today" button. Navigation is unlimited in both directions (render the visible month only; query by range).
   - Multi-day entries render as one continuous coloured bar per week row. Freezer-sourced entries get a ❄ marker.
   - Days without a dinner in the next 7 days are subtly highlighted ("unplanned").
   - Tap an empty day → **Plan dinner sheet** with start = that day. Tap a bar → edit sheet.
   - Also an **Agenda list** toggle: a scrollable list of upcoming entries, which works better on a phone for planning far ahead.
2. **Plan dinner sheet** (`src/components/PlanEntrySheet.tsx`)
   - Source: pick from the library (search), pick from the freezer (shows stock and expiry status, plus a portions field), or free text. Free text offers "save to library".
   - Start date + number of days (or end date). Overlap warning. Note.
   - On an existing entry: **"Leftovers → freezer"** button opens the Add-freezer form prefilled with the name, mealId and frozenDate = today. Delete (returns freezer portions).
3. **Freezer** (`src/views/FreezerView.tsx`)
   - List sorted by expiry date, with badges for "expires in X days" (amber, ≤ 1 month) and "expired" (red). Shows portions.
   - Add/edit item: name (or pick a library meal), portions, frozen date, **expiry date (required, manual)**, note. Quick +/− portion buttons.
   - The Freezer tab icon shows a count badge for soon/expired items. The Calendar header shows a small banner "2 freezer items expire soon".
   - Filter for a "Used up" section (portions = 0).
4. **Meals library** (`src/views/MealsView.tsx`)
   - Search list showing a thumbnail (first 'result' image, otherwise the first image), name, ⏱ prep time and an easy/medium/hard chip.
   - Detail/edit: name, prep minutes, difficulty, notes, link, source, and an **image gallery** (add/remove/reorder, mark each as recipe page or finished dish, tap for a full-screen view that can be pinch-zoomed to read book pages). Show "last planned" and "times planned" (derived from plan entries).
   - "Plan this" button opens the Plan dinner sheet.
5. **Settings** (`src/views/SettingsView.tsx`): Export backup, Import backup, show the date of the last export with a gentle reminder if it was more than 30 days ago (store it in `localStorage`), and the app version.

## Suggested file layout
```
index.html, vite.config.ts (PWA plugin + base path for GitHub Pages), public/icons/*
src/main.tsx, src/App.tsx (tabs + simple state router; no router lib needed)
src/db.ts, src/logic/{plan,freezer,backup,dates,images}.ts (+ *.test.ts)
src/views/*.tsx, src/components/{Sheet,PlanEntrySheet,FreezerItemForm,MealForm,TabBar}.tsx
src/styles.css
.github/workflows/deploy.yml (build + deploy to GitHub Pages)
```

## Build order
1. Scaffold Vite React-TS, add deps, `git init`, PWA plugin with manifest (name "MealPlan", theme colour, 192/512 + maskable icons generated from a simple SVG).
2. `db.ts` + logic modules + Vitest tests.
3. Meals library → Freezer → Calendar + Plan sheet (in that order, since the calendar depends on both).
4. Freezer ↔ plan linking, warnings/badges.
5. Backup export/import, `storage.persist()`.
6. GitHub Pages deploy workflow. **Ask the user before creating or pushing to a GitHub repo** (they need to create it or authorize `gh`).

## Verification
- `npm test`: Vitest covers the date-range query, week bar layout (entries crossing weeks/months), overlap detection, expiry status at the boundaries (exactly 1 month before, the expiry day itself, the day after), freezer take/return/edit arithmetic, and the YAML backup round-trip including an image Blob (use `fake-indexeddb` for Dexie in tests).
- `npm run dev` and use Chrome DevTools mobile emulation (S23 is about 360×780): create a library meal, plan a 3-day entry across a week boundary, send leftovers to the freezer, plan a freezer meal and confirm the stock decreases, delete it and confirm the stock returns, set an expiry date within 1 month and confirm the warning. Add 2 photos to a meal (one recipe page, one result), check the thumbnail and the full-screen zoom, export the YAML backup, clear the site data, import it again, and confirm everything (including the images) comes back.
- `npm run build && npm run preview`: Lighthouse PWA check, go offline in DevTools and reload, and confirm the app still works and the data persists.
- On the phone: `npm run dev -- --host` lets you test the UI over LAN (installing needs HTTPS, so use the deployed GitHub Pages URL). Open it in Chrome on the S23 → ⋮ → "Add to Home screen"/"Install app", turn on airplane mode, and confirm the app opens and the data is still there.
