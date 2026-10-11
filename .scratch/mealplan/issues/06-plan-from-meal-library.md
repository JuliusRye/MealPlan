# 06: Plan dinners from the meal library

**What to build:** In the Plan dinner sheet the user can search and pick a meal from the library (the entry stores a title snapshot so it survives meal deletion). A free-text entry offers "save to library". A meal's detail screen has a "Plan this" button that opens the Plan dinner sheet with that meal selected, and shows "last planned" and "times planned" derived from plan entries.

**Blocked by:** 02 (Meal library), 05 (Calendar)

**Status:** ready-for-agent

- [ ] Picking a library meal fills the title and links the entry to the meal
- [ ] Deleting a library meal leaves past entries showing their title
- [ ] "Save to library" on a free-text entry creates a meal and links the entry
- [ ] "Plan this" opens the sheet prefilled with the meal
- [ ] "Last planned" and "times planned" are correct (unit-tested derivation)
