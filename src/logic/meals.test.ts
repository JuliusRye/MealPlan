import { afterEach, describe, expect, it } from 'vitest'
import { db, newId, type Meal } from '../db'
import {
  cleanMealInput,
  createMeal,
  deleteMeal,
  formatMinutes,
  safeHref,
  searchMeals,
  updateMeal,
} from './meals'

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('cleanMealInput', () => {
  it('trims text and drops empty optional fields', () => {
    expect(
      cleanMealInput({ name: '  Lasagna ', notes: ' ', link: '', source: ' Book, p. 3 ', prepMinutes: 45 }),
    ).toEqual({ name: 'Lasagna', source: 'Book, p. 3', prepMinutes: 45 })
  })

  it('requires a name', () => {
    expect(() => cleanMealInput({ name: '   ' })).toThrow(/name/i)
  })

  it('drops invalid prep minutes and rounds the rest', () => {
    expect(cleanMealInput({ name: 'A', prepMinutes: Number.NaN })).toEqual({ name: 'A' })
    expect(cleanMealInput({ name: 'A', prepMinutes: -5 })).toEqual({ name: 'A' })
    expect(cleanMealInput({ name: 'A', prepMinutes: 12.6 })).toEqual({ name: 'A', prepMinutes: 13 })
    expect(cleanMealInput({ name: 'A', prepMinutes: 0 })).toEqual({ name: 'A', prepMinutes: 0 })
  })
})

describe('createMeal / updateMeal / deleteMeal', () => {
  it('creates a meal with timestamps', async () => {
    const meal = await createMeal({ name: 'Chili', difficulty: 'easy' }, 1000)
    expect(meal).toMatchObject({ name: 'Chili', difficulty: 'easy', createdAt: 1000, updatedAt: 1000 })
    expect(await db.meals.get(meal.id)).toEqual(meal)
  })

  it('updates fields, keeps createdAt, bumps updatedAt and clears removed fields', async () => {
    const meal = await createMeal({ name: 'Chili', notes: 'spicy', prepMinutes: 30 }, 1000)
    const updated = await updateMeal(meal.id, { name: 'Chili con carne', prepMinutes: 40 }, 2000)
    expect(updated).toEqual({
      id: meal.id,
      name: 'Chili con carne',
      prepMinutes: 40,
      createdAt: 1000,
      updatedAt: 2000,
    })
    expect(await db.meals.get(meal.id)).toEqual(updated)
  })

  it('refuses to update a missing meal', async () => {
    await expect(updateMeal('nope', { name: 'X' })).rejects.toThrow(/not found/i)
  })

  it("deletes a meal together with its images", async () => {
    const meal = await createMeal({ name: 'Soup' })
    const other = await createMeal({ name: 'Stew' })
    const image = (mealId: string) => ({
      id: newId(), mealId, blob: new Blob(['x']), kind: 'result' as const, order: 0, createdAt: 0,
    })
    await db.mealImages.bulkAdd([image(meal.id), image(meal.id), image(other.id)])

    await deleteMeal(meal.id)

    expect(await db.meals.get(meal.id)).toBeUndefined()
    expect(await db.mealImages.where('mealId').equals(meal.id).count()).toBe(0)
    expect(await db.mealImages.where('mealId').equals(other.id).count()).toBe(1)
  })
})

describe('searchMeals', () => {
  const meal = (name: string): Meal => ({ id: name, name, createdAt: 0, updatedAt: 0 })
  const meals = [meal('pasta pesto'), meal('Chili'), meal('Lasagna'), meal('Pasta Carbonara')]

  it('sorts by name, ignoring case', () => {
    expect(searchMeals(meals, '').map((m) => m.name)).toEqual([
      'Chili', 'Lasagna', 'Pasta Carbonara', 'pasta pesto',
    ])
  })

  it('filters by name, ignoring case and surrounding spaces', () => {
    expect(searchMeals(meals, '  PASTA ').map((m) => m.name)).toEqual(['Pasta Carbonara', 'pasta pesto'])
    expect(searchMeals(meals, 'sag').map((m) => m.name)).toEqual(['Lasagna'])
    expect(searchMeals(meals, 'xyz')).toEqual([])
  })
})

describe('formatMinutes', () => {
  it('formats minutes and hours', () => {
    expect(formatMinutes(0)).toBe('0 min')
    expect(formatMinutes(45)).toBe('45 min')
    expect(formatMinutes(60)).toBe('1 h')
    expect(formatMinutes(95)).toBe('1 h 35 min')
  })
})

describe('safeHref', () => {
  it('allows http(s) links', () => {
    expect(safeHref('https://example.com/a?b=1')).toBe('https://example.com/a?b=1')
    expect(safeHref('http://example.com')).toBe('http://example.com/')
  })

  it('adds https:// to bare domains', () => {
    expect(safeHref('example.com/recipe')).toBe('https://example.com/recipe')
  })

  it('rejects other schemes and non-URLs', () => {
    expect(safeHref('javascript:alert(1)')).toBeUndefined()
    expect(safeHref('mailto:a@b.c')).toBeUndefined()
    expect(safeHref('my grandma')).toBeUndefined()
    expect(safeHref(undefined)).toBeUndefined()
  })
})
