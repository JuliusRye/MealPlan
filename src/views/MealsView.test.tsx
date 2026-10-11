import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db'
import { addMealImages, getMealImages } from '../logic/images'
import { createMeal } from '../logic/meals'
import { resizeImage } from '../logic/resizeImage'
import MealsView from './MealsView'

// The canvas resize needs a real browser; stand in for it at that boundary.
vi.mock('../logic/resizeImage', () => ({
  resizeImage: vi.fn(async (file: Blob) => new Blob([`resized ${await file.text()}`], { type: 'image/jpeg' })),
}))

// jsdom has no object URLs. Track which blob each URL points to and which were revoked.
const objectUrls = new Map<string, Blob>()
const revoked = new Set<string>()
const { createObjectURL, revokeObjectURL } = URL
beforeEach(() => {
  objectUrls.clear()
  revoked.clear()
  URL.createObjectURL = (blob: Blob) => {
    const url = `blob:test/${objectUrls.size}`
    objectUrls.set(url, blob)
    return url
  }
  URL.revokeObjectURL = (url: string) => {
    revoked.add(url)
  }
})

afterAll(() => {
  Object.assign(URL, { createObjectURL, revokeObjectURL })
})

afterEach(async () => {
  vi.clearAllMocks()
  await Promise.all(db.tables.map((t) => t.clear()))
})

/** The text of the blob an <img> shows. */
const shownBlob = (img: HTMLElement) => objectUrls.get(img.getAttribute('src') ?? '')?.text()

