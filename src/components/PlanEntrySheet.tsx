import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useId, useState } from 'react'
import { db, type Meal, type PlanEntry } from '../db'
import { addDaysISO, compareISO, isISODate, type ISODate } from '../logic/dates'
import { findMealByName, searchMeals } from '../logic/meals'
import { deletePlanEntry, entriesInRange, entryDays, findOverlaps, overlapWarning, savePlanEntry } from '../logic/plan'
import ConfirmDelete from './ConfirmDelete'

interface Errors {
  title?: string
  startDate?: string
  endDate?: string
  save?: string
}

interface Props {
  /** The entry to edit; omit to plan a new dinner. */
  entry?: PlanEntry
  /** Start date for a new dinner. */
  startDate?: ISODate
  /** Library meal to plan as a new dinner. */
  meal?: Meal
  onClose: () => void
}

/** New dinners usually cover a cook-once, eat-twice batch. */
const DEFAULT_DAYS = 2
/** Library matches shown under the title field. */
const MAX_SUGGESTIONS = 5

const parseDays = (value: string) => {
  const n = Number(value)
  return value.trim() !== '' && Number.isInteger(n) && n >= 1 ? n : undefined
}

/** Bottom sheet to plan a dinner over one or more days, or edit/delete an existing one. */
export default function PlanEntrySheet({ entry, startDate: initialStart, meal, onClose }: Props) {
  const id = useId()
  const [title, setTitle] = useState(entry?.title ?? meal?.name ?? '')
  const [mealId, setMealId] = useState(entry?.mealId ?? meal?.id)
  const [saveToLibrary, setSaveToLibrary] = useState(false)
  const [startDate, setStartDate] = useState(entry?.startDate ?? initialStart ?? '')
  const [endDate, setEndDate] = useState(
    entry?.endDate ?? (initialStart ? addDaysISO(initialStart, DEFAULT_DAYS - 1) : ''),
  )
  const [days, setDays] = useState((entry ? entryDays(entry) : DEFAULT_DAYS).toString())
  const [note, setNote] = useState(entry?.note ?? '')
  const [errors, setErrors] = useState<Errors>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const validRange = isISODate(startDate) && isISODate(endDate) && compareISO(endDate, startDate) >= 0
  const overlaps = useLiveQuery(
    async () => (validRange ? findOverlaps({ id: entry?.id, startDate, endDate }, await entriesInRange(startDate, endDate)) : []),
    [validRange, startDate, endDate, entry?.id],
  )

  const meals = useLiveQuery(() => db.meals.toArray())
  const linkedMeal = mealId ? meals?.find((m) => m.id === mealId) : undefined
  const query = title.trim()
  const matches = !linkedMeal && query && meals ? searchMeals(meals, query) : []
  // A typed library name links to that meal on save, as if it had been picked.
  const sameName = !linkedMeal && meals ? findMealByName(meals, title) : undefined
  // Wait for the library to load so the checkbox doesn't flash for a linked entry.
  const offerSave = !!meals && !linkedMeal && !!query && !sameName

  const clearError = (...keys: (keyof Errors)[]) =>
    setErrors((prev) => ({ ...prev, ...Object.fromEntries(keys.map((k) => [k, undefined])) }))

  function changeTitle(value: string) {
    setTitle(value)
    // The title is the entry's own snapshot; editing it means a different dinner.
    setMealId(undefined)
    clearError('title')
  }

  function pickMeal(picked: Meal) {
    setTitle(picked.name)
    setMealId(picked.id)
    clearError('title')
  }

  function changeStart(value: string) {
    setStartDate(value)
    clearError('startDate', 'endDate')
    const n = parseDays(days)
    if (isISODate(value) && n) setEndDate(addDaysISO(value, n - 1))
  }

  function changeDays(value: string) {
    setDays(value)
    clearError('endDate')
    const n = parseDays(value)
    if (isISODate(startDate) && n) setEndDate(addDaysISO(startDate, n - 1))
  }

  function changeEnd(value: string) {
    setEndDate(value)
    clearError('endDate')
    if (isISODate(startDate) && isISODate(value) && compareISO(value, startDate) >= 0) {
      setDays(entryDays({ startDate, endDate: value }).toString())
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const found: Errors = {}
    if (!title.trim()) found.title = 'Please enter a title.'
    if (!isISODate(startDate)) found.startDate = 'Please enter a start date.'
    if (!isISODate(endDate)) found.endDate = 'Please enter an end date.'
    else if (!found.startDate && compareISO(endDate, startDate) < 0) {
      found.endDate = 'The end date cannot be before the start date.'
    }
    setErrors(found)
    if (Object.values(found).some(Boolean)) return

    // Keep freezer links the sheet doesn't edit yet; cleanPlanInput drops the id.
    // Until the library loads, trust the link we were given.
    const link = meals ? (linkedMeal ?? sameName)?.id : mealId
    const input = { ...entry, title, startDate, endDate, note, mealId: link }
    setSaving(true)
    try {
      await savePlanEntry(input, { id: entry?.id, saveToLibrary: offerSave && saveToLibrary })
      onClose()
    } catch {
      setErrors({ save: 'Could not save the dinner. Please try again.' })
      setSaving(false)
    }
  }

  const fieldError = (key: Exclude<keyof Errors, 'save'>) =>
    errors[key] && (
      <p id={`${id}-${key}-error`} className="field-error" role="alert">
        {errors[key]}
      </p>
    )
  const invalidProps = (key: Exclude<keyof Errors, 'save'>) => ({
    'aria-invalid': errors[key] ? true : undefined,
    'aria-describedby': errors[key] ? `${id}-${key}-error` : undefined,
  })

  return (
    <div
      className="sheet-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby={`${id}-heading`}>
        <h2 id={`${id}-heading`}>{entry ? 'Edit dinner' : 'Plan dinner'}</h2>
        <form className="form" onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor={`${id}-title`}>Title</label>
            <input
              id={`${id}-title`}
              value={title}
              onChange={(e) => changeTitle(e.target.value)}
              placeholder="Search meals or type a dinner"
              autoComplete="off"
              autoFocus={!entry && !meal}
              {...invalidProps('title')}
            />
            {fieldError('title')}
            {linkedMeal && <p className="field-hint">Linked to your meal library</p>}
            {matches.length > 0 && (
              <ul className="meal-suggestions" aria-label="Library meals">
                {matches.slice(0, MAX_SUGGESTIONS).map((m) => (
                  <li key={m.id}>
                    <button type="button" onClick={() => pickMeal(m)}>
                      {m.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {offerSave && (
              <label className="checkbox">
                <input type="checkbox" checked={saveToLibrary} onChange={(e) => setSaveToLibrary(e.target.checked)} />
                Save to meal library
              </label>
            )}
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor={`${id}-startDate`}>Start date</label>
              <input
                id={`${id}-startDate`}
                type="date"
                value={startDate}
                onChange={(e) => changeStart(e.target.value)}
                {...invalidProps('startDate')}
              />
              {fieldError('startDate')}
            </div>
            <div className="field field-days">
              <label htmlFor={`${id}-days`}>Days</label>
              <input
                id={`${id}-days`}
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={days}
                onChange={(e) => changeDays(e.target.value)}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor={`${id}-endDate`}>End date</label>
            <input
              id={`${id}-endDate`}
              type="date"
              value={endDate}
              min={isISODate(startDate) ? startDate : undefined}
              onChange={(e) => changeEnd(e.target.value)}
              {...invalidProps('endDate')}
            />
            {fieldError('endDate')}
          </div>

          {overlaps && overlaps.length > 0 && (
            <ul className="overlap-warnings" role="status">
              {overlaps.map((other) => (
                <li key={other.id}>{overlapWarning({ startDate, endDate }, other)}</li>
              ))}
            </ul>
          )}

          <div className="field">
            <label htmlFor={`${id}-note`}>Note</label>
            <textarea id={`${id}-note`} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          {errors.save && (
            <p className="form-error" role="alert">
              {errors.save}
            </p>
          )}
          <div className="actions">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={saving}>
              Save
            </button>
          </div>
        </form>
        {entry && (
          <ConfirmDelete
            errorMessage="Could not delete the dinner."
            onDelete={async () => {
              await deletePlanEntry(entry.id)
              onClose()
            }}
          />
        )}
      </div>
    </div>
  )
}
