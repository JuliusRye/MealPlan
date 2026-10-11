import { useState } from 'react'

interface Props {
  onDelete: () => Promise<void>
  /** Shown if `onDelete` fails, e.g. "Could not delete the freezer item." */
  errorMessage: string
}

/** A Delete button that asks for confirmation before calling `onDelete`. */
export default function ConfirmDelete({ onDelete, errorMessage }: Props) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string>()

  async function handleDelete() {
    setDeleting(true)
    try {
      await onDelete()
    } catch {
      setError(errorMessage)
      setDeleting(false)
    }
  }

  return (
    <>
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
    </>
  )
}
