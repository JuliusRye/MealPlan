import { useId, useState } from 'react'
import type { Meal } from '../db'
import { compareISO, isISODate, todayISO } from '../logic/dates'
import type { FreezerInput } from '../logic/freezer'

interface Errors {
  name?: string
  portions?: string
  frozenDate?: string
  expiryDate?: string
  save?: string
}

interface Props {
  /** The item to edit, or prefilled fields for a new one. */
  initial?: Partial<FreezerInput>
  /** Library meals to pick from, sorted for display. */
  meals: readonly Meal[]
  onSave: (input: FreezerInput) => Promise<void>
  onCancel: () => void
}

/** Create/edit form for a freezer item. The expiry date is required and entered by hand. */
export default function FreezerItemForm({ initial, meals, onSave, onCancel }: Props) {
  const id = useId()
  // Drop a link to a meal that has since been deleted from the library.
  const [mealId, setMealId] = useState(() => meals.find((m) => m.id === initial?.mealId)?.id ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [portions, setPortions] = useState(initial?.portions?.toString() ?? '1')
  const [frozenDate, setFrozenDate] = useState(initial?.frozenDate ?? todayISO())
  const [expiryDate, setExpiryDate] = useState(initial?.expiryDate ?? '')
  const [note, setNote] = useState(initial?.note ?? '')
  const [errors, setErrors] = useState<Errors>({})
  const [saving, setSaving] = useState(false)

  const clearError = (key: keyof Errors) => setErrors((prev) => ({ ...prev, [key]: undefined }))

  function pickMeal(value: string) {
    setMealId(value)
    const meal = meals.find((m) => m.id === value)
    if (meal) {
      setName(meal.name)
      clearError('name')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const count = Number(portions)
    const found: Errors = {}
    if (!name.trim()) found.name = 'Please enter a name.'
    if (portions.trim() === '' || !Number.isInteger(count) || count < 0) {
      found.portions = 'Portions must be a whole number, 0 or more.'
    }
    if (!isISODate(frozenDate)) found.frozenDate = 'Please enter the date it was frozen.'
    if (!isISODate(expiryDate)) found.expiryDate = 'Please enter the expiry date.'
    else if (!found.frozenDate && compareISO(expiryDate, frozenDate) < 0) {
      found.expiryDate = 'The expiry date cannot be before the frozen date.'
    }
    setErrors(found)
    if (Object.values(found).some(Boolean)) return

    setSaving(true)
    try {
      await onSave({ name, mealId: mealId || undefined, portions: count, frozenDate, expiryDate, note })
    } catch {
      setErrors({ save: 'Could not save the freezer item. Please try again.' })
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
    <form className="form" onSubmit={handleSubmit} noValidate>
      {meals.length > 0 && (
        <div className="field">
          <label htmlFor={`${id}-meal`}>Library meal</label>
          <select id={`${id}-meal`} value={mealId} onChange={(e) => pickMeal(e.target.value)}>
            <option value="">None</option>
            {meals.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="field">
        <label htmlFor={`${id}-name`}>Name</label>
        <input
          id={`${id}-name`}
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            clearError('name')
          }}
          autoComplete="off"
          {...invalidProps('name')}
        />
        {fieldError('name')}
      </div>

      <div className="field">
        <label htmlFor={`${id}-portions`}>Portions</label>
        <input
          id={`${id}-portions`}
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={portions}
          onChange={(e) => {
            setPortions(e.target.value)
            clearError('portions')
          }}
          {...invalidProps('portions')}
        />
        {fieldError('portions')}
      </div>

      <div className="field">
        <label htmlFor={`${id}-frozenDate`}>Frozen on</label>
        <input
          id={`${id}-frozenDate`}
          type="date"
          value={frozenDate}
          onChange={(e) => {
            setFrozenDate(e.target.value)
            clearError('frozenDate')
          }}
          {...invalidProps('frozenDate')}
        />
        {fieldError('frozenDate')}
      </div>

      <div className="field">
        <label htmlFor={`${id}-expiryDate`}>Expiry date</label>
        <input
          id={`${id}-expiryDate`}
          type="date"
          value={expiryDate}
          onChange={(e) => {
            setExpiryDate(e.target.value)
            clearError('expiryDate')
          }}
          {...invalidProps('expiryDate')}
        />
        {fieldError('expiryDate')}
      </div>

      <div className="field">
        <label htmlFor={`${id}-note`}>Note</label>
        <textarea id={`${id}-note`} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>

      {errors.save && (
        <p className="form-error" role="alert">
          {errors.save}
        </p>
      )}
      <div className="actions">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="primary" disabled={saving}>
          Save
        </button>
      </div>
    </form>
  )
}
