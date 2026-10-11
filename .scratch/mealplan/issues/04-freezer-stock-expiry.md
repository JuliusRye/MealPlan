# 04: Freezer stock with expiry warnings

**What to build:** On the Freezer tab the user sees freezer items sorted by expiry date with portion counts. They can add/edit an item (name or pick a library meal, portions, frozen date, **required manually entered expiry date**, note) and use quick +/− portion buttons. Items expiring within one month show an amber "expires in X days" badge; past-expiry items show a red "expired" badge. Items with 0 portions move to a "Used up" section (kept for history). The Freezer tab icon shows a count of soon/expired items.

**Blocked by:** 01 (App shell), 02 (Meal library — for picking a library meal)

**Status:** ready-for-agent

- [x] Expiry date is required to save
- [x] List is sorted by expiry date ascending
- [x] `expiryStatus(item, today)` returns ok / soon / expired; 'soon' when today ≥ expiry minus 1 month
- [x] Unit tests cover the boundaries: exactly 1 month before, the expiry day itself, the day after
- [x] +/− buttons adjust portions; portions never go below 0
- [x] Used-up items appear only in the "Used up" section
- [x] Tab badge counts soon + expired items with portions > 0

## Comments

**2026-10-11, implementation (agent):** Done in the working tree, not committed.
- Logic: `src/logic/freezer.ts` (`expiryStatus`, `expiryLabel`, `splitFreezer`, `countExpiryWarnings`, `isInStock`, `cleanFreezerInput`, `create/update/deleteFreezerItem`, `adjustPortions`). "Soon" uses calendar months via `subMonths`, so for an expiry on 31 Mar the warning starts on 28 Feb. The expiry day itself counts as soon, and the day after counts as expired.
- UI: `src/views/FreezerView.tsx`, `src/components/FreezerItemForm.tsx`. `TabBar` takes a `badges` prop with screen-reader text. `src/hooks/useToday.ts` rolls the date over at midnight, so the badge and chips don't go stale in a PWA that stays open.
- Form: an optional "Library meal" select (shown only when the library has meals) fills in the name. Frozen date defaults to today. The expiry date is required and can't be before the frozen date. Portions are a whole number, 0 or more.
- Beyond the spec: Delete (with a confirm step) on the edit screen. The labels "Expires today" and "Expires tomorrow". Items with the same expiry date are sorted by name.
- Tests: `freezer.test.ts` covers the boundaries (1 month before, the day before that, the expiry day, the day after, the end-of-month clamp and DST). `FreezerView.test.tsx` covers the form, list, +/−, used up and the tab badge, and `useToday.test.ts` covers the rollover.
- Review follow-ups not done: `DeleteButton` duplicates the delete-confirm in `MealDetail` and could become a shared `ConfirmDelete` component. Form validation mirrors `cleanFreezerInput`, the same pattern as `MealForm`.
