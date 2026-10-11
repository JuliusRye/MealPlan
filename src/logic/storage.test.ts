import { describe, expect, it, vi } from 'vitest'
import { requestPersistentStorage } from './storage'

function fakeStorage(persisted: boolean, grant = true) {
  return { persisted: vi.fn(async () => persisted), persist: vi.fn(async () => grant) }
}

describe('requestPersistentStorage', () => {
  it('asks for persistence when not yet granted', async () => {
    const storage = fakeStorage(false)
    expect(await requestPersistentStorage(storage)).toBe(true)
    expect(storage.persist).toHaveBeenCalledOnce()
  })

  it('does not ask again once persistence is granted', async () => {
    const storage = fakeStorage(true)
    expect(await requestPersistentStorage(storage)).toBe(true)
    expect(storage.persist).not.toHaveBeenCalled()
  })

  it('reports a refusal', async () => {
    expect(await requestPersistentStorage(fakeStorage(false, false))).toBe(false)
  })

  it('is a no-op when the Storage API is unavailable', async () => {
    expect(await requestPersistentStorage(undefined)).toBe(false)
  })
})
