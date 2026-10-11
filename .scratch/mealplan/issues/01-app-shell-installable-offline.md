# 01: App shell that installs and works offline

**What to build:** A Vite + React + TypeScript app (git repo initialised) that installs to the phone home screen as a PWA ("MealPlan", theme colour, 192/512 + maskable icons generated from a simple SVG), precaches everything with a service worker, prompts when an update is available, and shows a bottom tab bar (Calendar · Freezer · Meals · Settings) with placeholder screens. On first launch it requests persistent storage. The full Dexie v1 schema for all four tables (meals, mealImages, plan, freezer) is defined now so no later ticket needs a schema bump. Shared local-date helpers (`YYYY-MM-DD` strings, never Date/UTC) exist. Vitest runs with fake-indexeddb. Mobile-first plain CSS with light/dark variables and ≥ 44px tap targets.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `npm run dev`, `npm run build`, `npm run preview` and `npm test` all work
- [ ] Four tabs switch between placeholder screens (simple state router, no router library)
- [ ] Manifest + icons pass Chrome's installability check; the app reloads offline after first load
- [ ] Update prompt appears when a new service worker is waiting
- [ ] `navigator.storage.persist()` is requested on first launch
- [ ] Dexie schema v1 defines `meals`, `mealImages`, `plan`, `freezer` with the indexes from PLAN.md; ids via `crypto.randomUUID()`
- [ ] Date helpers have unit tests (parsing/formatting local ISO dates, no timezone off-by-one)
- [ ] Light/dark theme follows `prefers-color-scheme`
