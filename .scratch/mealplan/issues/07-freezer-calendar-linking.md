# 07: Freezer ↔ calendar linking

**What to build:** The Plan dinner sheet can source a dinner from the freezer: the user picks a freezer item (showing stock and expiry status) and a number of portions, and the stock decreases. Deleting the entry returns the portions; editing the portion count adjusts stock by the difference; taking more than is in stock is prevented. Each stock change happens in the same transaction as the plan entry write so they never get out of sync. Freezer-sourced bars show a ❄ marker. On an existing entry, a "Leftovers → freezer" button opens the add-freezer form prefilled with the entry's name, linked meal (if any) and frozen date = today. The Calendar header shows a small banner like "2 freezer items expire soon".

**Blocked by:** 04 (Freezer stock), 05 (Calendar)

**Status:** ready-for-agent

- [x] Planning from the freezer decreases stock; deleting the entry restores it
- [x] Editing the portion count adjusts stock by the difference; switching away from the freezer source returns all portions
- [x] Cannot take more portions than in stock (validation message shown)
- [x] Take/return/edit arithmetic and transactional behaviour are unit-tested
- [x] ❄ marker on freezer-sourced bars and agenda rows
- [x] "Leftovers → freezer" prefills name, mealId and frozen date
- [x] Calendar banner shows count of soon/expired freezer items and is hidden when zero
