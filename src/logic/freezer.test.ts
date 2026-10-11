import { afterEach, describe, expect, it } from 'vitest'
import { db, type FreezerItem } from '../db'
import {
  adjustPortions,
  cleanFreezerInput,
  countExpiryWarnings,
  createFreezerItem,
  deleteFreezerItem,
  expiryLabel,
  expiryStatus,
  splitFreezer,
  updateFreezerItem,
  type FreezerInput,
} from './freezer'

afterEach(async () => {
  await db.freezer.clear()
})

const item = (expiryDate: string, extra: Partial<FreezerItem> = {}): FreezerItem => ({
  id: expiryDate,
  name: 'Chili',
  portions: 2,
  frozenDate: '2026-01-01',
  expiryDate,
  ...extra,
})

const input = (extra: Partial<FreezerInput> = {}): FreezerInput => ({
  name: 'Chili',
  portions: 4,
  frozenDate: '2026-10-01',
  expiryDate: '2027-01-01',
  ...extra,
})

describe('expiryStatus', () => {
  it('is ok until exactly one month before the expiry date', () => {
    expect(expiryStatus(item('2026-12-15'), '2026-11-14')).toBe('ok')
  })

  it('is soon from exactly one month before the expiry date', () => {
    expect(expiryStatus(item('2026-12-15'), '2026-11-15')).toBe('soon')
  })

  it('is still soon on the expiry day itself', () => {
    expect(expiryStatus(item('2026-12-15'), '2026-12-15')).toBe('soon')
  })

  it('is expired the day after', () => {
    expect(expiryStatus(item('2026-12-15'), '2026-12-16')).toBe('expired')
  })

  it('clamps one month before to the end of a shorter month', () => {
    // One month before 31 March is 28 February (2027 is not a leap year).
    expect(expiryStatus(item('2027-03-31'), '2027-02-27')).toBe('ok')
    expect(expiryStatus(item('2027-03-31'), '2027-02-28')).toBe('soon')
  })

  it('counts calendar days across a DST change', () => {
    // DST ends 25 Oct 2026 in the test zone.
    expect(expiryStatus(item('2026-11-24'), '2026-10-23')).toBe('ok')
    expect(expiryStatus(item('2026-11-24'), '2026-10-24')).toBe('soon')
  })
})

describe('splitFreezer', () => {
  it('sorts in-stock items by expiry date and puts used-up items in their own list', () => {
    const items = [
      item('2027-03-01'),
      item('2026-11-01', { portions: 0 }),
      item('2026-12-01'),
      item('2026-10-01'),
      item('2026-09-01', { portions: 0 }),
    ]
    const { inStock, usedUp } = splitFreezer(items)
    expect(inStock.map((i) => i.expiryDate)).toEqual(['2026-10-01', '2026-12-01', '2027-03-01'])
    expect(usedUp.map((i) => i.expiryDate)).toEqual(['2026-09-01', '2026-11-01'])
  })

  it('breaks expiry ties by name', () => {
    const { inStock } = splitFreezer([item('2026-12-01', { id: 'b', name: 'Soup' }), item('2026-12-01', { id: 'a', name: 'chili' })])
    expect(inStock.map((i) => i.name)).toEqual(['chili', 'Soup'])
  })
})

describe('countExpiryWarnings', () => {
  it('counts soon and expired items that still have portions', () => {
    const today = '2026-10-11'
    const items = [
      item('2026-10-01'), // expired
      item('2026-10-20'), // soon
      item('2026-11-11'), // soon (exactly a month)
      item('2026-11-12'), // ok
      item('2026-10-05', { portions: 0 }), // expired but used up
      item('2026-10-15', { portions: 0 }), // soon but used up
    ]
    expect(countExpiryWarnings(items, today)).toBe(3)
  })
})

