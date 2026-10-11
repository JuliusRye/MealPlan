import { afterEach, describe, expect, it } from 'vitest'
import { db, type PlanEntry } from '../db'
import { createFreezerItem, NotEnoughPortionsError } from './freezer'
import {
  cleanPlanInput,
  createPlanEntry,
  deletePlanEntry,
  entriesInRange,
  entryDays,
  findOverlaps,
  layoutWeekBars,
  mealPlanStats,
  overlapWarning,
  planEntriesForMeal,
  savePlanEntry,
  unplannedDays,
  upcomingEntries,
  updatePlanEntry,
  type PlanInput,
} from './plan'

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

const entry = (id: string, startDate: string, endDate = startDate, extra: Partial<PlanEntry> = {}): PlanEntry => ({
  id,
  title: id,
  startDate,
  endDate,
  ...extra,
})

const input = (extra: Partial<PlanInput> = {}): PlanInput => ({
  title: 'Chili',
  startDate: '2026-10-12',
  endDate: '2026-10-14',
  ...extra,
})

describe('cleanPlanInput', () => {
  it('trims text and drops an empty note', () => {
    expect(cleanPlanInput(input({ title: '  Chili ', note: '  ' }))).toEqual(input())
    expect(cleanPlanInput(input({ note: ' Double batch ' })).note).toBe('Double batch')
  })

  it('keeps links to the library and freezer', () => {
    const linked = input({ mealId: 'm1', freezerItemId: 'f1', portionsFromFreezer: 2 })
    expect(cleanPlanInput(linked)).toEqual(linked)
  })

  it('requires a whole, positive portion count for a freezer entry', () => {
    expect(() => cleanPlanInput(input({ freezerItemId: 'f1' }))).toThrow(/portions/)
    expect(() => cleanPlanInput(input({ freezerItemId: 'f1', portionsFromFreezer: 0 }))).toThrow(/portions/)
    expect(() => cleanPlanInput(input({ freezerItemId: 'f1', portionsFromFreezer: 1.5 }))).toThrow(/portions/)
  })

  it('drops a portion count without a freezer item', () => {
    expect(cleanPlanInput(input({ portionsFromFreezer: 2 }))).toEqual(input())
  })

  it('requires a title', () => {
    expect(() => cleanPlanInput(input({ title: ' ' }))).toThrow(/title/)
  })

  it('requires valid dates', () => {
    expect(() => cleanPlanInput(input({ startDate: '' }))).toThrow(/start/)
    expect(() => cleanPlanInput(input({ endDate: '2026-02-30' }))).toThrow(/end/)
  })

  it('rejects an end date before the start date but allows a single day', () => {
    expect(() => cleanPlanInput(input({ startDate: '2026-10-12', endDate: '2026-10-11' }))).toThrow(/end/)
    expect(cleanPlanInput(input({ startDate: '2026-10-12', endDate: '2026-10-12' })).endDate).toBe('2026-10-12')
  })
})

describe('entryDays', () => {
  it('counts the days an entry covers, inclusive', () => {
    expect(entryDays(entry('a', '2026-10-12'))).toBe(1)
    expect(entryDays(entry('a', '2026-10-30', '2026-11-02'))).toBe(4)
    // Across the DST change on 25 Oct 2026.
    expect(entryDays(entry('a', '2026-10-24', '2026-10-26'))).toBe(3)
  })
})

describe('plan storage', () => {
  it('creates, updates and deletes an entry', async () => {
    const created = await createPlanEntry(input({ note: 'Spicy' }))
    expect(await db.plan.get(created.id)).toEqual(created)

    const updated = await updatePlanEntry(created.id, input({ title: 'Lasagna', endDate: '2026-10-12' }))
    expect(updated).toEqual({ ...input({ title: 'Lasagna', endDate: '2026-10-12' }), id: created.id })
    expect(await db.plan.get(created.id)).toEqual(updated)

    await deletePlanEntry(created.id)
    expect(await db.plan.count()).toBe(0)
  })

  it('does not store invalid input', async () => {
    await expect(createPlanEntry(input({ endDate: '2026-10-01' }))).rejects.toThrow()
    expect(await db.plan.count()).toBe(0)
  })

  it('fails to update a missing entry', async () => {
    await expect(updatePlanEntry('nope', input())).rejects.toThrow(/not found/)
    expect(await db.plan.count()).toBe(0)
  })
})

