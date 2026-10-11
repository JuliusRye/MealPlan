import { describe, expect, it } from 'vitest'
import { IDENTITY, MAX_SCALE, panBy, zoomAt } from './zoom'

const size = { width: 400, height: 800 }

describe('zoomAt', () => {
  it('keeps the point under the fingers in place', () => {
    expect(zoomAt(IDENTITY, 2, { x: 200, y: 400 }, size)).toEqual({ scale: 2, x: -200, y: -400 })
    expect(zoomAt(IDENTITY, 2, { x: 100, y: 100 }, size)).toEqual({ scale: 2, x: -100, y: -100 })
  })

  it('zooms between 1× and the max', () => {
    expect(zoomAt(IDENTITY, 100, { x: 0, y: 0 }, size).scale).toBe(MAX_SCALE)
    expect(zoomAt({ scale: 2, x: -200, y: -400 }, 0.1, { x: 50, y: 50 }, size)).toEqual(IDENTITY)
  })

  it('never shows space beyond the image edges', () => {
    // Zooming at the bottom-right corner, then zooming out at the top-left.
    const zoomed = zoomAt(IDENTITY, 2, { x: 400, y: 800 }, size)
    expect(zoomed).toEqual({ scale: 2, x: -400, y: -800 })
    expect(zoomAt(zoomed, 0.75, { x: 0, y: 0 }, size)).toEqual({ scale: 1.5, x: -200, y: -400 })
  })
})

describe('panBy', () => {
  it('moves the zoomed image, stopping at its edges', () => {
    const view = { scale: 2, x: -200, y: -400 }
    expect(panBy(view, 50, -30, size)).toEqual({ scale: 2, x: -150, y: -430 })
    expect(panBy(view, 500, -5000, size)).toEqual({ scale: 2, x: 0, y: -800 })
  })

  it('does not move an image that is not zoomed', () => {
    expect(panBy(IDENTITY, 50, 50, size)).toEqual(IDENTITY)
  })
})
