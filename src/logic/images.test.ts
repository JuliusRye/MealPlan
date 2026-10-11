import { afterEach, describe, expect, it } from 'vitest'
import { db, type MealImage } from '../db'
import { createMeal } from './meals'
import { addMealImages, getMealImages, moveImage, pickThumbnails, removeImage, setImageKind } from './images'

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('addMealImages / getMealImages', () => {
  it('appends images after the existing ones, in the given order', async () => {
    const meal = await createMeal({ name: 'Lasagna' })
    const other = await createMeal({ name: 'Chili' })
    await addMealImages(meal.id, [{ blob: new Blob(['page']), kind: 'recipe' }], 1000)
    await addMealImages(other.id, [{ blob: new Blob(['x']), kind: 'result' }])
    await addMealImages(
      meal.id,
      [
        { blob: new Blob(['dish']), kind: 'result' },
        { blob: new Blob(['page 2']), kind: 'recipe' },
      ],
      2000,
    )

    const images = await getMealImages(meal.id)
    expect(images.map((i) => [i.kind, i.createdAt])).toEqual([
      ['recipe', 1000],
      ['result', 2000],
      ['recipe', 2000],
    ])
    expect(await Promise.all(images.map((i) => i.blob.text()))).toEqual(['page', 'dish', 'page 2'])
    expect(new Set(images.map((i) => i.id)).size).toBe(3)
  })

  it('returns nothing for a meal without images', async () => {
    expect(await getMealImages('nope')).toEqual([])
  })
})

describe('setImageKind / removeImage', () => {
  const kinds = async (mealId: string) => (await getMealImages(mealId)).map((i) => i.kind)

  it('switches an image between recipe page and finished dish', async () => {
    const meal = await createMeal({ name: 'Lasagna' })
    const [page, dish] = await addMealImages(meal.id, [
      { blob: new Blob(['a']), kind: 'recipe' },
      { blob: new Blob(['b']), kind: 'result' },
    ])
    await setImageKind(page.id, 'result')
    expect(await kinds(meal.id)).toEqual(['result', 'result'])
    await setImageKind(dish.id, 'recipe')
    expect(await kinds(meal.id)).toEqual(['result', 'recipe'])
  })

  it('removes only the given image', async () => {
    const meal = await createMeal({ name: 'Lasagna' })
    const [first, second] = await addMealImages(meal.id, [
      { blob: new Blob(['a']), kind: 'recipe' },
      { blob: new Blob(['b']), kind: 'result' },
    ])
    await removeImage(first.id)
    expect((await getMealImages(meal.id)).map((i) => i.id)).toEqual([second.id])
  })
})

describe('moveImage', () => {
  async function setup() {
    const meal = await createMeal({ name: 'Lasagna' })
    const images = await addMealImages(
      meal.id,
      ['a', 'b', 'c'].map((text) => ({ blob: new Blob([text]), kind: 'recipe' as const })),
    )
    const [a, b, c] = images.map((i) => i.id)
    const order = async () => {
      const ids = (await getMealImages(meal.id)).map((i) => i.id)
      return ids.map((id) => ({ [a]: 'a', [b]: 'b', [c]: 'c' })[id]).join('')
    }
    return { a, b, c, order }
  }

  it('moves an image one step earlier or later', async () => {
    const { a, c, order } = await setup()
    await moveImage(c, -1)
    expect(await order()).toBe('acb')
    await moveImage(a, 1)
    expect(await order()).toBe('cab')
  })

  it('does nothing past either end', async () => {
    const { a, c, order } = await setup()
    await moveImage(a, -1)
    await moveImage(c, 1)
    expect(await order()).toBe('abc')
  })

  it('keeps working after an image in the middle was removed', async () => {
    const { b, c, order } = await setup()
    await removeImage(b)
    await moveImage(c, -1)
    expect(await order()).toBe('ca')
  })
})

describe('pickThumbnails', () => {
  const image = (id: string, mealId: string, kind: MealImage['kind'], order: number): MealImage => ({
    id, mealId, kind, order, blob: new Blob([id]), createdAt: 0,
  })

  it('picks the first finished-dish image per meal, otherwise the first image', () => {
    const thumbs = pickThumbnails([
      image('lasagna-page', 'lasagna', 'recipe', 0),
      image('lasagna-dish-2', 'lasagna', 'result', 2),
      image('lasagna-dish-1', 'lasagna', 'result', 1),
      image('chili-page-2', 'chili', 'recipe', 1),
      image('chili-page-1', 'chili', 'recipe', 0),
    ])
    expect(Object.fromEntries([...thumbs].map(([mealId, img]) => [mealId, img.id]))).toEqual({
      lasagna: 'lasagna-dish-1',
      chili: 'chili-page-1',
    })
  })

  it('has no entry for meals without images', () => {
    expect(pickThumbnails([]).size).toBe(0)
  })
})