describe('plan storage with freezer stock', () => {
  const freezerItem = (portions: number, name = 'Chili') =>
    createFreezerItem({ name, portions, frozenDate: '2026-10-01', expiryDate: '2027-01-01' })
  const stock = async (id: string) => (await db.freezer.get(id))?.portions

  it('takes portions when planning from the freezer and returns them on delete', async () => {
    const { id: f1 } = await freezerItem(3)
    const created = await createPlanEntry(input({ freezerItemId: f1, portionsFromFreezer: 2 }))
    expect(await stock(f1)).toBe(1)
    await deletePlanEntry(created.id)
    expect(await stock(f1)).toBe(3)
    expect(await db.plan.count()).toBe(0)
  })

  it('adjusts stock by the difference when the portion count is edited', async () => {
    const { id: f1 } = await freezerItem(3)
    const { id } = await createPlanEntry(input({ freezerItemId: f1, portionsFromFreezer: 1 }))
    await updatePlanEntry(id, input({ freezerItemId: f1, portionsFromFreezer: 3 }))
    expect(await stock(f1)).toBe(0)
    await updatePlanEntry(id, input({ freezerItemId: f1, portionsFromFreezer: 2 }))
    expect(await stock(f1)).toBe(1)
  })

  it('returns all portions when switching away from the freezer or to another item', async () => {
    const { id: f1 } = await freezerItem(3)
    const { id: f2 } = await freezerItem(2, 'Soup')
    const { id } = await createPlanEntry(input({ freezerItemId: f1, portionsFromFreezer: 2 }))
    await updatePlanEntry(id, input({ freezerItemId: f2, portionsFromFreezer: 1 }))
    expect([await stock(f1), await stock(f2)]).toEqual([3, 1])
    await updatePlanEntry(id, input())
    expect([await stock(f1), await stock(f2)]).toEqual([3, 2])
    expect(await db.plan.get(id)).toEqual({ ...input(), id })
  })

  it('refuses to take more than is in stock, writing neither stock nor entry', async () => {
    const { id: f1 } = await freezerItem(2)
    const error = await createPlanEntry(input({ freezerItemId: f1, portionsFromFreezer: 3 })).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(NotEnoughPortionsError)
    expect((error as NotEnoughPortionsError).available).toBe(2)
    expect(await stock(f1)).toBe(2)
    expect(await db.plan.count()).toBe(0)
  })

  it('counts the portions an entry already holds as available when editing it', async () => {
    const { id: f1 } = await freezerItem(3)
    const { id } = await createPlanEntry(input({ freezerItemId: f1, portionsFromFreezer: 2 }))
    const error = await updatePlanEntry(id, input({ freezerItemId: f1, portionsFromFreezer: 4 })).catch(
      (e: unknown) => e,
    )
    expect((error as NotEnoughPortionsError).available).toBe(3)
    expect(await stock(f1)).toBe(1)
    expect((await db.plan.get(id))?.portionsFromFreezer).toBe(2)
    await updatePlanEntry(id, input({ freezerItemId: f1, portionsFromFreezer: 3, title: 'All of it' }))
    expect(await stock(f1)).toBe(0)
  })

  it('cannot take from a freezer item that no longer exists', async () => {
    await expect(createPlanEntry(input({ freezerItemId: 'gone', portionsFromFreezer: 1 }))).rejects.toThrow(
      NotEnoughPortionsError,
    )
    expect(await db.plan.count()).toBe(0)
  })

  it('still edits and deletes an entry whose freezer item was deleted', async () => {
    const { id: f1 } = await freezerItem(3)
    const { id } = await createPlanEntry(input({ freezerItemId: f1, portionsFromFreezer: 2 }))
    await db.freezer.delete(f1)
    await updatePlanEntry(id, input({ freezerItemId: f1, portionsFromFreezer: 2, note: 'Kept' }))
    await deletePlanEntry(id)
    expect(await db.plan.count()).toBe(0)
    expect(await db.freezer.count()).toBe(0)
  })

  it('rolls back the new library meal when savePlanEntry runs out of stock', async () => {
    const { id: f1 } = await freezerItem(1)
    await expect(
      savePlanEntry(input({ freezerItemId: f1, portionsFromFreezer: 2 }), { saveToLibrary: true }),
    ).rejects.toThrow(NotEnoughPortionsError)
    expect(await db.meals.count()).toBe(0)
    expect(await stock(f1)).toBe(1)
  })
})

