import type { Difficulty } from '../db'
import { DIFFICULTY_LABELS } from '../logic/meals'

export default function DifficultyChip({ difficulty }: { difficulty: Difficulty }) {
  return <span className={`chip chip-${difficulty}`}>{DIFFICULTY_LABELS[difficulty]}</span>
}
