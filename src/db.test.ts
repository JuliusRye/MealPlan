import { afterEach, describe, expect, it } from 'vitest'
import { db, newId } from './db'

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('db schema', () => {
  it('defines the four tables with their indexes', () => {
    expect(db.verno).toBe(2)
    const schema = Object.fromEntries(
      db.tables.map((t) => [t.name, [t.schema.primKey.name, ...t.schema.indexes.map((i) => i.name)]]),
    )
    expect(schema).toEqual({
      meals: ['id', 'name'],
      mealImages: ['id', 'mealId'],
      plan: ['id', 'startDate', 'endDate', 'mealId'],
      freezer: ['id', 'expiryDate'],
    })
  })

  it('stores and queries rows by their indexes', async () => {
    await db.plan.bulkAdd([
      { id: newId(), startDate: '2026-03-02', endDate: '2026-03-04', title: 'Lasagna' },
      { id: newId(), startDate: '2026-03-10', endDate: '2026-03-10', title: 'Chili' },
    ])
    const early = await db.plan.where('startDate').below('2026-03-05').toArray()
    expect(early.map((e) => e.title)).toEqual(['Lasagna'])

    await db.freezer.add({
      id: newId(), name: 'Soup', portions: 2, frozenDate: '2026-01-01', expiryDate: '2026-04-01',
    })
    expect(await db.freezer.orderBy('expiryDate').count()).toBe(1)
  })
})

describe('newId', () => {
  it('returns unique UUIDs', () => {
    const a = newId()
    expect(a).toMatch(/^[0-9a-f-]{36}$/)
    expect(newId()).not.toBe(a)
  })
})
