# 06: Plan dinners from the meal library

**What to build:** In the Plan dinner sheet the user can search and pick a meal from the library (the entry stores a title snapshot so it survives meal deletion). A free-text entry offers "save to library". A meal's detail screen has a "Plan this" button that opens the Plan dinner sheet with that meal selected, and shows "last planned" and "times planned" derived from plan entries.

**Blocked by:** 02 (Meal library), 05 (Calendar)

**Status:** ready-for-agent

- [x] Picking a library meal fills the title and links the entry to the meal
- [x] Deleting a library meal leaves past entries showing their title
- [x] "Save to library" on a free-text entry creates a meal and links the entry
- [x] "Plan this" opens the sheet prefilled with the meal
- [x] "Last planned" and "times planned" are correct (unit-tested derivation)

## Comments

**2026-10-11, implementation (agent):** Done in the working tree, not committed.
- Data: Dexie schema v2 adds a `mealId` index on `plan`. `deleteMeal` now also unlinks that meal's plan entries in the same transaction; they keep their title snapshot and show as free text again.
- Logic (`src/logic/plan.ts`): `savePlanEntry(input, { id?, saveToLibrary? })` creates or updates an entry. It can first create a library meal named after the title, all in one transaction. Also `planEntriesForMeal` and `mealPlanStats(entries, today)` → `{ timesPlanned, lastPlanned?, nextPlanned? }`. Last planned is the latest start on or before today; times planned counts every linked entry, future ones included. `findMealByName` lives in `src/logic/meals.ts`.
- Sheet (`PlanEntrySheet`): the title field doubles as the library search, with up to 5 matching meals as tap-to-pick buttons. Picking fills the title, links the meal and shows "Linked to your meal library". Editing the title afterwards unlinks it. A typed title that exactly matches a library meal (ignoring case) is linked on save. Free text that is not in the library shows a "Save to meal library" checkbox, off by default, which takes effect on Save.
- Meal detail: a "Plan this" button opens the sheet prefilled with the meal, starting today, for 2 days. A "Times planned" row ("Not planned yet" when 0), plus "Last planned" and "Next planned" rows.
- Beyond the spec: the "Next planned" row; unlinking entries on meal delete; auto-linking an exact name match.
- Review follow-ups not done: `savePlanEntry` wraps `createPlanEntry`/`updatePlanEntry` (now only used by tests and by it), and `cleanPlanInput` runs twice. The meal↔plan link rules are split between `meals.ts` (unlink on delete) and `plan.ts` (create on save).
