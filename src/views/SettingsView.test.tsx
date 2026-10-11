import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { stringify } from 'yaml'
import { db, newId } from '../db'
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

  describe('import', () => {
    const backupYaml = (meals: object[]) =>
      stringify({ version: 1, exportedAt: '2026-10-01T10:00:00.000Z', meals, mealImages: [], plan: [], freezer: [] })

    function pickFile(contents: string) {
      fireEvent.change(screen.getByLabelText(/import backup/i), {
        target: { files: [new File([contents], 'backup.yaml')] },
      })
    }

    beforeEach(async () => {
      await db.meals.add({ id: newId(), name: 'Current meal', createdAt: 1, updatedAt: 1 })
    })

    it('rejects an invalid file with a message and keeps the data', async () => {
      render(<SettingsView />)
      pickFile('version: 99')

      expect(await screen.findByRole('alert')).toHaveTextContent(/newer version/i)
      expect(screen.queryByRole('button', { name: /replace all data/i })).not.toBeInTheDocument()
      expect((await db.meals.toArray()).map((m) => m.name)).toEqual(['Current meal'])
    })

    it('asks for confirmation before replacing the data', async () => {
      render(<SettingsView />)
      pickFile(backupYaml([{ id: 'a', name: 'Restored meal', createdAt: 1, updatedAt: 1 }]))

      expect(await screen.findByText(/1 meal, 0 photos, 0 plan entries and 0 freezer items/i)).toBeInTheDocument()
      expect((await db.meals.toArray()).map((m) => m.name)).toEqual(['Current meal'])

      fireEvent.click(screen.getByRole('button', { name: /replace all data/i }))
      expect(await screen.findByText(/backup restored/i)).toBeInTheDocument()
      expect((await db.meals.toArray()).map((m) => m.name)).toEqual(['Restored meal'])
    })

    it('does nothing when the confirmation is cancelled', async () => {
      render(<SettingsView />)
      pickFile(backupYaml([]))

      fireEvent.click(await screen.findByRole('button', { name: /cancel/i }))
      expect(screen.queryByRole('button', { name: /replace all data/i })).not.toBeInTheDocument()
      expect((await db.meals.toArray()).map((m) => m.name)).toEqual(['Current meal'])
    })
  })
})
