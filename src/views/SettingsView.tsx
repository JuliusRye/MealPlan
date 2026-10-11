import { useState } from 'react'
import { useToday } from '../hooks/useToday'
import {
  exportBackup,
  formatBytes,
  needsBackupReminder,
  readLastExport,
  REMINDER_DAYS,
  shareOrDownload,
  writeLastExport,
} from '../logic/backup'
import { formatDayLong, todayISO } from '../logic/dates'

type ExportState =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'done'; message: string }
  | { kind: 'error'; message: string }

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

      <section className="settings-section" aria-labelledby="settings-about">
        <h2 id="settings-about">About</h2>
        <p className="settings-hint">Version {__APP_VERSION__}</p>
      </section>
    </section>
  )
}
