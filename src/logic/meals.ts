import { db, newId, type Difficulty, type Meal } from '../db'

export const DIFFICULTY_LABELS: Record<Difficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }

/** The user-editable fields of a meal. */
export type MealInput = Omit<Meal, 'id' | 'createdAt' | 'updatedAt'>

/** Trim text, drop empty optional fields and invalid prep minutes. Throws if the name is empty. */
export function cleanMealInput(input: MealInput): MealInput {
  const name = input.name.trim()
  if (!name) throw new Error('A meal needs a name')
  const clean: MealInput = { name }
  for (const key of ['notes', 'link', 'source'] as const) {
    const value = input[key]?.trim()
    if (value) clean[key] = value
  }
  const minutes = input.prepMinutes
  if (minutes !== undefined && Number.isFinite(minutes) && minutes >= 0) {
    clean.prepMinutes = Math.round(minutes)
  }
  if (input.difficulty) clean.difficulty = input.difficulty
  return clean
}

export async function createMeal(input: MealInput, now = Date.now()): Promise<Meal> {
  const meal: Meal = { ...cleanMealInput(input), id: newId(), createdAt: now, updatedAt: now }
  await db.meals.add(meal)
  return meal
}

/** Replaces all editable fields, so fields missing from `input` are cleared. */
export async function updateMeal(id: string, input: MealInput, now = Date.now()): Promise<Meal> {
  return db.transaction('rw', db.meals, async () => {
    const existing = await db.meals.get(id)
    if (!existing) throw new Error(`Meal ${id} not found`)
    const meal: Meal = { ...cleanMealInput(input), id, createdAt: existing.createdAt, updatedAt: now }
    await db.meals.put(meal)
    return meal
  })
}

/** Deletes the meal and its images in one transaction. */
export async function deleteMeal(id: string): Promise<void> {
  await db.transaction('rw', db.meals, db.mealImages, async () => {
    await db.mealImages.where('mealId').equals(id).delete()
    await db.meals.delete(id)
  })
}

/** Meals whose name contains `query` (case-insensitive), sorted by name. */
export function searchMeals(meals: readonly Meal[], query: string): Meal[] {
  const q = query.trim().toLocaleLowerCase()
  return meals
    .filter((m) => m.name.toLocaleLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}

export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

/**
 * A safe href for a user-entered recipe link: http(s) URLs as-is, bare
 * domains ("example.com/x") get https://, anything else is not linkable.
 */
export function safeHref(link: string | undefined): string | undefined {
  const text = link?.trim()
  if (!text) return undefined
  const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(text)
  if (!hasScheme && !/^[^\s/]+\.[^\s/]+/.test(text)) return undefined
  try {
    const url = new URL(hasScheme ? text : `https://${text}`)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined
  } catch {
    return undefined
  }
}
