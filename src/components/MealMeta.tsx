import type { Meal } from '../db'
import { formatMinutes } from '../logic/meals'
import DifficultyChip from './DifficultyChip'

/** ⏱ prep time and difficulty chip, each only when set. */
export default function MealMeta({ meal, as: Tag = 'span' }: { meal: Meal; as?: 'span' | 'p' }) {
  if (meal.prepMinutes === undefined && !meal.difficulty) return null
  return (
    <Tag className="meal-meta">
      {meal.prepMinutes !== undefined && <span>⏱ {formatMinutes(meal.prepMinutes)}</span>}
      {meal.difficulty && <DifficultyChip difficulty={meal.difficulty} />}
    </Tag>
  )
}
