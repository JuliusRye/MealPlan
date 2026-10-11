import { db, newId, type MealImage } from '../db'

export type ImageKind = MealImage['kind']

export const IMAGE_KIND_LABELS: Record<ImageKind, string> = { recipe: 'Recipe page', result: 'Finished dish' }

const byOrder = (a: MealImage, b: MealImage) => a.order - b.order

/** A meal's images in display order. */
export async function getMealImages(mealId: string): Promise<MealImage[]> {
  return (await db.mealImages.where('mealId').equals(mealId).toArray()).sort(byOrder)
}

/** Appends already-resized images after the meal's existing ones. */
export async function addMealImages(
  mealId: string,
  images: readonly { blob: Blob; kind: ImageKind }[],
  now = Date.now(),
): Promise<MealImage[]> {
  return db.transaction('rw', db.mealImages, async () => {
    const existing = await getMealImages(mealId)
    const start = existing.length ? existing[existing.length - 1].order + 1 : 0
    const added = images.map(({ blob, kind }, i): MealImage => ({
      id: newId(), mealId, blob, kind, order: start + i, createdAt: now,
    }))
    await db.mealImages.bulkAdd(added)
    return added
  })
}

export async function setImageKind(id: string, kind: ImageKind): Promise<void> {
  await db.mealImages.update(id, { kind })
}

export async function removeImage(id: string): Promise<void> {
  await db.mealImages.delete(id)
}

/** Swaps the image with its neighbour: `-1` moves it earlier, `1` later. No-op at either end. */
export async function moveImage(id: string, step: -1 | 1): Promise<void> {
  await db.transaction('rw', db.mealImages, async () => {
    const image = await db.mealImages.get(id)
    if (!image) return
    const images = await getMealImages(image.mealId)
    const from = images.findIndex((i) => i.id === id)
    const neighbour = images[from + step]
    if (!neighbour) return
    await db.mealImages.bulkUpdate([
      { key: image.id, changes: { order: neighbour.order } },
      { key: neighbour.id, changes: { order: image.order } },
    ])
  })
}

/** Thumbnail per meal id: its first finished-dish image, otherwise its first image. */
export function pickThumbnails(images: readonly MealImage[]): Map<string, MealImage> {
  const thumbs = new Map<string, MealImage>()
  for (const image of [...images].sort(byOrder)) {
    const current = thumbs.get(image.mealId)
    if (!current || (current.kind !== 'result' && image.kind === 'result')) thumbs.set(image.mealId, image)
  }
  return thumbs
}
