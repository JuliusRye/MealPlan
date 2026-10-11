import { useEffect, useState } from 'react'
import type { MealImage } from '../db'

/**
 * An object URL for the image's blob, revoked on unmount or when the image
 * changes. Keyed by id: live queries return a new Blob object on every read,
 * but an image's blob never changes, so this avoids needless new URLs.
 */
export function useImageUrl(image: MealImage | undefined): string | undefined {
  const [current, setCurrent] = useState<{ id: string; url: string }>()
  const id = image?.id
  useEffect(() => {
    if (!image) return
    const url = URL.createObjectURL(image.blob)
    // The object URL is an external resource; state only mirrors it.
    // oxlint-disable-next-line react/set-state-in-effect
    setCurrent({ id: image.id, url })
    return () => URL.revokeObjectURL(url)
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- keyed by id, see above
  }, [id])
  return current && current.id === id ? current.url : undefined
}
