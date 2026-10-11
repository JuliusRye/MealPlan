import { addDays, addMonths, differenceInCalendarDays, format, isValid, parse, startOfMonth, startOfWeek } from 'date-fns'

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

export function startOfMonthISO(value: ISODate): ISODate {
  return toISODate(startOfMonth(fromISODate(value)))
}

export function addMonthsISO(value: ISODate, months: number): ISODate {
  return toISODate(addMonths(fromISODate(value), months))
}

/** The Monday on or before `value`. */
export function startOfWeekISO(value: ISODate): ISODate {
  return toISODate(startOfWeek(fromISODate(value), { weekStartsOn: 1 }))
}

/** Monday starts of the week rows of a month grid covering the month containing `value`. */
export function monthWeeks(value: ISODate): ISODate[] {
  const first = startOfMonthISO(value)
  const last = addDaysISO(addMonthsISO(first, 1), -1)
  const weeks: ISODate[] = []
  for (let week = startOfWeekISO(first); compareISO(week, last) <= 0; week = addDaysISO(week, 7)) {
    weeks.push(week)
  }
  return weeks
}

/** E.g. "Tue 13 Oct", "Tue 13 – Thu 15 Oct" or "Fri 30 Oct – Mon 2 Nov". */
export function formatRange(start: ISODate, end: ISODate, { year = false } = {}): string {
  const from = fromISODate(start)
  const to = fromISODate(end)
  const full = year ? 'EEE d MMM yyyy' : 'EEE d MMM'
  if (start === end) return format(from, full)
  const sameYear = from.getFullYear() === to.getFullYear()
  const sameMonth = sameYear && from.getMonth() === to.getMonth()
  const head = sameMonth ? 'EEE d' : sameYear ? 'EEE d MMM' : full
  return `${format(from, head)} – ${format(to, full)}`
}

/** E.g. "October 2026". */
export function formatMonth(value: ISODate): string {
  return format(fromISODate(value), 'MMMM yyyy')
}

/** E.g. "Sunday 11 October 2026". */
export function formatDayLong(value: ISODate): string {
  return format(fromISODate(value), 'EEEE d MMMM yyyy')
}

export function isSameYearISO(a: ISODate, b: ISODate): boolean {
  return a.slice(0, 4) === b.slice(0, 4)
}
