import { describe, expect, it } from 'vitest'
import { fitWithin } from './resizeImage'

describe('fitWithin', () => {
  it('scales the long edge down to the max, keeping the aspect ratio', () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 })
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 })
    expect(fitWithin(4032, 1816, 1600)).toEqual({ width: 1600, height: 721 })
  })

  it('leaves images that already fit unchanged', () => {
    expect(fitWithin(1600, 900, 1600)).toEqual({ width: 1600, height: 900 })
    expect(fitWithin(640, 480, 1600)).toEqual({ width: 640, height: 480 })
  })
})
