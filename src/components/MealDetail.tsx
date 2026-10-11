import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useState } from 'react'
import type { Meal } from '../db'
import { useToday } from '../hooks/useToday'
import { formatDayLong } from '../logic/dates'
import { safeHref } from '../logic/meals'
import { mealPlanStats, planEntriesForMeal } from '../logic/plan'
import MealGallery from './MealGallery'
import MealMeta from './MealMeta'
import PlanEntrySheet from './PlanEntrySheet'

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
  const [planning, setPlanning] = useState(false)
  const closePlanning = useCallback(() => setPlanning(false), [])
  const today = useToday()
  const stats = useLiveQuery(async () => mealPlanStats(await planEntriesForMeal(meal.id), today), [meal.id, today])
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
        <div className="toolbar-actions">
          <button type="button" onClick={onEdit}>
            Edit
          </button>
          <button type="button" className="primary" onClick={() => setPlanning(true)}>
            Plan this
          </button>
        </div>
      </div>

      <h1>{meal.name}</h1>
      <MealMeta meal={meal} as="p" />

      <dl className="details">
        {stats && (
          <>
            <dt>Times planned</dt>
            <dd>{stats.timesPlanned || 'Not planned yet'}</dd>
          </>
        )}
        {stats?.lastPlanned && (
          <>
            <dt>Last planned</dt>
            <dd>{formatDayLong(stats.lastPlanned)}</dd>
          </>
        )}
        {stats?.nextPlanned && (
          <>
            <dt>Next planned</dt>
            <dd>{formatDayLong(stats.nextPlanned)}</dd>
          </>
        )}
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

      <MealGallery mealId={meal.id} />

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

      {planning && <PlanEntrySheet meal={meal} startDate={today} onClose={closePlanning} />}
    </section>
  )
}