describe('entriesInRange', () => {
  it('returns entries where start <= to and end >= from, sorted by start', async () => {
    await db.plan.bulkAdd([
      entry('before', '2026-10-01', '2026-10-04'),
      entry('touches-start', '2026-10-03', '2026-10-05'),
      entry('inside', '2026-10-07'),
      entry('covers', '2026-09-20', '2026-11-20'),
      entry('touches-end', '2026-10-11', '2026-10-15'),
      entry('after', '2026-10-12', '2026-10-13'),
    ])
    const found = await entriesInRange('2026-10-05', '2026-10-11')
    expect(found.map((e) => e.id)).toEqual(['covers', 'touches-start', 'inside', 'touches-end'])
  })

  it('finds entries far in the past and future', async () => {
    await db.plan.bulkAdd([entry('old', '1999-12-31', '2000-01-02'), entry('future', '2099-06-01')])
    expect((await entriesInRange('2000-01-01', '2000-01-31')).map((e) => e.id)).toEqual(['old'])
    expect((await entriesInRange('2099-06-01', '2099-06-01')).map((e) => e.id)).toEqual(['future'])
  })
})

describe('upcomingEntries', () => {
  it('returns entries that have not ended yet, in date order', async () => {
    await db.plan.bulkAdd([
      entry('later', '2027-03-01'),
      entry('past', '2026-10-01', '2026-10-10'),
      entry('ongoing', '2026-10-10', '2026-10-11'),
      entry('next', '2026-10-12'),
    ])
    expect((await upcomingEntries('2026-10-11')).map((e) => e.id)).toEqual(['ongoing', 'next', 'later'])
  })
})

describe('findOverlaps', () => {
  const others = [
    entry('chili', '2026-10-12', '2026-10-14'),
    entry('soup', '2026-10-16'),
    entry('pie', '2026-10-08', '2026-10-10'),
  ]

  it('finds entries sharing at least one day, in date order', () => {
    expect(findOverlaps({ startDate: '2026-10-10', endDate: '2026-10-16' }, others).map((e) => e.id)).toEqual([
      'pie',
      'chili',
      'soup',
    ])
    expect(findOverlaps({ startDate: '2026-10-14', endDate: '2026-10-14' }, others).map((e) => e.id)).toEqual(['chili'])
  })

  it('ignores entries that only touch the edges', () => {
    expect(findOverlaps({ startDate: '2026-10-15', endDate: '2026-10-15' }, others)).toEqual([])
    expect(findOverlaps({ startDate: '2026-10-11', endDate: '2026-10-11' }, others)).toEqual([])
  })

  it('ignores the entry being edited', () => {
    expect(findOverlaps({ id: 'chili', startDate: '2026-10-12', endDate: '2026-10-13' }, others)).toEqual([])
  })
})

describe('overlapWarning', () => {
  it('names the clashing day and dinner', () => {
    expect(
      overlapWarning({ startDate: '2026-10-11', endDate: '2026-10-13' }, entry('Chili', '2026-10-13', '2026-10-15')),
    ).toBe('Tue 13 Oct already has Chili')
  })

  it('names the clashing days when several overlap', () => {
    expect(
      overlapWarning({ startDate: '2026-10-12', endDate: '2026-10-20' }, entry('Chili', '2026-10-10', '2026-10-14')),
    ).toBe('Mon 12 – Wed 14 Oct already have Chili')
  })
})