describe('cleanFreezerInput', () => {
  it('trims text and drops an empty note', () => {
    expect(cleanFreezerInput(input({ name: '  Chili ', note: '  ' }))).toEqual(input())
    expect(cleanFreezerInput(input({ note: ' Spicy ' })).note).toBe('Spicy')
  })

  it('keeps the library meal id', () => {
    expect(cleanFreezerInput(input({ mealId: 'm1' })).mealId).toBe('m1')
  })

  it('requires a name', () => {
    expect(() => cleanFreezerInput(input({ name: ' ' }))).toThrow(/name/)
  })

  it('requires a valid expiry date', () => {
    expect(() => cleanFreezerInput(input({ expiryDate: '' }))).toThrow(/expiry/)
    expect(() => cleanFreezerInput(input({ expiryDate: '2026-02-30' }))).toThrow(/expiry/)
  })

  it('requires a valid frozen date', () => {
    expect(() => cleanFreezerInput(input({ frozenDate: '' }))).toThrow(/frozen/)
  })

  it('rejects an expiry date before the frozen date', () => {
    expect(() => cleanFreezerInput(input({ frozenDate: '2026-10-02', expiryDate: '2026-10-01' }))).toThrow(/expiry/)
    expect(cleanFreezerInput(input({ frozenDate: '2026-10-01', expiryDate: '2026-10-01' })).expiryDate).toBe('2026-10-01')
  })

  it('requires a whole, non-negative portion count', () => {
    expect(() => cleanFreezerInput(input({ portions: -1 }))).toThrow(/portions/)
    expect(() => cleanFreezerInput(input({ portions: 1.5 }))).toThrow(/portions/)
    expect(() => cleanFreezerInput(input({ portions: Number.NaN }))).toThrow(/portions/)
    expect(cleanFreezerInput(input({ portions: 0 })).portions).toBe(0)
  })
})

describe('freezer storage', () => {
  it('creates, updates and deletes an item', async () => {
    const created = await createFreezerItem(input({ note: 'Spicy', mealId: 'm1' }))
    expect(await db.freezer.get(created.id)).toEqual(created)

    const updated = await updateFreezerItem(created.id, input({ name: 'Bolognese', portions: 1 }))
    expect(updated).toEqual({ ...input({ name: 'Bolognese', portions: 1 }), id: created.id })
    expect(await db.freezer.get(created.id)).toEqual(updated)

    await deleteFreezerItem(created.id)
    expect(await db.freezer.count()).toBe(0)
  })

  it('does not store invalid input', async () => {
    await expect(createFreezerItem(input({ expiryDate: '' }))).rejects.toThrow()
    expect(await db.freezer.count()).toBe(0)
  })

  it('fails to update a missing item', async () => {
    await expect(updateFreezerItem('nope', input())).rejects.toThrow(/not found/)
    expect(await db.freezer.count()).toBe(0)
  })
})

describe('adjustPortions', () => {
  it('adds and removes portions', async () => {
    const { id } = await createFreezerItem(input({ portions: 2 }))
    expect(await adjustPortions(id, 1)).toBe(3)
    expect(await adjustPortions(id, -2)).toBe(1)
    expect((await db.freezer.get(id))?.portions).toBe(1)
  })

  it('never goes below 0', async () => {
    const { id } = await createFreezerItem(input({ portions: 1 }))
    expect(await adjustPortions(id, -1)).toBe(0)
    expect(await adjustPortions(id, -1)).toBe(0)
    expect((await db.freezer.get(id))?.portions).toBe(0)
  })

  it('fails for a missing item', async () => {
    await expect(adjustPortions('nope', 1)).rejects.toThrow(/not found/)
  })
})

describe('expiryLabel', () => {
  it('describes the time left for soon and expired items', () => {
    expect(expiryLabel(item('2026-11-12'), '2026-10-11')).toBeUndefined()
    expect(expiryLabel(item('2026-11-11'), '2026-10-11')).toBe('Expires in 31 days')
    expect(expiryLabel(item('2026-10-12'), '2026-10-11')).toBe('Expires tomorrow')
    expect(expiryLabel(item('2026-10-11'), '2026-10-11')).toBe('Expires today')
    expect(expiryLabel(item('2026-10-10'), '2026-10-11')).toBe('Expired')
  })
})
