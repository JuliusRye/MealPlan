# 03: Meal photos

**What to build:** On a meal's detail/edit screen the user can add one or more photos (camera or gallery via a multi-select image input), mark each as "recipe page" or "finished dish", reorder and remove them, and tap one for a full-screen view that can be pinch-zoomed to read a book page. Photos are downscaled client-side before storing (max 1600px long edge, ~0.8 quality). The library list shows a thumbnail (first finished-dish image, otherwise the first image). Deleting a meal deletes its images in the same transaction.

**Blocked by:** 02 (Meal library)

**Status:** ready-for-agent

- [x] Adding a 5–10 MB phone photo stores a resized image of a few hundred KB
- [x] Each image can be toggled between recipe page and finished dish
- [x] Images can be reordered and removed
- [x] Full-screen view supports pinch-zoom
- [x] Thumbnail picks first finished-dish image, falling back to first image
- [x] Object URLs are revoked on unmount
- [x] Deleting a meal removes its images atomically (unit-tested)

## Comments

**2026-10-11, implementation (agent):** Done in the working tree, not committed.
- Logic: `src/logic/images.ts` (`getMealImages`, `addMealImages`, `setImageKind`, `moveImage`, `removeImage`, `pickThumbnails`), `src/logic/resizeImage.ts` (`fitWithin` + canvas downscale to 1600px long edge, JPEG 0.8; also applies EXIF rotation and strips metadata such as GPS), `src/logic/zoom.ts` (pinch/pan math). UI: `src/components/{MealGallery,PhotoViewer,MealThumb}.tsx`, `src/hooks/useImageUrl.ts`.
- The gallery lives on the meal's detail screen and saves each change immediately (photos are not part of the edit form's Save/Cancel). Two multi-select inputs: "Add recipe page" and "Add dish photo"; the kind can be switched afterwards. Reorder with ↑/↓; remove needs a second tap (Keep / Remove). Selected photos are resized one at a time to keep phone memory in check.
- Full-screen viewer: pinch to zoom (1–5×), drag to pan, double-tap toggles 2.5×, mouse wheel zooms, Esc or ✕ closes; focus moves to ✕ on open.
- Tests: `images.test.ts`, `zoom.test.ts`, deleteMeal atomicity in `meals.test.ts` (forces the meal delete to fail and checks the images survive), gallery/thumbnail/URL-revocation flows in `MealsView.test.tsx` with only `resizeImage` mocked. Test setup now uses Node's `Blob`/`File`, because jsdom's Blob doesn't survive fake-indexeddb (useful for the backup round-trip in 08/09 too).
- Verified in headless Chromium: 5.5 MB 12 MP photo → 400 KB at 1600×1200, 12 MB 27 MP → 395 KB (noisy synthetic images, so this is the worst case); 360×780 screenshots of the list, gallery and a simulated two-finger pinch.
- Not done: a new meal still returns to the list after saving, so photos are added by opening it again. The photos are not on the edit form either (they save immediately on the detail screen).
- Known trade-off (raised in review): the list's thumbnail query reads every `mealImages` row and re-runs on any image change. IndexedDB returns Blob handles without loading the bytes, so this should be fine for a home recipe library. If it gets slow, add a `[mealId+kind]`-style index or store a small thumbnail blob.
