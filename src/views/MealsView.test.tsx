import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { db } from '../db'
import { createMeal } from '../logic/meals'
import MealsView from './MealsView'

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

const type = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })

describe('MealsView', () => {
  it('shows an empty state', async () => {
    render(<MealsView />)
    expect(await screen.findByText(/no meals yet/i)).toBeInTheDocument()
  })

  it('creates a meal with all fields and lists it with prep time and difficulty', async () => {
    render(<MealsView />)
    fireEvent.click(await screen.findByRole('button', { name: /add meal/i }))

    type(/name/i, 'Lasagna')
    type(/prep time/i, '75')
    fireEvent.click(screen.getByRole('radio', { name: 'Medium' }))
    type(/notes/i, 'Double the cheese')
    type(/recipe link/i, 'example.com/lasagna')
    type(/source/i, "Jamie's 30-Minute Meals, p. 112")
    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    const row = await screen.findByRole('button', { name: /lasagna/i })
    expect(row).toHaveTextContent('⏱ 1 h 15 min')
    expect(within(row).getByText('Medium')).toHaveClass('chip', 'chip-medium')

    const [stored] = await db.meals.toArray()
    expect(stored).toMatchObject({
      name: 'Lasagna',
      prepMinutes: 75,
      difficulty: 'medium',
      notes: 'Double the cheese',
      link: 'example.com/lasagna',
      source: "Jamie's 30-Minute Meals, p. 112",
    })
    expect(stored.createdAt).toBe(stored.updatedAt)
  })

  it('only requires a name', async () => {
    render(<MealsView />)
    fireEvent.click(await screen.findByRole('button', { name: /add meal/i }))
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(await db.meals.count()).toBe(0)
    expect(screen.getByRole('alert')).toHaveTextContent(/name/i)

    type(/name/i, 'Toast')
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    const row = await screen.findByRole('button', { name: /toast/i })
    expect(row).not.toHaveTextContent('⏱')
    expect(within(row).queryByText(/easy|medium|hard/i)).toBeNull()
  })

  it('rejects an invalid prep time instead of silently clearing it', async () => {
    const meal = await createMeal({ name: 'Chili', prepMinutes: 30 })
    render(<MealsView />)
    fireEvent.click(await screen.findByRole('button', { name: /chili/i }))
    fireEvent.click(await screen.findByRole('button', { name: /edit/i }))

    type(/prep time/i, '-5')
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(screen.getByRole('alert')).toHaveTextContent(/prep time/i)
    expect(screen.getByLabelText(/name/i)).not.toHaveAttribute('aria-invalid')
    expect((await db.meals.get(meal.id))?.prepMinutes).toBe(30)
  })

  it('shows details with the link opening in a new tab and the source as plain text', async () => {
    await createMeal({
      name: 'Chili',
      link: 'https://example.com/chili',
      source: 'https://not-a-link.example, p. 4',
      notes: 'Spicy',
    })
    render(<MealsView />)
    fireEvent.click(await screen.findByRole('button', { name: /chili/i }))

    const link = await screen.findByRole('link', { name: /example\.com\/chili/i })
    expect(link).toHaveAttribute('href', 'https://example.com/chili')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.getByText('https://not-a-link.example, p. 4').closest('a')).toBeNull()
    expect(screen.getByText('Spicy')).toBeInTheDocument()
  })

  it('edits a meal and bumps updatedAt', async () => {
    const meal = await createMeal({ name: 'Chili', prepMinutes: 30, difficulty: 'hard' }, 1000)
    render(<MealsView />)
    fireEvent.click(await screen.findByRole('button', { name: /chili/i }))
    fireEvent.click(await screen.findByRole('button', { name: /edit/i }))

    expect(screen.getByLabelText(/name/i)).toHaveValue('Chili')
    expect(screen.getByRole('radio', { name: 'Hard' })).toBeChecked()
    type(/name/i, 'Chili con carne')
    type(/prep time/i, '')
    fireEvent.click(screen.getByRole('radio', { name: 'Not set' }))
    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    expect(await screen.findByRole('heading', { name: 'Chili con carne' })).toBeInTheDocument()
    const stored = await db.meals.get(meal.id)
    expect(stored).toMatchObject({ name: 'Chili con carne', createdAt: 1000 })
    expect(stored?.prepMinutes).toBeUndefined()
    expect(stored?.difficulty).toBeUndefined()
    expect(stored?.updatedAt).toBeGreaterThan(1000)
  })

  it('deletes a meal after confirming', async () => {
    await createMeal({ name: 'Chili' })
    render(<MealsView />)
    fireEvent.click(await screen.findByRole('button', { name: /chili/i }))
    fireEvent.click(await screen.findByRole('button', { name: /^delete$/i }))
    expect(await db.meals.count()).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: /confirm delete/i }))

    expect(await screen.findByText(/no meals yet/i)).toBeInTheDocument()
    expect(await db.meals.count()).toBe(0)
  })

  it('filters the list by name', async () => {
    await createMeal({ name: 'Chili' })
    await createMeal({ name: 'Pasta pesto' })
    await createMeal({ name: 'Pasta carbonara' })
    render(<MealsView />)
    await screen.findByRole('button', { name: /chili/i })

    fireEvent.change(screen.getByRole('searchbox', { name: /search/i }), { target: { value: 'pasta' } })
    expect(screen.queryByRole('button', { name: /chili/i })).toBeNull()
    expect(screen.getAllByRole('button', { name: /pasta/i })).toHaveLength(2)

    fireEvent.change(screen.getByRole('searchbox', { name: /search/i }), { target: { value: 'zzz' } })
    expect(screen.getByText(/no meals match/i)).toBeInTheDocument()
  })

  it('keeps meals after a remount (data survives reload)', async () => {
    const { unmount } = render(<MealsView />)
    fireEvent.click(await screen.findByRole('button', { name: /add meal/i }))
    type(/name/i, 'Soup')
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    await screen.findByRole('button', { name: /soup/i })
    unmount()

    render(<MealsView />)
    expect(await screen.findByRole('button', { name: /soup/i })).toBeInTheDocument()
  })
})
