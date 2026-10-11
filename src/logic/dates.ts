import { addDays, differenceInCalendarDays, format, isValid, parse } from 'date-fns'

/** A local calendar date as 'YYYY-MM-DD'. Never convert through UTC. */
export type ISODate = string

const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const ISO_FORMAT = 'yyyy-MM-dd'

export function isISODate(value: string): value is ISODate {
  if (!ISO_PATTERN.test(value)) return false
  const d = parse(value, ISO_FORMAT, new Date(0))
  return isValid(d) && format(d, ISO_FORMAT) === value
}

/** Local midnight of the given date. Throws on malformed or impossible dates. */
export function fromISODate(value: ISODate): Date {
  if (!isISODate(value)) throw new Error(`Invalid ISO date: ${value}`)
  return parse(value, ISO_FORMAT, new Date(0))
}

/** The local calendar date of `date`. */
export function toISODate(date: Date): ISODate {
  return format(date, ISO_FORMAT)
}

export function todayISO(now: Date = new Date()): ISODate {
  return toISODate(now)
}

export function addDaysISO(value: ISODate, days: number): ISODate {
  return toISODate(addDays(fromISODate(value), days))
}

/** Whole calendar days from `right` to `left` (positive when `left` is later). */
export function diffDaysISO(left: ISODate, right: ISODate): number {
  return differenceInCalendarDays(fromISODate(left), fromISODate(right))
}

/** 'YYYY-MM-DD' strings sort lexicographically in date order. */
export function compareISO(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0
}
