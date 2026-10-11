import { useId, useState } from 'react'
import type { Difficulty, Meal } from '../db'
import { DIFFICULTY_LABELS, type MealInput } from '../logic/meals'

const DIFFICULTIES: { value: Difficulty | ''; label: string }[] = [
  { value: '', label: 'Not set' },
  ...Object.entries(DIFFICULTY_LABELS).map(([value, label]) => ({ value: value as Difficulty, label })),
]

interface Errors {
  name?: string
  prepMinutes?: string
  save?: string
}

interface Props {
  initial?: Meal
  onSave: (input: MealInput) => Promise<void>
  onCancel: () => void
}

/** Create/edit form for a library meal. Only the name is required. */
export default function MealForm({ initial, onSave, onCancel }: Props) {
  const id = useId()
  const [name, setName] = useState(initial?.name ?? '')
  const [prepMinutes, setPrepMinutes] = useState(initial?.prepMinutes?.toString() ?? '')
  const [difficulty, setDifficulty] = useState<Difficulty | ''>(initial?.difficulty ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [link, setLink] = useState(initial?.link ?? '')
  const [source, setSource] = useState(initial?.source ?? '')
  const [errors, setErrors] = useState<Errors>({})
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const minutes = prepMinutes.trim() === '' ? undefined : Number(prepMinutes)
    const found: Errors = {}
    if (!name.trim()) found.name = 'Please enter a name.'
    if (minutes !== undefined && !(Number.isFinite(minutes) && minutes >= 0)) {
      found.prepMinutes = 'Prep time must be a whole number of minutes, 0 or more.'
    }
    setErrors(found)
    if (found.name || found.prepMinutes) return

    setSaving(true)
    try {
      await onSave({
        name,
        prepMinutes: minutes,
        difficulty: difficulty || undefined,
        notes,
        link,
        source,
      })
    } catch {
      setErrors({ save: 'Could not save the meal. Please try again.' })
      setSaving(false)
    }
  }

  return (
    <form className="form" onSubmit={handleSubmit} noValidate>
      <div className="field">
        <label htmlFor={`${id}-name`}>Name</label>
        <input
          id={`${id}-name`}
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setErrors((prev) => ({ ...prev, name: undefined }))
          }}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? `${id}-name-error` : undefined}
          autoComplete="off"
        />
        {errors.name && (
          <p id={`${id}-name-error`} className="field-error" role="alert">
            {errors.name}
          </p>
        )}
      </div>

      <div className="field">
        <label htmlFor={`${id}-prep`}>Prep time (minutes)</label>
        <input
          id={`${id}-prep`}
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={prepMinutes}
          onChange={(e) => {
            setPrepMinutes(e.target.value)
            setErrors((prev) => ({ ...prev, prepMinutes: undefined }))
          }}
          aria-invalid={errors.prepMinutes ? true : undefined}
          aria-describedby={errors.prepMinutes ? `${id}-prep-error` : undefined}
        />
        {errors.prepMinutes && (
          <p id={`${id}-prep-error`} className="field-error" role="alert">
            {errors.prepMinutes}
          </p>
        )}
      </div>

      <fieldset className="field">
        <legend>Difficulty</legend>
        <div className="segmented">
          {DIFFICULTIES.map(({ value, label }) => (
            <label key={value || 'none'}>
              <input
                type="radio"
                name={`${id}-difficulty`}
                value={value}
                checked={difficulty === value}
                onChange={() => setDifficulty(value)}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="field">
        <label htmlFor={`${id}-notes`}>Notes</label>
        <textarea id={`${id}-notes`} rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div className="field">
        <label htmlFor={`${id}-link`}>Recipe link</label>
        <input
          id={`${id}-link`}
          type="url"
          inputMode="url"
          placeholder="https://…"
          value={link}
          onChange={(e) => setLink(e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor={`${id}-source`}>Source</label>
        <input
          id={`${id}-source`}
          placeholder="e.g. Jamie's 30-Minute Meals, p. 112"
          value={source}
          onChange={(e) => setSource(e.target.value)}
        />
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
