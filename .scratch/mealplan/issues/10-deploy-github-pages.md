# 10: Deploy to GitHub Pages

**What to build:** The app is built and deployed as static files to GitHub Pages by a workflow on push, with the correct base path, so it can be installed on the phone over HTTPS and used offline.

**Blocked by:** 01 (App shell)

**Status:** ready-for-agent

**Important:** Ask the user before creating or pushing to any GitHub repo; they need to create it or authorise `gh`.

- [x] Vite base path matches the Pages URL; assets and service worker load correctly there
- [x] Workflow builds and deploys on push to the default branch
- [ ] Deployed app passes the installability check and works offline
- [ ] Manual check on the phone: install via Chrome, enable airplane mode, app opens with data intact
