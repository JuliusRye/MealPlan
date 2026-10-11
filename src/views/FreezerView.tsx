import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import ConfirmDelete from '../components/ConfirmDelete'
import FreezerItemForm from '../components/FreezerItemForm'
import { db, type FreezerItem } from '../db'
import { useToday } from '../hooks/useToday'
import { fromISODate, type ISODate } from '../logic/dates'
import {
  adjustPortions,
  createFreezerItem,
  deleteFreezerItem,
  expiryLabel,
  expiryStatus,
  isInStock,
  splitFreezer,
  updateFreezerItem,
} from '../logic/freezer'
import { searchMeals } from '../logic/meals'

type Screen = { kind: 'list' } | { kind: 'new' } | { kind: 'edit'; id: string }

const formatDate = (date: ISODate) =>
  fromISODate(date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

export default function FreezerView() {
  const items = useLiveQuery(() => db.freezer.toArray())
  const meals = useLiveQuery(async () => searchMeals(await db.meals.toArray(), ''))
  const [screen, setScreen] = useState<Screen>({ kind: 'list' })
  const toList = () => setScreen({ kind: 'list' })
  const today = useToday()

  if (screen.kind === 'new' && meals) {
    return (
      <section className="screen">
        <h1>Add to freezer</h1>
        <FreezerItemForm
          meals={meals}
          onSave={async (input) => {
            await createFreezerItem(input)
            toList()
          }}
          onCancel={toList}
        />
      </section>
    )
  }

  const current = screen.kind === 'edit' ? items?.find((i) => i.id === screen.id) : undefined
  if (current && meals) {
    return (
      <section className="screen">
        <h1>Edit freezer item</h1>
        <FreezerItemForm
          initial={current}
          meals={meals}
          onSave={async (input) => {
            await updateFreezerItem(current.id, input)
            toList()
          }}
          onCancel={toList}
        />
        <ConfirmDelete
          errorMessage="Could not delete the freezer item."
          onDelete={async () => {
            await deleteFreezerItem(current.id)
            toList()
          }}
        />
      </section>
    )
  }

  const { inStock, usedUp } = splitFreezer(items ?? [])
  const row = (item: FreezerItem) => (
    <FreezerRow key={item.id} item={item} today={today} onEdit={() => setScreen({ kind: 'edit', id: item.id })} />
  )
  return (
    <section className="screen">
      <div className="screen-header">
        <h1>Freezer</h1>
        <button type="button" className="primary" onClick={() => setScreen({ kind: 'new' })}>
          + Add item
        </button>
      </div>

      {!items ? null : inStock.length === 0 ? (
        <p className="placeholder">
          {usedUp.length === 0 ? 'The freezer is empty. Add leftovers so you can plan them later.' : 'Nothing left in the freezer.'}
        </p>
      ) : (
        <ul className="freezer-list" aria-label="In the freezer">
          {inStock.map(row)}
        </ul>
      )}

      {usedUp.length > 0 && (
        <section className="freezer-used-up" aria-labelledby="freezer-used-up">
          <h2 id="freezer-used-up">Used up</h2>
          <ul className="freezer-list" aria-label="Used up">
            {usedUp.map(row)}
          </ul>
        </section>
      )}
    </section>
  )
}

function FreezerRow({ item, today, onEdit }: { item: FreezerItem; today: ISODate; onEdit: () => void }) {
  const usedUp = !isInStock(item)
  const label = usedUp ? undefined : expiryLabel(item, today)
  const status = expiryStatus(item, today)
  const adjust = (delta: number) =>
    adjustPortions(item.id, delta).catch((error: unknown) => console.error('Could not change portions', error))
  return (
    <li className="freezer-row">
      <button type="button" className="freezer-row-main" onClick={onEdit}>
        <span className="meal-name">{item.name}</span>
        <span className="freezer-row-meta">
          <span>Expires {formatDate(item.expiryDate)}</span>
          {label && <span className={`chip chip-${status}`}>{label}</span>}
        </span>
      </button>
      <div className="stepper" role="group" aria-label={`Portions of ${item.name}`}>
        <button
          type="button"
          aria-label={`Remove a portion of ${item.name}`}
          disabled={usedUp}
          onClick={() => adjust(-1)}
        >
          −
        </button>
        <span className="stepper-value">
          {item.portions}
          <span className="visually-hidden"> portions</span>
        </span>
        <button type="button" aria-label={`Add a portion of ${item.name}`} onClick={() => adjust(1)}>
          +
        </button>
      </div>
    </li>
  )
}
