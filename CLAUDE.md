# Project rules for agents

## Git
- **Never commit, push, merge, rebase, tag, or open PRs on your own initiative.** The user commits manually.
- Only run such git commands when the user explicitly asks in the current message; approval does not carry over to later tasks.
- Leave changes uncommitted in the working tree and summarize what changed so the user can review and commit.

## Dev server
- The user usually keeps `npm run dev` running while you work. Vite hot-reloads most edits and restarts itself when `vite.config.ts` changes.
- At the end of any task where the user must restart it (Ctrl+C, then `npm run dev`), say so explicitly in the final summary. This applies after installing, removing or upgrading npm packages, or after changing env files or anything Vite doesn't watch. If no restart is needed, say that too.
- For changes only visible in the production build (service worker, manifest, offline), say that `npm run build` is needed and `npm run preview` must be used to see them.

## Agent skills

### Issue tracker

Issues live locally as markdown files under `.scratch/<feature>/issues/`; never use GitHub or any online tracker. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), recorded as a `**Status:**` line in each issue. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root (created lazily). See `docs/agents/domain.md`.
