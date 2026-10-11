# 05: Calendar with multi-day dinners and agenda list

**What to build:** The Calendar tab shows a Monday-first month grid with prev/next buttons, swipe left/right and a Today button; navigation is unlimited in both directions (only the visible range is queried). Tapping an empty day opens the Plan dinner sheet with that start date, where the user enters a free-text title, start date, number of days (or end date) and a note. A "cook once, eat several days" entry renders as one continuous bar per week row, split correctly across week and month boundaries. Overlapping entries trigger a warning ("Tue already has Chili") but saving is still allowed. Tapping a bar opens the edit sheet, which can also delete. Days without a dinner in the next 7 days are subtly highlighted as unplanned. A toggle switches to an Agenda list: a scrollable list of upcoming entries for planning far ahead.

**Blocked by:** 01 (App shell)

**Status:** ready-for-agent

- [x] Create, edit and delete a free-text entry spanning one or more days (end ≥ start enforced)
- [x] Range query returns entries where start ≤ to and end ≥ from (unit-tested)
- [x] Week bar layout computes column start/span and lane, splitting entries across weeks and months (unit-tested, incl. entries crossing week and month boundaries)
- [x] Overlap detection warns without blocking save (unit-tested)
- [x] Swipe, prev/next and Today navigation work; months far in past/future render
- [x] Unplanned days in the next 7 days are highlighted
- [x] Agenda toggle shows upcoming entries in date order and tapping one opens the edit sheet
- [x] Usable at ~360×780 viewport
