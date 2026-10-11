import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import MealDetail from '../components/MealDetail'
import MealForm from '../components/MealForm'
import MealMeta from '../components/MealMeta'
import { db } from '../db'
import { createMeal, deleteMeal, searchMeals, updateMeal } from '../logic/meals'

type Screen =
  | { kind: 'list' }
  | { kind: 'new' }
  | { kind: 'detail'; id: string }
  | { kind: 'edit'; id: string }

export default function MealsView() {
  const meals = useLiveQuery(() => db.meals.toArray())
  const [screen, setScreen] = useState<Screen>({ kind: 'list' })
  const [query, setQuery] = useState('')
  const toList = () => setScreen({ kind: 'list' })

  if (screen.kind === 'new') {
    return (
      <section className="screen">
        <h1>New meal</h1>
        <MealForm
          onSave={async (input) => {
            await createMeal(input)
            toList()
          }}
          onCancel={toList}
        />
      </section>
    )
  }

  const current = screen.kind !== 'list' ? meals?.find((m) => m.id === screen.id) : undefined

  if (screen.kind === 'edit' && current) {
    const toDetail = () => setScreen({ kind: 'detail', id: current.id })
    return (
      <section className="screen">
        <h1>Edit meal</h1>
        <MealForm
          initial={current}
          onSave={async (input) => {
            await updateMeal(current.id, input)
            toDetail()
          }}
          onCancel={toDetail}
        />
      </section>
    )
  }

  if (screen.kind === 'detail' && current) {
    return (
      <MealDetail
        meal={current}
        onBack={toList}
        onEdit={() => setScreen({ kind: 'edit', id: current.id })}
        onDelete={async () => {
          await deleteMeal(current.id)
          toList()
        }}
      />
    )
  }

  const results = searchMeals(meals ?? [], query)
  return (
    <section className="screen">
      <div className="screen-header">
        <h1>Meals</h1>
        <button type="button" className="primary" onClick={() => setScreen({ kind: 'new' })}>
          + Add meal
        </button>
      </div>

      {!meals ? null : meals.length === 0 ? (
        <p className="placeholder">No meals yet. Add the dinners you make so you can plan them later.</p>
      ) : (
        <>
          <input
            type="search"
            className="search"
            aria-label="Search meals"
            placeholder="Search meals"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {results.length === 0 ? (
            <p className="placeholder">No meals match “{query.trim()}”.</p>
          ) : (
            <ul className="meal-list">
              {results.map((meal) => (
                <li key={meal.id}>
                  <button
                    type="button"
                    className="meal-row"
                    onClick={() => setScreen({ kind: 'detail', id: meal.id })}
                  >
                    <span className="meal-name">{meal.name}</span>
                    <MealMeta meal={meal} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}
