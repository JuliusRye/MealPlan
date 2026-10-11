import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { db } from '../db'
import { createFreezerItem, type FreezerInput } from '../logic/freezer'
import { createMeal } from '../logic/meals'
import FreezerView from './FreezerView'

// Only the clock is faked, so Dexie's and Testing Library's timers still run.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 11, 12, 0))
})

afterEach(async () => {
  vi.useRealTimers()
  await Promise.all(db.tables.map((t) => t.clear()))
})

const add = (extra: Partial<FreezerInput> = {}) =>
  createFreezerItem({ name: 'Chili', portions: 2, frozenDate: '2026-09-01', expiryDate: '2027-01-01', ...extra })

const type = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })

const inStockNames = async () =>
  within(await screen.findByRole('list', { name: 'In the freezer' }))
    .getAllByRole('listitem')
    .map((li) => li.querySelector('.meal-name')?.textContent)

describe('FreezerView', () => {
  it('shows an empty state', async () => {
    render(<FreezerView />)
    expect(await screen.findByText(/freezer is empty/i)).toBeInTheDocument()
  })

  it('requires an expiry date to save', async () => {
    render(<FreezerView />)
    fireEvent.click(await screen.findByRole('button', { name: /add item/i }))
    type(/name/i, 'Chili')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByRole('alert')).toHaveTextContent(/expiry date/i)
    expect(screen.getByLabelText(/expiry date/i)).toHaveAttribute('aria-invalid', 'true')
    expect(await db.freezer.count()).toBe(0)
  })

  it('adds an item from a library meal with frozen date defaulting to today', async () => {
    const meal = await createMeal({ name: 'Lasagna' })
    render(<FreezerView />)
    fireEvent.click(await screen.findByRole('button', { name: /add item/i }))

    expect(screen.getByLabelText(/frozen on/i)).toHaveValue('2026-10-11')
    fireEvent.change(await screen.findByLabelText(/library meal/i), { target: { value: meal.id } })
    expect(screen.getByLabelText(/name/i)).toHaveValue('Lasagna')
    type(/portions/i, '3')
    type(/expiry date/i, '2027-01-11')
    type(/note/i, 'Big tray')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await inStockNames()).toEqual(['Lasagna'])
    const [stored] = await db.freezer.toArray()
    expect(stored).toMatchObject({
      name: 'Lasagna',
      mealId: meal.id,
      portions: 3,
      frozenDate: '2026-10-11',
      expiryDate: '2027-01-11',
      note: 'Big tray',
    })
  })

  it('rejects an expiry date before the frozen date', async () => {
    render(<FreezerView />)
    fireEvent.click(await screen.findByRole('button', { name: /add item/i }))
    type(/name/i, 'Chili')
    type(/expiry date/i, '2026-10-10')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/before the frozen date/i)
    expect(await db.freezer.count()).toBe(0)
  })

  it('lists items by expiry date with portions and expiry badges', async () => {
    await add({ name: 'Soup', expiryDate: '2027-03-01' })
    await add({ name: 'Stew', expiryDate: '2026-10-01' })
    await add({ name: 'Curry', expiryDate: '2026-10-20' })
    await add({ name: 'Pie', expiryDate: '2026-11-12' })
    render(<FreezerView />)

    expect(await inStockNames()).toEqual(['Stew', 'Curry', 'Pie', 'Soup'])
    const row = (name: string) => screen.getByText(name).closest('li') as HTMLElement
    expect(within(row('Stew')).getByText('Expired')).toHaveClass('chip-expired')
    expect(within(row('Curry')).getByText('Expires in 9 days')).toHaveClass('chip-soon')
    expect(within(row('Pie')).queryByText(/expires in|expired/i)).toBeNull()
    expect(within(row('Soup')).getByText('2')).toBeInTheDocument()
  })

  it('adjusts portions with +/− and moves used-up items to their own section', async () => {
    const { id } = await add({ portions: 1, expiryDate: '2026-10-01' })
    render(<FreezerView />)

    fireEvent.click(await screen.findByRole('button', { name: 'Add a portion of Chili' }))
    await waitFor(async () => expect((await db.freezer.get(id))?.portions).toBe(2))
    fireEvent.click(await screen.findByRole('button', { name: 'Remove a portion of Chili' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Remove a portion of Chili' }))
    await waitFor(async () => expect((await db.freezer.get(id))?.portions).toBe(0))

    const usedUp = await screen.findByRole('list', { name: 'Used up' })
    expect(within(usedUp).getByText('Chili')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'In the freezer' })).toBeNull()
    expect(within(usedUp).queryByText('Expired')).toBeNull()
    expect(within(usedUp).getByRole('button', { name: 'Remove a portion of Chili' })).toBeDisabled()
  })

  it('edits and deletes an item', async () => {
    await add()
    render(<FreezerView />)
    fireEvent.click(await screen.findByRole('button', { name: /^chili/i }))
    expect(screen.getByLabelText(/expiry date/i)).toHaveValue('2027-01-01')
    type(/name/i, 'Beef chili')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await inStockNames()).toEqual(['Beef chili'])

    fireEvent.click(screen.getByRole('button', { name: /^beef chili/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }))
    expect(await screen.findByText(/freezer is empty/i)).toBeInTheDocument()
    expect(await db.freezer.count()).toBe(0)
  })
})

describe('Freezer tab badge', () => {
  it('counts soon and expired items that still have portions', async () => {
    await add({ name: 'Stew', expiryDate: '2026-10-01' })
    await add({ name: 'Curry', expiryDate: '2026-10-20' })
    await add({ name: 'Pie', expiryDate: '2026-11-12' })
    await add({ name: 'Gone', expiryDate: '2026-10-01', portions: 0 })
    render(<App />)

    expect(await screen.findByRole('button', { name: 'Freezer, 2 expiring soon or expired' })).toBeInTheDocument()
  })

  it('is hidden when nothing is expiring', async () => {
    await add({ expiryDate: '2026-11-12' })
    render(<App />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Freezer' })).toBeInTheDocument())
    expect(document.querySelector('.tab-badge')).toBeNull()
  })
})
