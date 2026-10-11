import { useState, type ChangeEvent } from 'react'
import { useToday } from '../hooks/useToday'
import {
  BackupError,
  exportBackup,
  formatBytes,
  needsBackupReminder,
  readBackup,
  readLastExport,
  REMINDER_DAYS,
  restoreBackup,
  shareOrDownload,
  writeLastExport,
  type RestorableBackup,
} from '../logic/backup'
import { formatDayLong, toISODate, todayISO } from '../logic/dates'

type ExportState =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'done'; message: string }
  | { kind: 'error'; message: string }

type ImportState =
  | { kind: 'idle' }
  | { kind: 'reading' }
  | { kind: 'confirm'; backup: RestorableBackup }
  | { kind: 'restoring'; backup: RestorableBackup }
  | { kind: 'done' }
  | { kind: 'error'; message: string }

function pluralize(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`
}

function backupSummary(backup: RestorableBackup): string {
  return [
    pluralize(backup.meals.length, 'meal', 'meals'),
    pluralize(backup.mealImages.length, 'photo', 'photos'),
    pluralize(backup.plan.length, 'plan entry', 'plan entries'),
  ].join(', ') + ` and ${pluralize(backup.freezer.length, 'freezer item', 'freezer items')}`
}

function ImportBackup() {
  const [state, setState] = useState<ImportState>({ kind: 'idle' })
  const busy = state.kind === 'reading' || state.kind === 'restoring'

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const file = input.files?.[0]
    // Clear so picking the same file again still fires a change.
    input.value = ''
    if (!file) return
    setState({ kind: 'reading' })
    try {
      setState({ kind: 'confirm', backup: await readBackup(file) })
    } catch (error) {
      if (error instanceof BackupError) {
        setState({ kind: 'error', message: error.message })
      } else {
        console.error(error)
        setState({ kind: 'error', message: 'Could not read the file.' })
      }
    }
  }

  async function handleRestore(backup: RestorableBackup) {
    setState({ kind: 'restoring', backup })
    try {
      await restoreBackup(backup)
      setState({ kind: 'done' })
    } catch (error) {
      console.error(error)
      setState({ kind: 'error', message: 'Import failed. Your existing data was not changed.' })
    }
  }

  return (
    <section className="settings-section" aria-labelledby="settings-import">
      <h2 id="settings-import">Restore</h2>
      <p className="settings-hint">Importing a backup replaces everything currently in the app.</p>
      {state.kind === 'confirm' || state.kind === 'restoring' ? (
        <div className="import-confirm">
          <p>
            Replace all data with the backup from {formatDayLong(toISODate(new Date(state.backup.exportedAt)))}? It
            contains {backupSummary(state.backup)}. Everything currently in the app will be deleted.
          </p>
          <div className="actions">
            <button type="button" disabled={busy} onClick={() => setState({ kind: 'idle' })}>
              Cancel
            </button>
            <button type="button" className="danger" disabled={busy} onClick={() => handleRestore(state.backup)}>
              {state.kind === 'restoring' ? 'Restoring…' : 'Replace all data'}
            </button>
          </div>
        </div>
      ) : (
        <label className="file-button" aria-disabled={busy || undefined}>
          <input
            type="file"
            accept=".yaml,.yml,application/yaml,text/yaml"
            disabled={busy}
            aria-label="Import backup"
            onChange={handleFile}
          />
          {state.kind === 'reading' ? 'Reading…' : 'Import backup'}
        </label>
      )}
      <p role="status" className="settings-hint">
        {state.kind === 'done' && 'Backup restored.'}
      </p>
      {state.kind === 'error' && (
        <p className="form-error" role="alert">
          {state.message}
        </p>
      )}
    </section>
  )
}

export default function SettingsView() {
  const today = useToday()
  const [lastExport, setLastExport] = useState(readLastExport)
  const [state, setState] = useState<ExportState>({ kind: 'idle' })

  async function handleExport() {
    setState({ kind: 'busy' })
    try {
      const file = await exportBackup()
      const outcome = await shareOrDownload(file)
      if (outcome === 'cancelled') {
        setState({ kind: 'idle' })
        return
      }
      const date = todayISO()
      writeLastExport(date)
      setLastExport(date)
      const verb = outcome === 'shared' ? 'Shared' : 'Saved'
      setState({ kind: 'done', message: `${verb} ${file.name} (${formatBytes(file.size)})` })
    } catch (error) {
      console.error(error)
      setState({ kind: 'error', message: 'Export failed. Please try again.' })
    }
  }

  return (
    <section className="screen">
      <h1>Settings</h1>

      <section className="settings-section" aria-labelledby="settings-backup">
        <h2 id="settings-backup">Backup</h2>
        <p className="settings-hint">
          Your data lives only on this device. Export a backup now and then and keep it somewhere safe, like Drive.
        </p>
        <p>
          Last export: {lastExport ? formatDayLong(lastExport) : 'never exported'}
        </p>
        {needsBackupReminder(lastExport, today) && (
          <p className="backup-reminder">No backup in the last {REMINDER_DAYS} days — a good time to export one.</p>
        )}
        <button type="button" className="primary" onClick={handleExport} disabled={state.kind === 'busy'}>
          {state.kind === 'busy' ? 'Exporting…' : 'Export backup'}
        </button>
        <p role="status" className="settings-hint">
          {state.kind === 'done' && state.message}
        </p>
        {state.kind === 'error' && (
          <p className="form-error" role="alert">
            {state.message}
          </p>
        )}
      </section>

      <ImportBackup />

      <section className="settings-section" aria-labelledby="settings-about">
        <h2 id="settings-about">About</h2>
        <p className="settings-hint">Version {__APP_VERSION__}</p>
      </section>
    </section>
  )
}
