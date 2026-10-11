import { parse, stringify } from 'yaml'
import { db, type FreezerItem, type Meal, type MealImage, type PlanEntry } from '../db'
import { compareISO, diffDaysISO, isISODate, toISODate, type ISODate } from './dates'

export const BACKUP_VERSION = 1

/** A meal image with its Blob embedded as base64 so the backup is one text file. */
export type BackupImage = Omit<MealImage, 'blob'> & { data: string; mimeType: string }

export interface Backup {
  version: typeof BACKUP_VERSION
  /** ISO timestamp. */
  exportedAt: string
  meals: Meal[]
  mealImages: BackupImage[]
  plan: PlanEntry[]
  freezer: FreezerItem[]
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  // Chunked so String.fromCharCode doesn't exceed the argument limit on big photos.
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

export function backupFilename(now: Date): string {
  return `mealplan-backup-${toISODate(now)}.yaml`
}

/** Every table a backup covers. */
const backupTables = () => [db.meals, db.mealImages, db.plan, db.freezer]

/** Snapshot of every table, read in one transaction so it is consistent. */
async function buildBackup(now: Date): Promise<Backup> {
  const [meals, images, plan, freezer] = await db.transaction(
    'r', backupTables(),
    () => Promise.all([db.meals.toArray(), db.mealImages.toArray(), db.plan.toArray(), db.freezer.toArray()]),
  )
  const mealImages = await Promise.all(
    images.map(async ({ blob, ...rest }): Promise<BackupImage> => ({
      ...rest, data: await blobToBase64(blob), mimeType: blob.type,
    })),
  )
  return { version: BACKUP_VERSION, exportedAt: now.toISOString(), meals, mealImages, plan, freezer }
}

/** All data as a YAML file named `mealplan-backup-YYYY-MM-DD.yaml`. */
export async function exportBackup(now = new Date()): Promise<File> {
  const yaml = stringify(await buildBackup(now))
  return new File([yaml], backupFilename(now), { type: 'application/yaml' })
}

/** A backup that failed validation; `message` is meant for the user. */
export class BackupError extends Error {
  name = 'BackupError'
}

/** A validated backup, with images decoded back to Blobs, ready to restore. */
export interface RestorableBackup {
  exportedAt: string
  meals: Meal[]
  mealImages: MealImage[]
  plan: PlanEntry[]
  freezer: FreezerItem[]
}

const NOT_A_BACKUP = 'This file is not a valid MealPlan backup.'

function invalid(path: string): never {
  throw new BackupError(`${NOT_A_BACKUP} (${path} is missing or invalid.)`)
}

type Check = (value: unknown) => boolean

const isString: Check = (v) => typeof v === 'string'
const isNumber: Check = (v) => typeof v === 'number' && Number.isFinite(v)
const isTimestamp: Check = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v))
const isDate: Check = (v) => typeof v === 'string' && isISODate(v)
const oneOf = (...values: string[]): Check => (v) => typeof v === 'string' && values.includes(v)

type OptionalKeys<T> = { [K in keyof T]-?: undefined extends T[K] ? K : never }[keyof T]
type RequiredKeys<T> = Exclude<keyof T, OptionalKeys<T>>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Copies the listed fields of `value`, checking each one. Unknown fields are
 * dropped; optional fields may be absent (or null) but must be valid if present.
 */
function pick<T>(
  value: unknown,
  path: string,
  required: Record<RequiredKeys<T>, Check>,
  optional: Record<OptionalKeys<T>, Check>,
): T {
  if (!isRecord(value)) invalid(path)
  const result: Record<string, unknown> = {}
  for (const [key, check] of Object.entries<Check>(required)) {
    if (!check(value[key])) invalid(`${path}.${key}`)
    result[key] = value[key]
  }
  for (const [key, check] of Object.entries<Check>(optional)) {
    if (value[key] === undefined || value[key] === null) continue
    if (!check(value[key])) invalid(`${path}.${key}`)
    result[key] = value[key]
  }
  return result as T
}

function readTable<T>(doc: Record<string, unknown>, table: string, read: (value: unknown, path: string) => T): T[] {
  const value = doc[table]
  if (!Array.isArray(value)) invalid(table)
  return value.map((item, i) => read(item, `${table}[${i}]`))
}

function readMeal(value: unknown, path: string): Meal {
  return pick<Meal>(value, path,
    { id: isString, name: isString, createdAt: isNumber, updatedAt: isNumber },
    { notes: isString, link: isString, source: isString, prepMinutes: isNumber, difficulty: oneOf('easy', 'medium', 'hard') })
}