describe('layoutWeekBars', () => {
  const week = '2026-10-12' // Monday

  it('places an entry inside the week at its column and span', () => {
    const [bar] = layoutWeekBars(week, [entry('a', '2026-10-13', '2026-10-15')])
    expect(bar).toMatchObject({ column: 1, span: 3, lane: 0, continuesBefore: false, continuesAfter: false })
  })

  it('clips an entry that started in the previous week', () => {
    const [bar] = layoutWeekBars(week, [entry('a', '2026-10-10', '2026-10-13')])
    expect(bar).toMatchObject({ column: 0, span: 2, continuesBefore: true, continuesAfter: false })
  })

  it('clips an entry that continues into the next week', () => {
    const [bar] = layoutWeekBars(week, [entry('a', '2026-10-17', '2026-10-20')])
    expect(bar).toMatchObject({ column: 5, span: 2, continuesBefore: false, continuesAfter: true })
  })

  it('spans the whole week for an entry covering it', () => {
    const [bar] = layoutWeekBars(week, [entry('a', '2026-10-01', '2026-10-31')])
    expect(bar).toMatchObject({ column: 0, span: 7, continuesBefore: true, continuesAfter: true })
  })

  it('splits an entry crossing week and month boundaries into one bar per week row', () => {
    // Fri 30 Oct – Tue 3 Nov 2026 crosses both the week and the month boundary.
    const e = entry('a', '2026-10-30', '2026-11-03')
    expect(layoutWeekBars('2026-10-26', [e])).toEqual([
      { entry: e, column: 4, span: 3, lane: 0, continuesBefore: false, continuesAfter: true },
    ])
    expect(layoutWeekBars('2026-11-02', [e])).toEqual([
      { entry: e, column: 0, span: 2, lane: 0, continuesBefore: true, continuesAfter: false },
    ])
  })

  it('handles the DST change inside the week', () => {
    // DST ends on Sunday 25 Oct 2026.
    const [bar] = layoutWeekBars('2026-10-19', [entry('a', '2026-10-24', '2026-10-26')])
    expect(bar).toMatchObject({ column: 5, span: 2, continuesAfter: true })
  })

  it('leaves out entries outside the week', () => {
    expect(layoutWeekBars(week, [entry('a', '2026-10-11'), entry('b', '2026-10-19')])).toEqual([])
  })

  it('puts entries that do not overlap in the same lane', () => {
    const bars = layoutWeekBars(week, [entry('b', '2026-10-15', '2026-10-18'), entry('a', '2026-10-12', '2026-10-14')])
    expect(bars.map((b) => [b.entry.id, b.lane])).toEqual([
      ['a', 0],
      ['b', 0],
    ])
  })

  it('stacks overlapping entries in separate lanes and reuses freed lanes', () => {
    const bars = layoutWeekBars(week, [
      entry('long', '2026-10-12', '2026-10-18'),
      entry('mid', '2026-10-13', '2026-10-14'),
      entry('late', '2026-10-16'),
      entry('clash', '2026-10-14', '2026-10-16'),
    ])
    expect(Object.fromEntries(bars.map((b) => [b.entry.id, b.lane]))).toEqual({ long: 0, mid: 1, clash: 2, late: 1 })
  })

  it('puts the longer entry first when two start on the same day', () => {
    const bars = layoutWeekBars(week, [entry('short', '2026-10-13'), entry('long', '2026-10-13', '2026-10-15')])
    expect(bars.map((b) => [b.entry.id, b.lane])).toEqual([
      ['long', 0],
      ['short', 1],
    ])
  })
})

describe('unplannedDays', () => {
  it('lists the days in the next week without a dinner, starting today', () => {
    const entries = [
      entry('a', '2026-10-09', '2026-10-12'),
      entry('b', '2026-10-14', '2026-10-15'),
      entry('c', '2026-10-17', '2026-10-30'),
    ]
    expect(unplannedDays('2026-10-11', entries)).toEqual(['2026-10-13', '2026-10-16'])
  })

  it('lists all 7 days when nothing is planned', () => {
    expect(unplannedDays('2026-10-11', [])).toEqual([
      '2026-10-11',
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
      '2026-10-17',
    ])
  })
})

