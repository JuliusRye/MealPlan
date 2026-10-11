# 08: Export backup

**What to build:** In Settings the user taps "Export backup" and gets a single YAML file `mealplan-backup-YYYY-MM-DD.yaml` containing `{ version: 1, exportedAt, meals, mealImages, plan, freezer }`, with images embedded as base64 (`data` + `mimeType`). On Android the Web Share API sends it straight to Drive/email; otherwise it downloads. After export the file size is shown. Settings shows the date of the last export (stored in localStorage) with a gentle reminder if it was more than 30 days ago, plus the app version.

**Blocked by:** 01 (App shell). For a meaningful manual demo, do it after 03, 04 and 05 so there is real data to export.

**Status:** ready-for-agent

- [ ] Exported YAML contains every table, with images as base64 + mimeType
- [ ] Share sheet is used when `navigator.share` with files is supported; download otherwise
- [ ] File size is shown after export
- [ ] Last export date is shown; reminder appears after 30 days
- [ ] App version is shown
- [ ] Export serialisation is unit-tested
