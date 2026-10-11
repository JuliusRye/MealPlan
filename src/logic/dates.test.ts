import { describe, expect, it } from 'vitest'
import { addDaysISO, compareISO, diffDaysISO, fromISODate, isISODate, toISODate, todayISO } from './dates'

describe('test environment', () => {
  it('runs in a non-UTC time zone so off-by-one bugs would show', () => {
    expect(new Date(2026, 0, 1).getTimezoneOffset()).not.toBe(0)
  })
})

describe('toISODate', () => {
  it('formats the local calendar date, not the UTC one', () => {
    // 00:30 local on 1 Jan is still 31 Dec in UTC for zones east of Greenwich.
    expect(toISODate(new Date(2026, 0, 1, 0, 30))).toBe('2026-01-01')
    expect(toISODate(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31')
  })

  it('zero-pads month and day', () => {
    expect(toISODate(new Date(2026, 2, 5))).toBe('2026-03-05')
  })
})

describe('fromISODate', () => {
  it('parses to local midnight of that day', () => {
    const d = fromISODate('2026-03-29')
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 2, 29, 0])
  })

  it('round-trips with toISODate', () => {
    for (const s of ['2024-02-29', '2026-03-29', '2026-10-25', '1999-12-31']) {
      expect(toISODate(fromISODate(s))).toBe(s)
    }
  })

  it('rejects malformed or impossible dates', () => {
    expect(() => fromISODate('2026-2-3')).toThrow()
    expect(() => fromISODate('2026-02-30')).toThrow()
    expect(() => fromISODate('2026-02-03T00:00:00Z')).toThrow()
  })
})

describe('isISODate', () => {
  it('accepts only real YYYY-MM-DD dates', () => {
    expect(isISODate('2024-02-29')).toBe(true)
    expect(isISODate('2025-02-29')).toBe(false)
    expect(isISODate('2026-13-01')).toBe(false)
    expect(isISODate('')).toBe(false)
  })
})

describe('todayISO', () => {
  it('uses the given clock in local time', () => {
    expect(todayISO(new Date(2026, 6, 4, 0, 5))).toBe('2026-07-04')
  })
})

describe('addDaysISO / diffDaysISO', () => {
  it('steps whole calendar days across DST changes', () => {
    expect(addDaysISO('2026-03-28', 1)).toBe('2026-03-29')
    expect(addDaysISO('2026-03-28', 2)).toBe('2026-03-30')
    expect(addDaysISO('2026-10-24', 2)).toBe('2026-10-26')
    expect(addDaysISO('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('counts calendar days across DST changes', () => {
    expect(diffDaysISO('2026-03-30', '2026-03-28')).toBe(2)
    expect(diffDaysISO('2026-10-24', '2026-10-26')).toBe(-2)
  })
})

describe('compareISO', () => {
  it('orders dates chronologically', () => {
    expect(compareISO('2026-01-02', '2026-01-10')).toBeLessThan(0)
    expect(compareISO('2026-01-10', '2026-01-10')).toBe(0)
    expect(compareISO('2027-01-01', '2026-12-31')).toBeGreaterThan(0)
  })
})
