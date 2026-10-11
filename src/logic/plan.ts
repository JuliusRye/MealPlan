import { db, newId, type PlanEntry } from '../db'
import { addDaysISO, compareISO, diffDaysISO, formatRange, isISODate, type ISODate } from './dates'
import { moveFreezerStock } from './freezer'
import { createMeal } from './meals'

/** The user-editable fields of a plan entry. */
export type PlanInput = Omit<PlanEntry, 'id'>

/** A date range, optionally the entry it belongs to (so it can ignore itself). */
export type DateSpan = Pick<PlanEntry, 'startDate' | 'endDate'> & { id?: string }

/** How often a library meal has been planned. */
export interface MealPlanStats {
  timesPlanned: number
  /** Start of the latest entry that started on or before today. */
  lastPlanned?: ISODate
  /** Start of the earliest entry that starts after today. */
  nextPlanned?: ISODate
}

/** One week row's piece of an entry in the month grid. */
export interface WeekBar {
  entry: PlanEntry
  /** 0 = Monday. */
  column: number
  /** Number of days covered in this week, 1–7. */
  span: number
  /** Stacking row within the week, 0 = top. */
  lane: number
  /** The entry started in an earlier week. */
  continuesBefore: boolean
  /** The entry ends in a later week. */
  continuesAfter: boolean
}

/**
 * Trim text and drop an empty note. Throws on a missing title, bad dates or a
 * bad freezer portion count; a portion count without a freezer item is dropped.
 */
export function cleanPlanInput(input: PlanInput): PlanInput {
  const title = input.title.trim()
  if (!title) throw new Error('A dinner needs a title')
  if (!isISODate(input.startDate)) throw new Error('A dinner needs a valid start date')
  if (!isISODate(input.endDate)) throw new Error('A dinner needs a valid end date')
  if (compareISO(input.endDate, input.startDate) < 0) throw new Error('The end date cannot be before the start date')
  const clean: PlanInput = { title, startDate: input.startDate, endDate: input.endDate }
  if (input.mealId) clean.mealId = input.mealId
  if (input.freezerItemId) {
    const portions = input.portionsFromFreezer
    if (portions === undefined || !Number.isInteger(portions) || portions < 1) {
      throw new Error('portions from the freezer must be a whole number, 1 or more')
    }
    clean.freezerItemId = input.freezerItemId
    clean.portionsFromFreezer = portions
  }
  const note = input.note?.trim()
  if (note) clean.note = note
  return clean
}

/** Number of days an entry covers, counting both ends. */
export function entryDays(entry: DateSpan): number {
  return diffDaysISO(entry.endDate, entry.startDate) + 1
}

/** Takes any freezer portions in the same transaction. Throws NotEnoughPortionsError if the stock is short. */
export async function createPlanEntry(input: PlanInput): Promise<PlanEntry> {
  const entry: PlanEntry = { ...cleanPlanInput(input), id: newId() }
  return db.transaction('rw', db.plan, db.freezer, async () => {
    await moveFreezerStock(undefined, entry)
    await db.plan.add(entry)
    return entry
  })
}

/**
 * Replaces all editable fields, so fields missing from `input` are cleared.
 * Freezer stock moves by the difference in the same transaction.
 */
export async function updatePlanEntry(id: string, input: PlanInput): Promise<PlanEntry> {
  const entry: PlanEntry = { ...cleanPlanInput(input), id }
  return db.transaction('rw', db.plan, db.freezer, async () => {
    const existing = await db.plan.get(id)
    if (!existing) throw new Error(`Plan entry ${id} not found`)
    await moveFreezerStock(existing, entry)
    await db.plan.put(entry)
    return entry
  })
}

/**
 * Creates the entry, or updates entry `id`. With `saveToLibrary`, an entry not
 * linked to a meal first gets a new library meal named after its title.
 * All or nothing: a failed save leaves no new meal behind.
 */
export async function savePlanEntry(
  input: PlanInput,
  { id, saveToLibrary = false }: { id?: string; saveToLibrary?: boolean } = {},
): Promise<PlanEntry> {
  return db.transaction('rw', db.plan, db.meals, db.freezer, async () => {
    let clean = cleanPlanInput(input)
    if (saveToLibrary && !clean.mealId) clean = { ...clean, mealId: (await createMeal({ name: clean.title })).id }
    return id ? updatePlanEntry(id, clean) : createPlanEntry(clean)
  })
}

