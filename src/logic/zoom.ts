/**
 * Pan/zoom state for an image shown at `transform: translate(x, y) scale(scale)`
 * with `transform-origin: 0 0` inside a box of `Size`. Coordinates are in px
 * relative to the box.
 */
export interface View {
  scale: number
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

export const IDENTITY: View = { scale: 1, x: 0, y: 0 }
export const MAX_SCALE = 5

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** Keep the scaled image covering the box, so no space shows beyond its edges. */
function contain({ scale, x, y }: View, size: Size): View {
  // `+ 0` turns -0 into 0.
  return {
    scale,
    x: clamp(x, size.width * (1 - scale), 0) + 0,
    y: clamp(y, size.height * (1 - scale), 0) + 0,
  }
}

/** Zoom by `factor`, keeping `point` (e.g. the pinch centre) fixed on screen. */
export function zoomAt(view: View, factor: number, point: { x: number; y: number }, size: Size): View {
  const scale = clamp(view.scale * factor, 1, MAX_SCALE)
  const ratio = scale / view.scale
  return contain(
    { scale, x: point.x - (point.x - view.x) * ratio, y: point.y - (point.y - view.y) * ratio },
    size,
  )
}

export function panBy(view: View, dx: number, dy: number, size: Size): View {
  return contain({ ...view, x: view.x + dx, y: view.y + dy }, size)
}
