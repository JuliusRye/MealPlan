import { afterEach, describe, expect, it, vi } from 'vitest'
import { parse, stringify } from 'yaml'
import { db, newId } from '../db'
import {
  backupFilename,
  BackupError,
  blobToBase64,
  exportBackup,
  formatBytes,
  needsBackupReminder,
  readBackup,
  readLastExport,
  restoreBackup,
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

async function snapshot() {
  return {
    meals: await db.meals.toArray(),
    mealImages: await db.mealImages.toArray(),
    plan: await db.plan.toArray(),
    freezer: await db.freezer.toArray(),
  }
}

function yamlFile(doc: unknown) {
  return new File([stringify(doc)], 'backup.yaml')
}

/** A valid backup document with nothing in it, to break one piece at a time. */
function emptyBackup() {
  return { version: 1, exportedAt: now.toISOString(), meals: [], mealImages: [], plan: [], freezer: [] }
}

describe('readBackup + restoreBackup', () => {
  it('round-trips an export, restoring every table and image bytes', async () => {
    await seed()
    const before = await snapshot()
    const beforeBytes = new Uint8Array(await before.mealImages[0].blob.arrayBuffer())
    const file = await exportBackup(now)

    await Promise.all(db.tables.map((t) => t.clear()))
    await db.meals.add({ id: newId(), name: 'Leftover', createdAt: 9, updatedAt: 9 })

    const backup = await readBackup(file)
    await restoreBackup(backup)

    const after = await snapshot()
    expect(after.meals).toEqual(before.meals)
    expect(after.plan).toEqual(before.plan)
    expect(after.freezer).toEqual(before.freezer)
    const withoutBlob = (images: typeof before.mealImages) => images.map((image) => ({ ...image, blob: null }))
    expect(withoutBlob(after.mealImages)).toEqual(withoutBlob(before.mealImages))
    const blob = after.mealImages[0].blob
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('image/webp')
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(beforeBytes)
  })

  it('summarises what the backup contains', async () => {
    await seed()
    const backup = await readBackup(await exportBackup(now))
    expect(backup.exportedAt).toBe(now.toISOString())
    expect([backup.meals.length, backup.mealImages.length, backup.plan.length, backup.freezer.length]).toEqual([1, 1, 1, 1])
  })

  it('restores an empty backup by emptying every table', async () => {
    await seed()
    await restoreBackup(await readBackup(yamlFile(emptyBackup())))
    expect(await snapshot()).toEqual({ meals: [], mealImages: [], plan: [], freezer: [] })
  })

  it('leaves existing data untouched if writing fails part-way', async () => {
    await seed()
    const before = await snapshot()
    const meal = { id: 'same', name: 'Twice', createdAt: 1, updatedAt: 1 }
    const backup = await readBackup(yamlFile({ ...emptyBackup(), meals: [meal, meal] }))

    await expect(restoreBackup(backup)).rejects.toThrow()
    expect(await snapshot()).toEqual(before)
  })
})

describe('readBackup rejects invalid files', () => {
  async function rejection(file: File) {
    const error = await readBackup(file).then(() => undefined, (e: unknown) => e)
    expect(error).toBeInstanceOf(BackupError)
    return (error as BackupError).message
  }

  it('rejects malformed YAML', async () => {
    expect(await rejection(new File(['meals: [unclosed'], 'x.yaml'))).toMatch(/not a valid mealplan backup/i)
  })

  it('rejects a file that is not a backup document', async () => {
    expect(await rejection(new File(['just some text'], 'x.txt'))).toMatch(/not a valid mealplan backup/i)
    expect(await rejection(new File([''], 'x.yaml'))).toMatch(/not a valid mealplan backup/i)
  })

  it('rejects a missing or unknown version', async () => {
    const { version: _, ...noVersion } = emptyBackup()
    expect(await rejection(yamlFile(noVersion))).toMatch(/not a valid mealplan backup/i)
    expect(await rejection(yamlFile({ ...emptyBackup(), version: 'one' }))).toMatch(/not a valid mealplan backup/i)
  })

  it('rejects a backup from a newer version', async () => {
    expect(await rejection(yamlFile({ ...emptyBackup(), version: 2 }))).toMatch(/newer version/i)
  })

  it('rejects a missing table', async () => {
    const { freezer: _, ...noFreezer } = emptyBackup()
    expect(await rejection(yamlFile(noFreezer))).toMatch(/freezer/)
  })

  it.each([
    ['meals', { id: 'm', createdAt: 1, updatedAt: 1 }, /meals\[0\]\.name/],
    ['meals', { id: 'm', name: 'x', difficulty: 'extreme', createdAt: 1, updatedAt: 1 }, /meals\[0\]\.difficulty/],
    ['plan', { id: 'p', startDate: '12/10/2026', endDate: '2026-10-12', title: 'x' }, /plan\[0\]\.startDate/],
    ['plan', { id: 'p', startDate: '2026-10-13', endDate: '2026-10-12', title: 'x' }, /plan\[0\]\.endDate/],
    ['freezer', { id: 'f', name: 'x', portions: '2', frozenDate: '2026-09-01', expiryDate: '2027-01-01' }, /freezer\[0\]\.portions/],
    ['mealImages', { id: 'i', mealId: 'm', kind: 'result', order: 0, createdAt: 1, mimeType: 'image/webp' }, /mealImages\[0\]\.data/],
    ['mealImages', { id: 'i', mealId: 'm', kind: 'result', order: 0, createdAt: 1, mimeType: 'image/webp', data: '***' }, /mealImages\[0\]\.data/],
    ['meals', 'not a record', /meals\[0\]/],
  ])('rejects a bad %s record', async (table, record, message) => {
    expect(await rejection(yamlFile({ ...emptyBackup(), [table]: [record] }))).toMatch(message)
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
