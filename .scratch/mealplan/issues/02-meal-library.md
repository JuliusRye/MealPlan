# 02: Meal library (no images)

**What to build:** On the Meals tab the user can create, edit, delete and search reusable meals with name, prep minutes ("how long it took"), difficulty (easy / medium / hard), notes, recipe link and free-text source (e.g. "Jamie's 30-Minute Meals, p. 112"). The list shows name, ⏱ prep time and a difficulty chip.

**Blocked by:** 01 (App shell)

**Status:** ready-for-agent

- [x] Create, edit and delete a meal; only name is required
- [x] Search filters the list by name
- [x] List rows show ⏱ prep time and an easy/medium/hard chip when set
- [x] Link opens in a new tab; source is shown as plain text
- [x] `createdAt`/`updatedAt` are maintained
- [x] Data survives reload

## Comments

**2026-10-11, implementation (agent):** Done in the working tree, not committed.
- Logic in `src/logic/meals.ts` (create/update/delete, search, `formatMinutes`, `safeHref`); UI in `src/views/MealsView.tsx` + `src/components/{MealForm,MealDetail,MealMeta,DifficultyChip}.tsx`.
- Verified: `npm test` (42 tests), `typecheck`, `lint`, `build`; screenshots at 360×780 in headless Chromium, light and dark.
- Design choices beyond the ticket: tapping a row opens a read-only detail screen (Edit / Delete from there); delete needs a second "Confirm delete" tap (no browser dialog); list sorted by name; prep time shown as "1 h 15 min"; difficulty has a "Not set" option; a negative/invalid prep time is rejected with a message.
- Links: only http(s) become links (bare domains like `example.com/x` get `https://`); anything else, e.g. `mailto:`, shows as plain text.
- `deleteMeal` already removes the meal's `mealImages` in the same transaction (ticket 03 only needs to add a test with real images if wanted; one exists with dummy blobs).
- Global `input`/`textarea`/`a` styles were added in `styles.css` for later forms to reuse.
