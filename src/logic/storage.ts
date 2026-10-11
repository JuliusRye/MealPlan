type PersistableStorage = Pick<StorageManager, 'persisted' | 'persist'>

/**
 * Ask the browser not to evict our IndexedDB data. All data lives only on
 * the device, so eviction would mean data loss.
 */
export async function requestPersistentStorage(
  storage: PersistableStorage | undefined = globalThis.navigator?.storage,
): Promise<boolean> {
  if (!storage?.persist || !storage.persisted) return false
  if (await storage.persisted()) return true
  return storage.persist()
}
