# 03: Meal photos

**What to build:** On a meal's detail/edit screen the user can add one or more photos (camera or gallery via a multi-select image input), mark each as "recipe page" or "finished dish", reorder and remove them, and tap one for a full-screen view that can be pinch-zoomed to read a book page. Photos are downscaled client-side before storing (max 1600px long edge, ~0.8 quality). The library list shows a thumbnail (first finished-dish image, otherwise the first image). Deleting a meal deletes its images in the same transaction.

**Blocked by:** 02 (Meal library)

**Status:** ready-for-agent

- [ ] Adding a 5–10 MB phone photo stores a resized image of a few hundred KB
- [ ] Each image can be toggled between recipe page and finished dish
- [ ] Images can be reordered and removed
- [ ] Full-screen view supports pinch-zoom
- [ ] Thumbnail picks first finished-dish image, falling back to first image
- [ ] Object URLs are revoked on unmount
- [ ] Deleting a meal removes its images atomically (unit-tested)
