import { subMonths } from 'date-fns'
import { db, newId, type FreezerItem, type PlanEntry } from '../db'
import { compareISO, diffDaysISO, fromISODate, isISODate, toISODate, type ISODate } from './dates'

export type ExpiryStatus = 'ok' | 'soon' | 'expired'

/** The user-editable fields of a freezer item. */
export type FreezerInput = Omit<FreezerItem, 'id'>

/** The portions a plan entry holds from the freezer, if any. */
export type FreezerTake = Pick<PlanEntry, 'freezerItemId' | 'portionsFromFreezer'>

/** E.g. "1 portion", "3 portions". */
export function portionsText(n: number): string {
  return `${n} ${n === 1 ? 'portion' : 'portions'}`
}

/** E.g. "Only 2 portions left in the freezer". */
export function portionsLeftMessage(available: number): string {
  return available === 0 ? 'No portions left in the freezer' : `Only ${portionsText(available)} left in the freezer`
}

/** Planning would take more portions than the freezer item has. */
export class NotEnoughPortionsError extends Error {
  /** Portions the entry could take, counting any it already holds. */
  readonly available: number

  constructor(available: number) {
    super(portionsLeftMessage(available))
    this.name = 'NotEnoughPortionsError'
    this.available = available
  }
}

/** 'soon' from one calendar month before the expiry date up to and including it, 'expired' after. */
export function expiryStatus(item: Pick<FreezerItem, 'expiryDate'>, today: ISODate): ExpiryStatus {
  if (compareISO(today, item.expiryDate) > 0) return 'expired'
  const warnFrom = toISODate(subMonths(fromISODate(item.expiryDate), 1))
  return compareISO(today, warnFrom) >= 0 ? 'soon' : 'ok'
}

/** Badge text for soon/expired items; undefined when the item is fine. */
export function expiryLabel(item: Pick<FreezerItem, 'expiryDate'>, today: ISODate): string | undefined {
  const status = expiryStatus(item, today)
  if (status === 'ok') return undefined
  if (status === 'expired') return 'Expired'
  const days = diffDaysISO(item.expiryDate, today)
  if (days === 0) return 'Expires today'
  if (days === 1) return 'Expires tomorrow'
  return `Expires in ${days} days`
}

/** Used-up items (0 portions) are kept for history. */
export function isInStock(item: Pick<FreezerItem, 'portions'>): boolean {
  return item.portions > 0
}

function byExpiry(a: FreezerItem, b: FreezerItem): number {
  return compareISO(a.expiryDate, b.expiryDate) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
}

/** In-stock and used-up (0 portions) items, each sorted by expiry date ascending. */
export function splitFreezer(items: readonly FreezerItem[]): { inStock: FreezerItem[]; usedUp: FreezerItem[] } {
  const sorted = [...items].sort(byExpiry)
  return { inStock: sorted.filter(isInStock), usedUp: sorted.filter((i) => !isInStock(i)) }
}

/** Soon + expired items that still have portions, for the tab badge. */
export function countExpiryWarnings(items: readonly FreezerItem[], today: ISODate): number {
  return items.filter((i) => isInStock(i) && expiryStatus(i, today) !== 'ok').length
}

/** E.g. "1 freezer item has expired, 2 expire soon"; undefined when nothing in stock needs attention. */
export function expiryBanner(items: readonly FreezerItem[], today: ISODate): string | undefined {
  const inStock = items.filter(isInStock)
  const expired = inStock.filter((i) => expiryStatus(i, today) === 'expired').length
  const soon = inStock.filter((i) => expiryStatus(i, today) === 'soon').length
  const parts: string[] = []
  if (expired) parts.push(expired === 1 ? 'has expired' : 'have expired')
  if (soon) parts.push(soon === 1 ? 'expires soon' : 'expire soon')
  if (!parts.length) return undefined
  const first = expired || soon
  const head = `${first} freezer ${first === 1 ? 'item' : 'items'} ${parts[0]}`
  return parts.length === 1 ? head : `${head}, ${soon} ${parts[1]}`
}

