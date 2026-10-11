import { afterEach, describe, expect, it, vi } from 'vitest'
import { parse } from 'yaml'
import { db, newId } from '../db'
import {
  backupFilename,
  blobToBase64,
  exportBackup,
  formatBytes,
  needsBackupReminder,
  readLastExport,
  shareOrDownload,
  writeLastExport,
} from './backup'

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

const now = new Date(2026, 9, 11, 12, 30)

async function seed() {
  const mealId = newId()
  await db.meals.add({ id: mealId, name: 'Lasagna', difficulty: 'hard', createdAt: 1, updatedAt: 2 })
  await db.mealImages.add({
    id: newId(), mealId, blob: new Blob([new Uint8Array([0, 1, 2, 250, 255])], { type: 'image/webp' }),
    kind: 'result', order: 0, createdAt: 3,
  })
  await db.plan.add({ id: newId(), startDate: '2026-10-12', endDate: '2026-10-13', title: 'Lasagna', mealId })
  await db.freezer.add({ id: newId(), name: 'Soup', portions: 2, frozenDate: '2026-09-01', expiryDate: '2027-01-01' })
  return mealId
}

describe('exportBackup', () => {
  it('serialises every table to YAML with images as base64 + mimeType', async () => {
    const mealId = await seed()
    const file = await exportBackup(now)

    expect(file.name).toBe('mealplan-backup-2026-10-11.yaml')
    expect(file.type).toBe('application/yaml')

    const doc = parse(await file.text())
    expect(doc.version).toBe(1)
    expect(doc.exportedAt).toBe(now.toISOString())
    expect(doc.meals).toEqual([{ id: mealId, name: 'Lasagna', difficulty: 'hard', createdAt: 1, updatedAt: 2 }])
    expect(doc.mealImages).toEqual([
      expect.objectContaining({ mealId, kind: 'result', order: 0, createdAt: 3, mimeType: 'image/webp', data: 'AAEC+v8=' }),
    ])
    expect(doc.mealImages[0]).not.toHaveProperty('blob')
    expect(doc.plan).toEqual([expect.objectContaining({ title: 'Lasagna', startDate: '2026-10-12', endDate: '2026-10-13' })])
    expect(doc.freezer).toEqual([expect.objectContaining({ name: 'Soup', portions: 2, expiryDate: '2027-01-01' })])
  })

  it('exports empty tables as empty lists', async () => {
    const doc = parse(await (await exportBackup(now)).text())
    expect(doc).toMatchObject({ version: 1, meals: [], mealImages: [], plan: [], freezer: [] })
  })
})

describe('blobToBase64', () => {
  it('encodes binary data larger than one chunk', async () => {
    const bytes = new Uint8Array(100_000).map((_, i) => i % 256)
    const encoded = await blobToBase64(new Blob([bytes]))
    expect(Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0))).toEqual(bytes)
  })
})

describe('backupFilename', () => {
  it('uses the local date', () => {
    expect(backupFilename(new Date(2026, 0, 1, 0, 30))).toBe('mealplan-backup-2026-01-01.yaml')
  })
})

describe('formatBytes', () => {
  it.each([
    [512, '512 B'],
    [2048, '2.0 KB'],
    [5.5 * 1024 * 1024, '5.5 MB'],
  ])('%d → %s', (bytes, text) => {
    expect(formatBytes(bytes)).toBe(text)
  })
})

describe('needsBackupReminder', () => {
  it('reminds when there has never been an export', () => {
    expect(needsBackupReminder(null, '2026-10-11')).toBe(true)
  })

  it('does not remind up to 30 days after an export', () => {
    expect(needsBackupReminder('2026-09-11', '2026-10-11')).toBe(false)
  })

  it('reminds more than 30 days after an export', () => {
    expect(needsBackupReminder('2026-09-10', '2026-10-11')).toBe(true)
  })
})

describe('last export date', () => {
  it('round-trips through storage', () => {
    const storage = new Map<string, string>()
    const fake = { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => void storage.set(k, v) }
    expect(readLastExport(fake)).toBeNull()
    writeLastExport('2026-10-11', fake)
    expect(readLastExport(fake)).toBe('2026-10-11')
  })

  it('ignores a corrupt value', () => {
    expect(readLastExport({ getItem: () => 'garbage', setItem: () => {} })).toBeNull()
  })
})

describe('shareOrDownload', () => {
  const file = new File(['x'], 'mealplan-backup-2026-10-11.yaml', { type: 'application/yaml' })

  it('uses the share sheet when files can be shared', async () => {
    const share = vi.fn(async () => {})
    const download = vi.fn()
    expect(await shareOrDownload(file, { canShare: () => true, share }, download)).toBe('shared')
    expect(share).toHaveBeenCalledWith({ files: [file], title: file.name })
    expect(download).not.toHaveBeenCalled()
  })

  it('downloads when sharing files is unsupported', async () => {
    const download = vi.fn()
    expect(await shareOrDownload(file, { canShare: () => false, share: vi.fn() }, download)).toBe('downloaded')
    expect(await shareOrDownload(file, {}, download)).toBe('downloaded')
    expect(download).toHaveBeenCalledTimes(2)
  })

  it('reports a cancelled share without downloading', async () => {
    const share = vi.fn(async () => {
      throw new DOMException('cancelled', 'AbortError')
    })
    const download = vi.fn()
    expect(await shareOrDownload(file, { canShare: () => true, share }, download)).toBe('cancelled')
    expect(download).not.toHaveBeenCalled()
  })

  it('falls back to a download when sharing fails', async () => {
    // e.g. NotAllowedError once the tap's user activation has expired.
    const share = vi.fn(async () => {
      throw new DOMException('no activation', 'NotAllowedError')
    })
    const download = vi.fn()
    expect(await shareOrDownload(file, { canShare: () => true, share }, download)).toBe('downloaded')
    expect(download).toHaveBeenCalledWith(file)
  })
})
