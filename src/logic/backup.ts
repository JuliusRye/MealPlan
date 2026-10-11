import { stringify } from 'yaml'
import { db, type FreezerItem, type Meal, type MealImage, type PlanEntry } from '../db'
import { diffDaysISO, isISODate, toISODate, type ISODate } from './dates'

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

/** Snapshot of every table, read in one transaction so it is consistent. */
async function buildBackup(now: Date): Promise<Backup> {
  const [meals, images, plan, freezer] = await db.transaction(
    'r', [db.meals, db.mealImages, db.plan, db.freezer],
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