function readPlanEntry(value: unknown, path: string): PlanEntry {
  const entry = pick<PlanEntry>(value, path,
    { id: isString, startDate: isDate, endDate: isDate, title: isString },
    { mealId: isString, freezerItemId: isString, portionsFromFreezer: isNumber, note: isString })
  if (compareISO(entry.endDate, entry.startDate) < 0) invalid(`${path}.endDate`)
  return entry
}

function readFreezerItem(value: unknown, path: string): FreezerItem {
  return pick<FreezerItem>(value, path,
    { id: isString, name: isString, portions: isNumber, frozenDate: isDate, expiryDate: isDate },
    { mealId: isString, note: isString })
}

function base64ToBlob(data: string, type: string): Blob {
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type })
}

function readMealImage(value: unknown, path: string): MealImage {
  const { data, mimeType, ...image } = pick<BackupImage>(value, path,
    { id: isString, mealId: isString, kind: oneOf('recipe', 'result'), order: isNumber, createdAt: isNumber, data: isString, mimeType: isString },
    {})
  try {
    return { ...image, blob: base64ToBlob(data, mimeType) }
  } catch {
    invalid(`${path}.data`)
  }
}

/**
 * Parses and validates a backup file without touching the database.
 * Throws a `BackupError` with a user-facing message if the file is unusable.
 */
export async function readBackup(file: Blob): Promise<RestorableBackup> {
  let doc: unknown
  try {
    doc = parse(await file.text())
  } catch {
    throw new BackupError(NOT_A_BACKUP)
  }
  if (!isRecord(doc) || typeof doc.version !== 'number') throw new BackupError(NOT_A_BACKUP)
  if (doc.version > BACKUP_VERSION) {
    throw new BackupError('This backup was made by a newer version of MealPlan. Update the app and try again.')
  }
  if (doc.version !== BACKUP_VERSION) throw new BackupError(NOT_A_BACKUP)
  if (!isTimestamp(doc.exportedAt)) invalid('exportedAt')

  return {
    exportedAt: doc.exportedAt as string,
    meals: readTable(doc, 'meals', readMeal),
    mealImages: readTable(doc, 'mealImages', readMealImage),
    plan: readTable(doc, 'plan', readPlanEntry),
    freezer: readTable(doc, 'freezer', readFreezerItem),
  }
}

/** Replaces every table with the backup's contents, all or nothing. */
export async function restoreBackup(backup: RestorableBackup): Promise<void> {
  await db.transaction('rw', backupTables(), async () => {
    await Promise.all(backupTables().map((table) => table.clear()))
    await Promise.all([
      db.meals.bulkAdd(backup.meals),
      db.mealImages.bulkAdd(backup.mealImages),
      db.plan.bulkAdd(backup.plan),
      db.freezer.bulkAdd(backup.freezer),
    ])
  })
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

type FileSharer = Partial<Pick<Navigator, 'canShare' | 'share'>>

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled'

/** Triggers a browser download of `file`. */
export function downloadFile(file: File): void {
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.click()
  // Revoke later: revoking right away can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/**
 * Opens the share sheet (Drive, email, …) when the browser can share files,
 * otherwise downloads. Falls back to downloading if sharing fails for any
 * reason other than the user dismissing the sheet.
 */
export async function shareOrDownload(
  file: File,
  sharer: FileSharer = globalThis.navigator ?? {},
  download: (file: File) => void = downloadFile,
): Promise<ShareOutcome> {
  if (sharer.share && sharer.canShare?.({ files: [file] })) {
    try {
      await sharer.share({ files: [file], title: file.name })
      return 'shared'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
    }
  }
  download(file)
  return 'downloaded'
}

const LAST_EXPORT_KEY = 'mealplan.lastExport'
export const REMINDER_DAYS = 30

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>

function defaultStorage(): KeyValueStorage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

export function readLastExport(storage = defaultStorage()): ISODate | null {
  try {
    const value = storage?.getItem(LAST_EXPORT_KEY)
    return value && isISODate(value) ? value : null
  } catch {
    return null
  }
}

export function writeLastExport(date: ISODate, storage = defaultStorage()): void {
  try {
    storage?.setItem(LAST_EXPORT_KEY, date)
  } catch {
    // Storage blocked or full: the reminder is a nicety, the export itself worked.
  }
}

/** True if there has never been an export or the last one is more than 30 days old. */
export function needsBackupReminder(lastExport: ISODate | null, today: ISODate): boolean {
  return lastExport === null || diffDaysISO(today, lastExport) > REMINDER_DAYS
}