describe('savePlanEntry', () => {
  it('creates or updates an entry, keeping a picked library meal link', async () => {
    const created = await savePlanEntry(input({ mealId: 'm1' }))
    expect(await db.plan.get(created.id)).toEqual({ ...input({ mealId: 'm1' }), id: created.id })
    await savePlanEntry(input({ title: 'Stew' }), { id: created.id })
    expect(await db.plan.get(created.id)).toEqual({ ...input({ title: 'Stew' }), id: created.id })
    expect(await db.meals.count()).toBe(0)
  })

  it('saves a free-text title to the library and links the entry to the new meal', async () => {
    const entry = await savePlanEntry(input({ title: ' Fish pie ' }), { saveToLibrary: true })
    const meals = await db.meals.toArray()
    expect(meals).toHaveLength(1)
    expect(meals[0].name).toBe('Fish pie')
    expect(entry.mealId).toBe(meals[0].id)
    expect((await db.plan.get(entry.id))?.mealId).toBe(meals[0].id)
  })

  it('links an edited entry to a new library meal', async () => {
    const existing = await createPlanEntry(input())
    const entry = await savePlanEntry(input(), { id: existing.id, saveToLibrary: true })
    expect(entry.id).toBe(existing.id)
    expect(entry.mealId).toBe((await db.meals.toArray())[0].id)
  })

  it('does not create a meal for an entry already linked to one', async () => {
    const entry = await savePlanEntry(input({ mealId: 'm1' }), { saveToLibrary: true })
    expect(entry.mealId).toBe('m1')
    expect(await db.meals.count()).toBe(0)
  })

  it('creates neither the meal nor the entry when the input is invalid', async () => {
    await expect(savePlanEntry(input({ title: ' ' }), { saveToLibrary: true })).rejects.toThrow(/title/)
    await expect(savePlanEntry(input(), { id: 'missing', saveToLibrary: true })).rejects.toThrow(/not found/)
    expect(await db.meals.count()).toBe(0)
    expect(await db.plan.count()).toBe(0)
  })
})

describe('planEntriesForMeal', () => {
  it('returns only the entries linked to the meal', async () => {
    const a = await createPlanEntry(input({ mealId: 'm1' }))
    await createPlanEntry(input({ mealId: 'm2' }))
    await createPlanEntry(input())
    expect(await planEntriesForMeal('m1')).toEqual([a])
  })
})

describe('mealPlanStats', () => {
  const today = '2026-10-11'

  it('reports nothing for a meal that was never planned', () => {
    expect(mealPlanStats([], today)).toEqual({ timesPlanned: 0 })
  })

  it('counts every entry and finds the latest one started by today', () => {
    const entries = [entry('a', '2026-09-01', '2026-09-02'), entry('b', '2026-10-05'), entry('c', '2025-12-24')]
    expect(mealPlanStats(entries, today)).toEqual({ timesPlanned: 3, lastPlanned: '2026-10-05' })
  })

  it('counts an entry that started today or is ongoing as last planned', () => {
    expect(mealPlanStats([entry('a', '2026-10-10', '2026-10-12')], today).lastPlanned).toBe('2026-10-10')
    expect(mealPlanStats([entry('a', today)], today).lastPlanned).toBe(today)
  })

  it('reports the earliest future entry as next planned, not as last planned', () => {
    const entries = [entry('a', '2026-11-01'), entry('b', '2026-10-20', '2026-10-21'), entry('c', '2026-10-01')]
    expect(mealPlanStats(entries, today)).toEqual({
      timesPlanned: 3,
      lastPlanned: '2026-10-01',
      nextPlanned: '2026-10-20',
    })
    expect(mealPlanStats([entry('a', '2026-10-12')], today)).toEqual({ timesPlanned: 1, nextPlanned: '2026-10-12' })
  })
})
