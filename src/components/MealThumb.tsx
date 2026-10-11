import type { MealImage } from '../db'
import { useImageUrl } from '../hooks/useImageUrl'

/** Small square photo for a list row; a plate placeholder when there is none. */
export default function MealThumb({ image }: { image: MealImage | undefined }) {
  const url = useImageUrl(image)
  return (
    <span className="meal-thumb" aria-hidden="true">
      {url ? <img src={url} alt="" loading="lazy" decoding="async" /> : '🍽'}
    </span>
  )
}