const photo = (name: string) => new File([name], `${name}.jpg`, { type: 'image/jpeg' })

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

  describe('photos', () => {
    async function openMeal(name = 'Lasagna') {
      const meal = await createMeal({ name })
      render(<MealsView />)
      fireEvent.click(await screen.findByRole('button', { name: new RegExp(name, 'i') }))
      await screen.findByRole('heading', { name })
      return meal
    }

    const choose = (label: RegExp, files: File[]) =>
      fireEvent.change(screen.getByLabelText(label), { target: { files } })

    it('adds resized photos as recipe pages or finished dishes', async () => {
      const meal = await openMeal()
      choose(/add recipe page/i, [photo('page 1'), photo('page 2')])
      await waitFor(async () => expect(await getMealImages(meal.id)).toHaveLength(2))
      choose(/add dish photo/i, [photo('dish')])
      await waitFor(async () => expect(await getMealImages(meal.id)).toHaveLength(3))

      expect(resizeImage).toHaveBeenCalledTimes(3)
      const stored = await getMealImages(meal.id)
      expect(stored.map((i) => i.kind)).toEqual(['recipe', 'recipe', 'result'])
      expect(await Promise.all(stored.map((i) => i.blob.text()))).toEqual([
        'resized page 1', 'resized page 2', 'resized dish',
      ])

      const shown = await waitFor(() => {
        const imgs = screen.getAllByRole('img', { name: /photo \d/i })
        expect(imgs).toHaveLength(3)
        return imgs
      })
      expect(await Promise.all(shown.map(shownBlob))).toEqual(['resized page 1', 'resized page 2', 'resized dish'])
    })

    async function openMealWithPhotos(...texts: string[]) {
      const meal = await createMeal({ name: 'Lasagna' })
      await addMealImages(meal.id, texts.map((text) => ({ blob: new Blob([text]), kind: 'recipe' as const })))
      render(<MealsView />)
      fireEvent.click(await screen.findByRole('button', { name: /lasagna/i }))
      await waitFor(() => expect(screen.getAllByRole('img', { name: /photo \d/i })).toHaveLength(texts.length))
      return meal
    }
    const shownPhotos = () => Promise.all(screen.getAllByRole('img', { name: /photo \d/i }).map(shownBlob))

    it('switches a photo between recipe page and finished dish', async () => {
      const meal = await openMealWithPhotos('a', 'b')
      const group = screen.getByRole('radiogroup', { name: /photo 2 of 2/i })
      expect(within(group).getByRole('radio', { name: 'Recipe page' })).toBeChecked()

      fireEvent.click(within(group).getByRole('radio', { name: 'Finished dish' }))
      await waitFor(async () =>
        expect((await getMealImages(meal.id)).map((i) => i.kind)).toEqual(['recipe', 'result']),
      )
      await waitFor(() => expect(within(group).getByRole('radio', { name: 'Finished dish' })).toBeChecked())
    })

    it('reorders and removes photos', async () => {
      await openMealWithPhotos('a', 'b', 'c')
      expect(screen.getByRole('button', { name: /move photo 1 of 3 earlier/i })).toBeDisabled()
      expect(screen.getByRole('button', { name: /move photo 3 of 3 later/i })).toBeDisabled()

      fireEvent.click(screen.getByRole('button', { name: /move photo 3 of 3 earlier/i }))
      await waitFor(async () => expect(await shownPhotos()).toEqual(['a', 'c', 'b']))
      fireEvent.click(screen.getByRole('button', { name: /move photo 1 of 3 later/i }))
      await waitFor(async () => expect(await shownPhotos()).toEqual(['c', 'a', 'b']))

      fireEvent.click(screen.getByRole('button', { name: /remove photo 2 of 3/i }))
      expect(await shownPhotos()).toEqual(['c', 'a', 'b'])
      fireEvent.click(screen.getByRole('button', { name: /cancel removing photo 2 of 3/i }))
      fireEvent.click(screen.getByRole('button', { name: /remove photo 2 of 3/i }))
      fireEvent.click(screen.getByRole('button', { name: /confirm removing photo 2 of 3/i }))
      await waitFor(async () => expect(await shownPhotos()).toEqual(['c', 'b']))
    })

    it('opens a photo full screen and closes it again', async () => {
      await openMealWithPhotos('a', 'b')
      fireEvent.click(screen.getByRole('button', { name: /view photo 2 of 2 full screen/i }))

      const viewer = screen.getByRole('dialog', { name: /photo 2 of 2/i })
      expect(await shownBlob(within(viewer).getByRole('img'))).toBe('b')
      fireEvent.click(within(viewer).getByRole('button', { name: /close/i }))
      expect(screen.queryByRole('dialog')).toBeNull()

      fireEvent.click(screen.getByRole('button', { name: /view photo 1 of 2 full screen/i }))
      fireEvent.keyDown(window, { key: 'Escape' })
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('adds the readable photos and reports the ones that could not be read', async () => {
      vi.mocked(resizeImage).mockRejectedValueOnce(new Error('not an image'))
      const meal = await openMeal()
      choose(/add dish photo/i, [photo('broken'), photo('dish')])

      expect(await screen.findByRole('alert')).toHaveTextContent(/one photo could not be read/i)
      expect((await getMealImages(meal.id)).map((i) => i.kind)).toEqual(['result'])
    })

    it('revokes every object URL it created when unmounted', async () => {
      await openMealWithPhotos('a', 'b')
      fireEvent.click(screen.getByRole('button', { name: /view photo 1 of 2 full screen/i }))
      await waitFor(() => expect(within(screen.getByRole('dialog')).getByRole('img')).toBeInTheDocument())
      // Two gallery photos and the full-screen one (the list thumbnail is already gone).
      expect([...objectUrls.keys()].filter((url) => !revoked.has(url))).toHaveLength(3)

      cleanup()
      expect(revoked).toEqual(new Set(objectUrls.keys()))
    })

    it('shows a list thumbnail: the first finished dish, otherwise the first photo', async () => {
      const lasagna = await createMeal({ name: 'Lasagna' })
      const chili = await createMeal({ name: 'Chili' })
      await createMeal({ name: 'Toast' })
      await addMealImages(lasagna.id, [
        { blob: new Blob(['lasagna page']), kind: 'recipe' },
        { blob: new Blob(['lasagna dish']), kind: 'result' },
        { blob: new Blob(['lasagna dish 2']), kind: 'result' },
      ])
      await addMealImages(chili.id, [
        { blob: new Blob(['chili page']), kind: 'recipe' },
        { blob: new Blob(['chili page 2']), kind: 'recipe' },
      ])
      render(<MealsView />)

      const thumb = async (name: RegExp) => {
        const row = await screen.findByRole('button', { name })
        return waitFor(() => row.querySelector('img') ?? Promise.reject(new Error('no thumbnail yet')))
      }
      expect(await shownBlob(await thumb(/lasagna/i))).toBe('lasagna dish')
      expect(await shownBlob(await thumb(/chili/i))).toBe('chili page')
      expect(screen.getByRole('button', { name: /toast/i }).querySelector('img')).toBeNull()
    })
  })
})
