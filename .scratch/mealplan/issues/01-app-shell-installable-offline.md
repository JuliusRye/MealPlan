# 01: App shell that installs and works offline

**What to build:** A Vite + React + TypeScript app (git repo initialised) that installs to the phone home screen as a PWA ("MealPlan", theme colour, 192/512 + maskable icons generated from a simple SVG), precaches everything with a service worker, prompts when an update is available, and shows a bottom tab bar (Calendar · Freezer · Meals · Settings) with placeholder screens. On first launch it requests persistent storage. The full Dexie v1 schema for all four tables (meals, mealImages, plan, freezer) is defined now so no later ticket needs a schema bump. Shared local-date helpers (`YYYY-MM-DD` strings, never Date/UTC) exist. Vitest runs with fake-indexeddb. Mobile-first plain CSS with light/dark variables and ≥ 44px tap targets.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [x] `npm run dev`, `npm run build`, `npm run preview` and `npm test` all work
- [x] Four tabs switch between placeholder screens (simple state router, no router library)
- [x] Manifest + icons pass Chrome's installability check; the app reloads offline after first load
- [x] Update prompt appears when a new service worker is waiting
- [x] `navigator.storage.persist()` is requested on first launch
- [x] Dexie schema v1 defines `meals`, `mealImages`, `plan`, `freezer` with the indexes from PLAN.md; ids via `crypto.randomUUID()`
- [x] Date helpers have unit tests (parsing/formatting local ISO dates, no timezone off-by-one)
- [x] Light/dark theme follows `prefers-color-scheme`

## Comments

**2026-10-11, implementation (agent):** Done in the working tree, not committed.
- Verified: `npm test` (20 tests, TZ pinned to Europe/Copenhagen), `typecheck`, `lint`, `build`, `dev`. In headless Chromium: no installability errors, offline reload + tab switching work, the update prompt appears after a rebuild and Reload activates the new SW.
- Not verified yet: install and `persisted()` on the S23 (headless Chrome returns `persisted() === false` by heuristic).
- Deviations: persistence is requested on every launch until granted (not only the first); icons live in `public/` (generator default), not `public/icons/`; no periodic update check while the app stays open.
- Review follow-ups left for later: tab list is defined in both `TabBar.tsx` and `App.tsx`; `ISODate` is a plain string alias; `PlanEntry.freezerItemId`/`portionsFromFreezer` can be set independently.
