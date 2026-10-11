# Project rules for agents

## Git
- **Never commit, push, merge, rebase, tag, or open PRs on your own initiative.** The user commits manually.
- Only run such git commands when the user explicitly asks in the current message; approval does not carry over to later tasks.
- Leave changes uncommitted in the working tree and summarize what changed so the user can review and commit.

## Agent skills

### Issue tracker

Issues live locally as markdown files under `.scratch/<feature>/issues/`; never use GitHub or any online tracker. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), recorded as a `**Status:**` line in each issue. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root (created lazily). See `docs/agents/domain.md`.
