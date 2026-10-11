import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db'
import { createPlanEntry, type PlanInput } from '../logic/plan'
import CalendarView from './CalendarView'

// Only the clock is faked, so Dexie's and Testing Library's timers still run.
// Today is Sunday 11 October 2026.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 11, 12, 0))
})

afterEach(async () => {
  vi.useRealTimers()
  await Promise.all(db.tables.map((t) => t.clear()))
})

const plan = (extra: Partial<PlanInput> = {}) =>
  createPlanEntry({ title: 'Chili', startDate: '2026-10-13', endDate: '2026-10-15', ...extra })

const type = (label: string | RegExp, value: string) =>
  fireEvent.change(within(screen.getByRole('dialog')).getByLabelText(label), { target: { value } })

const monthTitle = () => screen.getByRole('heading', { level: 2 }).textContent
const day = (name: RegExp) => screen.getByRole('button', { name })

describe('CalendarView month grid', () => {
  it('shows the current month, Monday first', () => {
    render(<CalendarView />)
    expect(monthTitle()).toBe('October 2026')
    const days = screen.getAllByRole('button', { name: /^\w+day \d+ \w+ \d{4}/ })
    // 28 Sep – 1 Nov: five Monday-first week rows.
    expect(days).toHaveLength(35)
    expect(days[0]).toHaveAccessibleName(/^Monday 28 September 2026/)
    expect(day(/^Sunday 11 October/)).toHaveAttribute('aria-current', 'date')
  })

  it('navigates with prev/next and back with Today, far in both directions', () => {
    render(<CalendarView />)
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
    expect(monthTitle()).toBe('January 2027')
    fireEvent.click(screen.getByRole('button', { name: 'Today' }))
    expect(monthTitle()).toBe('October 2026')
    for (let i = 0; i < 24; i++) fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(monthTitle()).toBe('October 2024')
    expect(day(/^Tuesday 1 October 2024/)).toBeInTheDocument()
  })

  it('changes month when swiped left or right', () => {
    render(<CalendarView />)
    const grid = screen.getByTestId('month-grid')
    const swipe = (fromX: number, toX: number, y = 100) => {
      fireEvent.touchStart(grid, { touches: [{ clientX: fromX, clientY: y }] })
      fireEvent.touchEnd(grid, { changedTouches: [{ clientX: toX, clientY: y }] })
    }
    swipe(300, 100)
    expect(monthTitle()).toBe('November 2026')
    swipe(100, 300)
    swipe(100, 300)
    expect(monthTitle()).toBe('September 2026')
    // Too short, or mostly vertical: a scroll, not a swipe.
    swipe(100, 120)
    fireEvent.touchStart(grid, { touches: [{ clientX: 100, clientY: 0 }] })
    fireEvent.touchEnd(grid, { changedTouches: [{ clientX: 170, clientY: 300 }] })
    expect(monthTitle()).toBe('September 2026')
  })

  it('shows a multi-day entry as one bar per week row', async () => {
    await plan({ title: 'Lasagna', startDate: '2026-10-16', endDate: '2026-10-20' })
    render(<CalendarView />)
    const bars = await screen.findAllByRole('button', { name: 'Lasagna, Fri 16 – Tue 20 Oct' })
    expect(bars).toHaveLength(2)
    expect(bars[0]).toHaveStyle({ gridColumn: '5 / span 3' })
    expect(bars[1]).toHaveStyle({ gridColumn: '1 / span 2' })
  })

  it('splits an entry across a month boundary and shows it in both months', async () => {
    await plan({ title: 'Stew', startDate: '2026-10-30', endDate: '2026-11-03' })
    render(<CalendarView />)
    expect(await screen.findAllByRole('button', { name: /^Stew/ })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
    expect(await screen.findAllByRole('button', { name: /^Stew/ })).toHaveLength(2)
  })

  it('highlights days in the next 7 days without a dinner', async () => {
    await plan({ startDate: '2026-10-13', endDate: '2026-10-15' })
    render(<CalendarView />)
    await screen.findAllByRole('button', { name: /^Chili/ })
    const unplanned = screen
      .getAllByRole('button', { name: /nothing planned$/ })
      .map((b) => b.getAttribute('aria-label')?.split(' ').slice(0, 2).join(' '))
    expect(unplanned).toEqual(['Sunday 11', 'Monday 12', 'Friday 16', 'Saturday 17'])
    expect(day(/^Monday 12 October/)).toHaveClass('day-unplanned')
    expect(day(/^Tuesday 13 October/)).not.toHaveClass('day-unplanned')
    expect(day(/^Sunday 18 October/)).not.toHaveClass('day-unplanned')
    expect(day(/^Saturday 10 October/)).not.toHaveClass('day-unplanned')
  })
})

describe('Plan dinner sheet', () => {
  it('plans a multi-day dinner from a tapped day', async () => {
    render(<CalendarView />)
    fireEvent.click(day(/^Monday 19 October/))
    const dialog = screen.getByRole('dialog', { name: 'Plan dinner' })
    expect(within(dialog).getByLabelText(/start date/i)).toHaveValue('2026-10-19')
    // New dinners default to 2 days.
    expect(within(dialog).getByLabelText(/days/i)).toHaveValue(2)
    expect(within(dialog).getByLabelText(/end date/i)).toHaveValue('2026-10-20')

    type(/title/i, 'Lasagna')
    type(/days/i, '3')
    expect(within(dialog).getByLabelText(/end date/i)).toHaveValue('2026-10-21')
    type(/note/i, 'Big tray')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('button', { name: 'Lasagna, Mon 19 – Wed 21 Oct' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
    const [stored] = await db.plan.toArray()
    expect(stored).toMatchObject({ title: 'Lasagna', startDate: '2026-10-19', endDate: '2026-10-21', note: 'Big tray' })
  })

  it('keeps days and end date in sync, and moves the end with the start', () => {
    render(<CalendarView />)
    fireEvent.click(day(/^Monday 19 October/))
    const dialog = screen.getByRole('dialog')
    type(/end date/i, '2026-10-22')
    expect(within(dialog).getByLabelText(/days/i)).toHaveValue(4)
    type(/start date/i, '2026-10-20')
    expect(within(dialog).getByLabelText(/end date/i)).toHaveValue('2026-10-23')
  })

  it('requires a title and an end date on or after the start', async () => {
    render(<CalendarView />)
    fireEvent.click(day(/^Monday 19 October/))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/title/i)

    type(/title/i, 'Chili')
    type(/end date/i, '2026-10-18')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/before the start date/i)
    expect(within(dialog).getByLabelText(/end date/i)).toHaveAttribute('aria-invalid', 'true')
    expect(await db.plan.count()).toBe(0)
  })

  it('warns about overlapping dinners but still saves', async () => {
    await plan({ title: 'Chili', startDate: '2026-10-13', endDate: '2026-10-15' })
    render(<CalendarView />)
    fireEvent.click(day(/^Monday 12 October/))
    type(/title/i, 'Soup')
    type(/days/i, '2')
    const dialog = screen.getByRole('dialog')
    expect(await within(dialog).findByText('Tue 13 Oct already has Chili')).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(await db.plan.count()).toBe(2)
  })

  it('opens the edit sheet from a bar, and edits and deletes the entry', async () => {
    await plan({ note: 'Spicy' })
    render(<CalendarView />)
    fireEvent.click(await screen.findByRole('button', { name: /^Chili/ }))
    const dialog = screen.getByRole('dialog', { name: 'Edit dinner' })
    expect(within(dialog).getByLabelText(/title/i)).toHaveValue('Chili')
    expect(within(dialog).getByLabelText(/days/i)).toHaveValue(3)
    expect(within(dialog).getByLabelText(/note/i)).toHaveValue('Spicy')
    // The entry doesn't warn about overlapping itself.
    expect(within(dialog).queryByText(/already/)).toBeNull()

    type(/title/i, 'Beef chili')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    fireEvent.click(await screen.findByRole('button', { name: /^Beef chili/ }))

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.queryByRole('button', { name: /^Beef chili/ })).toBeNull()
    expect(await db.plan.count()).toBe(0)
  })

  it('opens the edit sheet when tapping anywhere on a planned day', async () => {
    await plan({ title: 'Chili', startDate: '2026-10-13', endDate: '2026-10-15' })
    render(<CalendarView />)
    await screen.findAllByRole('button', { name: /^Chili/ })
    fireEvent.click(day(/^Wednesday 14 October 2026, Chili$/))
    expect(within(screen.getByRole('dialog', { name: 'Edit dinner' })).getByLabelText(/title/i)).toHaveValue('Chili')
  })

  it('closes on Cancel and Escape without saving', async () => {
    render(<CalendarView />)
    fireEvent.click(day(/^Monday 19 October/))
    type(/title/i, 'Soup')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(day(/^Monday 19 October/))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(await db.plan.count()).toBe(0)
  })
})

