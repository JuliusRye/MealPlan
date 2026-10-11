import { useLiveQuery } from 'dexie-react-hooks'
import { useId, useState } from 'react'
import type { MealImage } from '../db'
import { useImageUrl } from '../hooks/useImageUrl'
import {
  addMealImages,
  getMealImages,
  IMAGE_KIND_LABELS,
  moveImage,
  removeImage,
  setImageKind,
  type ImageKind,
} from '../logic/images'
import { resizeImage } from '../logic/resizeImage'
import PhotoViewer from './PhotoViewer'

const ADD_BUTTONS: { kind: ImageKind; label: string }[] = [
  { kind: 'recipe', label: 'Add recipe page' },
  { kind: 'result', label: 'Add dish photo' },
]

const photoLabel = (index: number, total: number) => `Photo ${index + 1} of ${total}`

/** A meal's photos: add, mark as recipe page / finished dish, reorder, remove, view full screen. */
export default function MealGallery({ mealId }: { mealId: string }) {
  const id = useId()
  const images = useLiveQuery(() => getMealImages(mealId), [mealId])
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string>()
  const [viewing, setViewing] = useState<string>()

  async function handleFiles(input: HTMLInputElement, kind: ImageKind) {
    const files = [...(input.files ?? [])]
    input.value = ''
    if (files.length === 0) return
    setAdding(true)
    setError(undefined)
    // One at a time: decoding several 12 MP photos at once can exhaust a phone's memory.
    const blobs: Blob[] = []
    for (const file of files) {
      try {
        blobs.push(await resizeImage(file))
      } catch {
        // Counted below.
      }
    }
    const failed = files.length - blobs.length
    try {
      await addMealImages(mealId, blobs.map((blob) => ({ blob, kind })))
      if (failed > 0) {
        setError(failed === 1 ? 'One photo could not be read.' : `${failed} photos could not be read.`)
      }
    } catch {
      setError('Could not save the photos. The device may be out of storage.')
    } finally {
      setAdding(false)
    }
  }

  const viewed = images?.findIndex((i) => i.id === viewing) ?? -1

  return (
    <section className="gallery" aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`}>Photos</h2>
      {images && images.length > 0 && (
        <ol className="gallery-list">
          {images.map((image, index) => (
            <GalleryItem
              key={image.id}
              image={image}
              label={photoLabel(index, images.length)}
              isFirst={index === 0}
              isLast={index === images.length - 1}
              onView={() => setViewing(image.id)}
            />
          ))}
        </ol>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="gallery-add">
        {ADD_BUTTONS.map(({ kind, label }) => (
          <label key={kind} className="file-button" aria-disabled={adding || undefined}>
            <input
              type="file"
              accept="image/*"
              multiple
              disabled={adding}
              aria-label={label}
              onChange={(e) => handleFiles(e.currentTarget, kind)}
            />
            <span aria-hidden="true">{adding ? 'Adding…' : `+ ${label}`}</span>
          </label>
        ))}
      </div>
      {images && viewed >= 0 && (
        <PhotoViewer
          image={images[viewed]}
          label={photoLabel(viewed, images.length)}
          onClose={() => setViewing(undefined)}
        />
      )}
    </section>
  )
}

interface ItemProps {
  image: MealImage
  label: string
  isFirst: boolean
  isLast: boolean
  onView: () => void
}

function GalleryItem({ image, label, isFirst, isLast, onView }: ItemProps) {
  const id = useId()
  const url = useImageUrl(image)
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  return (
    <li className="gallery-item">
      <button type="button" className="gallery-thumb" onClick={onView} aria-label={`View ${label} full screen`}>
        {url && <img src={url} alt={label} />}
      </button>
      <div className="gallery-controls">
        <div className="segmented segmented-2" role="radiogroup" aria-label={`${label} shows`}>
          {(Object.keys(IMAGE_KIND_LABELS) as ImageKind[]).map((kind) => (
            <label key={kind}>
              <input
                type="radio"
                name={`${id}-kind`}
                checked={image.kind === kind}
                onChange={() => setImageKind(image.id, kind)}
              />
              <span>{IMAGE_KIND_LABELS[kind]}</span>
            </label>
          ))}
        </div>
        <div className="gallery-buttons">
          {confirmingRemove ? (
            // The move buttons step aside so Keep / Remove fit on a narrow phone.
            <>
              <button
                type="button"
                className="push-right"
                onClick={() => setConfirmingRemove(false)}
                aria-label={`Cancel removing ${label}`}
              >
                Keep
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => removeImage(image.id)}
                aria-label={`Confirm removing ${label}`}
              >
                Remove
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={isFirst}
                onClick={() => moveImage(image.id, -1)}
                aria-label={`Move ${label} earlier`}
              >
                ↑
              </button>
              <button
                type="button"
                disabled={isLast}
                onClick={() => moveImage(image.id, 1)}
                aria-label={`Move ${label} later`}
              >
                ↓
              </button>
              <button
                type="button"
                className="danger-outline push-right"
                onClick={() => setConfirmingRemove(true)}
                aria-label={`Remove ${label}`}
              >
                Remove
              </button>
            </>
          )}
        </div>
      </div>
    </li>
  )
}
