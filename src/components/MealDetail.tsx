import { useState } from 'react'
import type { Meal } from '../db'
import { safeHref } from '../logic/meals'
import MealMeta from './MealMeta'

interface Props {
  meal: Meal
  onBack: () => void
  onEdit: () => void
  onDelete: () => Promise<void>
}

export default function MealDetail({ meal, onBack, onEdit, onDelete }: Props) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string>()
  const href = safeHref(meal.link)

  async function handleDelete() {
    setDeleting(true)
    try {
      await onDelete()
    } catch {
      setError('Could not delete the meal.')
      setDeleting(false)
    }
  }

  return (
    <section className="screen">
      <div className="toolbar">
        <button type="button" onClick={onBack}>
          ← Back
        </button>
        <button type="button" onClick={onEdit}>
          Edit
        </button>
      </div>

      <h1>{meal.name}</h1>
      <MealMeta meal={meal} as="p" />

      <dl className="details">
        {meal.notes && (
          <>
            <dt>Notes</dt>
            <dd className="notes">{meal.notes}</dd>
          </>
        )}
        {meal.link && (
          <>
            <dt>Recipe link</dt>
            <dd>
              {href ? (
                <a href={href} target="_blank" rel="noopener noreferrer">
                  {meal.link}
                </a>
              ) : (
                meal.link
              )}
            </dd>
          </>
        )}
        {meal.source && (
          <>
            <dt>Source</dt>
            <dd>{meal.source}</dd>
          </>
        )}
      </dl>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        {confirming ? (
          <>
            <button type="button" onClick={() => setConfirming(false)}>
              Cancel
            </button>
            <button type="button" className="danger" disabled={deleting} onClick={handleDelete}>
              Confirm delete
            </button>
          </>
        ) : (
          <button type="button" className="danger-outline" onClick={() => setConfirming(true)}>
            Delete
          </button>
        )}
      </div>
    </section>
  )
}
