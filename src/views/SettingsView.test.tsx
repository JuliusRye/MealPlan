import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db'
import { writeLastExport } from '../logic/backup'
import SettingsView from './SettingsView'

// Only the clock is faked, so Dexie's and Testing Library's timers still run.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 11, 12, 0))
  // jsdom has no object URLs and can't navigate to a download.
  URL.createObjectURL = vi.fn(() => 'blob:backup')
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})

afterEach(async () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  localStorage.clear()
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('SettingsView', () => {
  it('shows the app version', () => {
    render(<SettingsView />)
    expect(screen.getByText(`Version ${__APP_VERSION__}`)).toBeInTheDocument()
  })

  it('reminds to back up when there has never been an export', () => {
    render(<SettingsView />)
    expect(screen.getByText(/never exported/i)).toBeInTheDocument()
    expect(screen.getByText(/no backup in the last 30 days/i)).toBeInTheDocument()
  })

  it('shows a recent export without a reminder', () => {
    writeLastExport('2026-10-01')
    render(<SettingsView />)
    expect(screen.getByText(/thursday 1 october 2026/i)).toBeInTheDocument()
    expect(screen.queryByText(/no backup in the last 30 days/i)).not.toBeInTheDocument()
  })

  it('reminds when the last export is more than 30 days old', () => {
    writeLastExport('2026-09-01')
    render(<SettingsView />)
    expect(screen.getByText(/no backup in the last 30 days/i)).toBeInTheDocument()
  })

  it('downloads the backup and shows its size and the new export date', async () => {
    render(<SettingsView />)
    fireEvent.click(screen.getByRole('button', { name: /export backup/i }))

    expect(await screen.findByText(/saved mealplan-backup-2026-10-11\.yaml \(\d+ B\)/i)).toBeInTheDocument()
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce()
    expect(screen.getByText(/sunday 11 october 2026/i)).toBeInTheDocument()
    expect(screen.queryByText(/no backup in the last 30 days/i)).not.toBeInTheDocument()
  })
})
