import { useEffect, useRef, useState } from 'react'
import type { MealImage } from '../db'
import { useImageUrl } from '../hooks/useImageUrl'
import { IMAGE_KIND_LABELS } from '../logic/images'
import { IDENTITY, panBy, zoomAt, type View } from '../logic/zoom'

const DOUBLE_TAP_MS = 300
const DOUBLE_TAP_SCALE = 2.5
/** Max px between the two taps of a double-tap. */
const DOUBLE_TAP_SLOP = 30
/** Movement in px below which a touch still counts as a tap. */
const TAP_SLOP = 2

interface Props {
  image: MealImage
  label: string
  onClose: () => void
}

/** Full-screen photo with pinch-zoom, drag to pan, double-tap and wheel zoom. */
export default function PhotoViewer({ image, label, onClose }: Props) {
  const url = useImageUrl(image)
  const stage = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View>(IDENTITY)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const lastTap = useRef<{ time: number; x: number; y: number }>(undefined)
  const moved = useRef(false)
  const closeButton = useRef<HTMLButtonElement>(null)

  useEffect(() => closeButton.current?.focus(), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  /** Pointer position relative to the stage, and the stage size. */
  function toStage(e: { clientX: number; clientY: number }) {
    const rect = stage.current!.getBoundingClientRect()
    return { point: { x: e.clientX - rect.left, y: e.clientY - rect.top }, size: rect }
  }

  function onPointerDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture?.(e.pointerId)
    pointers.current.set(e.pointerId, toStage(e).point)
    moved.current = pointers.current.size > 1
  }

  function onPointerMove(e: React.PointerEvent) {
    const previous = pointers.current.get(e.pointerId)
    if (!previous) return
    const { point, size } = toStage(e)
    const others = [...pointers.current].filter(([id]) => id !== e.pointerId).map(([, p]) => p)
    if (Math.hypot(point.x - previous.x, point.y - previous.y) > TAP_SLOP) moved.current = true

    if (others.length === 0) {
      setView((v) => panBy(v, point.x - previous.x, point.y - previous.y, size))
    } else {
      // Pinch with the first other finger: zoom by the change in distance around
      // the midpoint, and pan by how far the midpoint moved.
      const other = others[0]
      const before = Math.hypot(previous.x - other.x, previous.y - other.y)
      const after = Math.hypot(point.x - other.x, point.y - other.y)
      const mid = { x: (point.x + other.x) / 2, y: (point.y + other.y) / 2 }
      const prevMid = { x: (previous.x + other.x) / 2, y: (previous.y + other.y) / 2 }
      setView((v) =>
        panBy(zoomAt(v, before > 0 ? after / before : 1, mid, size), mid.x - prevMid.x, mid.y - prevMid.y, size),
      )
    }
    pointers.current.set(e.pointerId, point)
  }

  function onPointerCancel(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId)
    moved.current = true
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!pointers.current.delete(e.pointerId) || moved.current || pointers.current.size > 0) return
    const { point, size } = toStage(e)
    const tap = lastTap.current
    if (tap && e.timeStamp - tap.time < DOUBLE_TAP_MS && Math.hypot(point.x - tap.x, point.y - tap.y) < DOUBLE_TAP_SLOP) {
      lastTap.current = undefined
      setView((v) => (v.scale > 1 ? IDENTITY : zoomAt(v, DOUBLE_TAP_SCALE, point, size)))
    } else {
      lastTap.current = { time: e.timeStamp, ...point }
    }
  }

  function onWheel(e: React.WheelEvent) {
    const { point, size } = toStage(e)
    setView((v) => zoomAt(v, Math.exp(-e.deltaY / 300), point, size))
  }

  return (
    <div className="photo-viewer" role="dialog" aria-modal="true" aria-label={label}>
      <div className="photo-viewer-bar">
        <span>{IMAGE_KIND_LABELS[image.kind]}</span>
        <button ref={closeButton} type="button" onClick={onClose}>
          ✕ Close
        </button>
      </div>
      <div
        ref={stage}
        className="photo-viewer-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onWheel={onWheel}
      >
        {url && (
          <img
            src={url}
            alt={label}
            draggable={false}
            style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
          />
        )}
      </div>
    </div>
  )
}