describe('Agenda list', () => {
  it('lists upcoming entries in date order and opens the edit sheet', async () => {
    await plan({ title: 'Pie', startDate: '2027-02-01', endDate: '2027-02-01' })
    await plan({ title: 'Old', startDate: '2026-10-01', endDate: '2026-10-10' })
    await plan({ title: 'Chili', startDate: '2026-10-13', endDate: '2026-10-15' })
    await plan({ title: 'Ongoing', startDate: '2026-10-10', endDate: '2026-10-11' })
    render(<CalendarView />)
    fireEvent.click(screen.getByRole('button', { name: 'Agenda' }))

    const list = await screen.findByRole('list', { name: 'Upcoming dinners' })
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(3))
    const rows = within(list).getAllByRole('button')
    expect(rows.map((r) => r.querySelector('.meal-name')?.textContent)).toEqual(['Ongoing', 'Chili', 'Pie'])
    expect(rows[1]).toHaveTextContent('Tue 13 – Thu 15 Oct')
    expect(rows[1]).toHaveTextContent('3 days')
    expect(rows[2]).toHaveTextContent('Mon 1 Feb 2027')

    fireEvent.click(rows[1])
    expect(within(screen.getByRole('dialog', { name: 'Edit dinner' })).getByLabelText(/title/i)).toHaveValue('Chili')
  })

  it('plans a dinner from the agenda starting today', async () => {
    render(<CalendarView />)
    fireEvent.click(screen.getByRole('button', { name: 'Agenda' }))
    expect(await screen.findByText(/nothing planned/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /plan dinner/i }))
    expect(within(screen.getByRole('dialog')).getByLabelText(/start date/i)).toHaveValue('2026-10-11')
  })

  it('switches back to the month grid', () => {
    render(<CalendarView />)
    fireEvent.click(screen.getByRole('button', { name: 'Agenda' }))
    expect(screen.getByRole('button', { name: 'Agenda' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Month' }))
    expect(screen.getByTestId('month-grid')).toBeInTheDocument()
  })
})
