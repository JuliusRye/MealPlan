# MealPlan

A personal dinner planner that installs as an offline web app (PWA). All data stays on the device in IndexedDB; there is no backend. See `PLAN.md` for the full plan and `.scratch/mealplan/issues/` for the tickets.

Current state (tickets 01–02): the app shell with four tabs (Calendar · Freezer · Meals · Settings), offline support, an update prompt and the database schema. The Meals tab has a working meal library (create, edit, delete, search); the other screens are still placeholders.

## First time

```sh
npm install
```

## View it on the PC

```sh
npm run dev
```

Open http://localhost:5173. The page reloads as you edit code. The service worker is **off** in dev mode, so offline and the update prompt can't be tested here.

To see it at phone size, open Chrome DevTools (F12), turn on the device toolbar (Ctrl+Shift+M) and pick a ~360×780 screen (the size of a Galaxy S23).

## Try the installable, offline version

```sh
npm run build
npm run preview
```

Open http://localhost:4173. This is the production build with the service worker:

- **Install:** click the install icon at the right end of Chrome's address bar.
- **Offline:** load the page once, then in DevTools go to *Network* → set throttling to *Offline* and reload. The app still loads.
- **Update prompt:** keep the tab open, change some text (e.g. in `src/views/CalendarView.tsx`), run `npm run build` again and reload. An "A new version is available" banner appears at the bottom; *Reload* switches to the new version.
- **Service worker and storage details:** DevTools → *Application* tab (Manifest, Service workers, IndexedDB → `mealplan`).

## View it on the phone

On the same Wi-Fi as the PC:

```sh
npm run dev -- --host
```

Open the *Network* URL it prints (e.g. `http://192.168.x.x:5173`) in Chrome on the phone. This is for looking at the UI only. Installing to the home screen and offline use need HTTPS; use the deployed version below for that.

## Deployed version (GitHub Pages)

Every push to `master` runs `.github/workflows/deploy.yml`, which lints, tests, builds and publishes `dist/` to:

**https://juliusrye.github.io/MealPlan/**

Follow the run under the repo's *Actions* tab (it can also be started by hand there with *Run workflow*). On the phone, open the URL in Chrome and choose *Add to home screen* / *Install app*. After opening it once online it works offline, including in airplane mode. Data lives in the phone's browser storage, so it is separate from the PC's and survives app updates.

## Other commands

| Command | What it does |
| --- | --- |
| `npm test` | Run the unit tests once (`npm run test:watch` to keep watching) |
| `npm run typecheck` | Type-check without building |
| `npm run lint` | Lint with oxlint |
| `npm run generate-pwa-assets` | Regenerate the app icons in `public/` from `public/favicon.svg` |