/** Returns any freezer portions in the same transaction. */
export async function deletePlanEntry(id: string): Promise<void> {
  await db.transaction('rw', db.plan, db.freezer, async () => {
    const existing = await db.plan.get(id)
    if (!existing) return
    await moveFreezerStock(existing, undefined)
    await db.plan.delete(id)
  })
}

function byStart(a: PlanEntry, b: PlanEntry): number {
  return compareISO(a.startDate, b.startDate) || compareISO(b.endDate, a.endDate) || a.title.localeCompare(b.title)
}

/** Entries covering at least one day of `from`–`to` (inclusive), sorted by start date. */
export async function entriesInRange(from: ISODate, to: ISODate): Promise<PlanEntry[]> {
  const entries = await db.plan
    .where('startDate')
    .belowOrEqual(to)
    .filter((e) => compareISO(e.endDate, from) >= 0)
    .toArray()
  return entries.sort(byStart)
}

/** Entries that end today or later, sorted by start date. */
export async function upcomingEntries(today: ISODate): Promise<PlanEntry[]> {
  const entries = await db.plan.where('endDate').aboveOrEqual(today).toArray()
  return entries.sort(byStart)
}

/** Entries linked to library meal `mealId`, in no particular order. */
export async function planEntriesForMeal(mealId: string): Promise<PlanEntry[]> {
  return db.plan.where('mealId').equals(mealId).toArray()
}

/** Stats over one meal's plan entries. Future entries count as planned but not as "last planned". */
export function mealPlanStats(entries: readonly PlanEntry[], today: ISODate): MealPlanStats {
  const stats: MealPlanStats = { timesPlanned: entries.length }
  for (const { startDate } of entries) {
    if (compareISO(startDate, today) <= 0) {
      if (!stats.lastPlanned || compareISO(startDate, stats.lastPlanned) > 0) stats.lastPlanned = startDate
    } else if (!stats.nextPlanned || compareISO(startDate, stats.nextPlanned) < 0) {
      stats.nextPlanned = startDate
    }
  }
  return stats
}

function sharesADay(a: DateSpan, b: DateSpan): boolean {
  return compareISO(a.startDate, b.endDate) <= 0 && compareISO(a.endDate, b.startDate) >= 0
}

/** Other entries sharing at least one day with `span`, sorted by start date. */
export function findOverlaps(span: DateSpan, others: readonly PlanEntry[]): PlanEntry[] {
  return others.filter((e) => e.id !== span.id && sharesADay(span, e)).sort(byStart)
}

/** E.g. "Tue 13 Oct already has Chili". Only dinner is planned, so a shared day is a clash. */
export function overlapWarning(span: DateSpan, other: PlanEntry): string {
  const from = compareISO(span.startDate, other.startDate) > 0 ? span.startDate : other.startDate
  const to = compareISO(span.endDate, other.endDate) < 0 ? span.endDate : other.endDate
  return `${formatRange(from, to)} already ${from === to ? 'has' : 'have'} ${other.title}`
}

/**
 * Bars for one Monday-first week row: each entry touching the week is clipped
 * to it and given the lowest lane free over its columns.
 */
export function layoutWeekBars(weekStart: ISODate, entries: readonly PlanEntry[]): WeekBar[] {
  const weekEnd = addDaysISO(weekStart, 6)
  const laneEnds: number[] = [] // last occupied column per lane
  const bars: WeekBar[] = []
  for (const entry of entries.filter((e) => sharesADay({ startDate: weekStart, endDate: weekEnd }, e)).sort(byStart)) {
    const continuesBefore = compareISO(entry.startDate, weekStart) < 0
    const continuesAfter = compareISO(entry.endDate, weekEnd) > 0
    const column = continuesBefore ? 0 : diffDaysISO(entry.startDate, weekStart)
    const last = continuesAfter ? 6 : diffDaysISO(entry.endDate, weekStart)
    let lane = laneEnds.findIndex((end) => end < column)
    if (lane === -1) lane = laneEnds.length
    laneEnds[lane] = last
    bars.push({ entry, column, span: last - column + 1, lane, continuesBefore, continuesAfter })
  }
  return bars
}

/** Days from today through the next `count - 1` days that no entry covers. */
export function unplannedDays(today: ISODate, entries: readonly PlanEntry[], count = 7): ISODate[] {
  const days: ISODate[] = []
  for (let i = 0; i < count; i++) {
    const day = addDaysISO(today, i)
    if (!entries.some((e) => sharesADay({ startDate: day, endDate: day }, e))) days.push(day)
  }
  return days
}
