import Dexie, { type EntityTable } from 'dexie'
import type { ISODate } from './logic/dates'

export type Difficulty = 'easy' | 'medium' | 'hard'

/** A reusable meal in the library. */
export interface Meal {
  id: string
  name: string
  notes?: string
  link?: string
  /** Free-text source, e.g. cookbook title + page. */
  source?: string
  /** How long it took to make. */
  prepMinutes?: number
  difficulty?: Difficulty
  createdAt: number
  updatedAt: number
}

/** A dinner covering one or more days (inclusive range). */
export interface PlanEntry {
  id: string
  startDate: ISODate
  /** Inclusive; endDate >= startDate. */
  endDate: ISODate
  /** Snapshot so entries survive meal deletion. */
  title: string
  mealId?: string
  /** Set when the meal comes from the freezer. */
  freezerItemId?: string
  portionsFromFreezer?: number
  note?: string
}

export interface FreezerItem {
  id: string
  name: string
  mealId?: string
  /** Current stock; 0 = used up (kept for history). */
  portions: number
  frozenDate: ISODate
  /** Entered manually by the user. */
  expiryDate: ISODate
  note?: string
}

/** Stored separately from meals so meal lists stay fast. */
export interface MealImage {
  id: string
  mealId: string
  /** Resized JPEG/WebP. */
  blob: Blob
  /** Recipe page photo vs. finished dish. */
  kind: 'recipe' | 'result'
  order: number
  createdAt: number
}

export type MealPlanDB = Dexie & {
  meals: EntityTable<Meal, 'id'>
  mealImages: EntityTable<MealImage, 'id'>
  plan: EntityTable<PlanEntry, 'id'>
  freezer: EntityTable<FreezerItem, 'id'>
}

export const db = new Dexie('mealplan') as MealPlanDB

db.version(1).stores({
  meals: 'id, name',
  mealImages: 'id, mealId',
  plan: 'id, startDate, endDate',
  freezer: 'id, expiryDate',
})

export function newId(): string {
  return crypto.randomUUID()
}