/**
 * Stock change per freezer item when a plan entry's take goes from `before`
 * to `after` (undefined = no entry). Negative means taken out of the freezer.
 * Items whose stock doesn't change are left out.
 */
export function stockChanges(before?: FreezerTake, after?: FreezerTake): Map<string, number> {
  const changes = new Map<string, number>()
  const add = (take: FreezerTake | undefined, sign: 1 | -1) => {
    if (!take?.freezerItemId || !take.portionsFromFreezer) return
    const delta = (changes.get(take.freezerItemId) ?? 0) + sign * take.portionsFromFreezer
    if (delta) changes.set(take.freezerItemId, delta)
    else changes.delete(take.freezerItemId)
  }
  add(before, 1)
  add(after, -1)
  return changes
}

/**
 * Applies `stockChanges(before, after)` to the freezer. Call it inside the
 * same rw transaction as the plan entry write, so a failure rolls back both.
 * Throws NotEnoughPortionsError instead of going below 0; portions returned
 * to a deleted item are dropped.
 */
export async function moveFreezerStock(before?: FreezerTake, after?: FreezerTake): Promise<void> {
  for (const [id, delta] of stockChanges(before, after)) {
    const item = await db.freezer.get(id)
    if (!item) {
      if (delta < 0) throw new NotEnoughPortionsError(0)
      continue
    }
    if (item.portions + delta < 0) {
      const held = before?.freezerItemId === id ? (before.portionsFromFreezer ?? 0) : 0
      throw new NotEnoughPortionsError(item.portions + held)
    }
    await db.freezer.update(id, { portions: item.portions + delta })
  }
}

/** Trim text and drop an empty note. Throws on a missing name, bad dates or portions. */
export function cleanFreezerInput(input: FreezerInput): FreezerInput {
  const name = input.name.trim()
  if (!name) throw new Error('A freezer item needs a name')
  if (!Number.isInteger(input.portions) || input.portions < 0) {
    throw new Error('portions must be a whole number, 0 or more')
  }
  if (!isISODate(input.frozenDate)) throw new Error('A freezer item needs a valid frozen date')
  if (!isISODate(input.expiryDate)) throw new Error('A freezer item needs a valid expiry date')
  if (compareISO(input.expiryDate, input.frozenDate) < 0) {
    throw new Error('The expiry date cannot be before the frozen date')
  }
  const clean: FreezerInput = {
    name,
    portions: input.portions,
    frozenDate: input.frozenDate,
    expiryDate: input.expiryDate,
  }
  if (input.mealId) clean.mealId = input.mealId
  const note = input.note?.trim()
  if (note) clean.note = note
  return clean
}

export async function createFreezerItem(input: FreezerInput): Promise<FreezerItem> {
  const item: FreezerItem = { ...cleanFreezerInput(input), id: newId() }
  await db.freezer.add(item)
  return item
}

/** Replaces all editable fields, so fields missing from `input` are cleared. */
export async function updateFreezerItem(id: string, input: FreezerInput): Promise<FreezerItem> {
  const item: FreezerItem = { ...cleanFreezerInput(input), id }
  return db.transaction('rw', db.freezer, async () => {
    if (!(await db.freezer.get(id))) throw new Error(`Freezer item ${id} not found`)
    await db.freezer.put(item)
    return item
  })
}

export async function deleteFreezerItem(id: string): Promise<void> {
  await db.freezer.delete(id)
}

/** Adds `delta` portions (negative to remove), never going below 0. Returns the new count. */
export async function adjustPortions(id: string, delta: number): Promise<number> {
  return db.transaction('rw', db.freezer, async () => {
    const existing = await db.freezer.get(id)
    if (!existing) throw new Error(`Freezer item ${id} not found`)
    const portions = Math.max(0, existing.portions + delta)
    await db.freezer.update(id, { portions })
    return portions
  })
}
