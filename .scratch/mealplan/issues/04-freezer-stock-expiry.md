# 04: Freezer stock with expiry warnings

**What to build:** On the Freezer tab the user sees freezer items sorted by expiry date with portion counts. They can add/edit an item (name or pick a library meal, portions, frozen date, **required manually entered expiry date**, note) and use quick +/− portion buttons. Items expiring within one month show an amber "expires in X days" badge; past-expiry items show a red "expired" badge. Items with 0 portions move to a "Used up" section (kept for history). The Freezer tab icon shows a count of soon/expired items.

**Blocked by:** 01 (App shell), 02 (Meal library — for picking a library meal)

**Status:** ready-for-agent

- [ ] Expiry date is required to save
- [ ] List is sorted by expiry date ascending
- [ ] `expiryStatus(item, today)` returns ok / soon / expired; 'soon' when today ≥ expiry minus 1 month
- [ ] Unit tests cover the boundaries: exactly 1 month before, the expiry day itself, the day after
- [ ] +/− buttons adjust portions; portions never go below 0
- [ ] Used-up items appear only in the "Used up" section
- [ ] Tab badge counts soon + expired items with portions > 0
