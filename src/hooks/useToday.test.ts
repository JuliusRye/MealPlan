import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useToday } from './useToday'

afterEach(() => {
  vi.useRealTimers()
})

describe('useToday', () => {
  it('rolls over to the next day at local midnight', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 24, 23, 59))
    const { result } = renderHook(() => useToday())
    expect(result.current).toBe('2026-10-24')

    act(() => vi.advanceTimersByTime(2 * 60 * 1000))
    expect(result.current).toBe('2026-10-25')

    // 25 Oct 2026 is 25 hours long in the test zone (DST ends).
    act(() => vi.advanceTimersByTime(25 * 60 * 60 * 1000))
    expect(result.current).toBe('2026-10-26')
  })
})
