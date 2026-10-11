import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useRef, useState } from 'react'
import PlanEntrySheet from '../components/PlanEntrySheet'
import { db, type PlanEntry } from '../db'
import { useToday } from '../hooks/useToday'
import {
  addDaysISO,
  addMonthsISO,
  formatDayLong,
  formatMonth,
  formatRange,
  fromISODate,
  isSameYearISO,
  monthWeeks,
  startOfMonthISO,
  type ISODate,
} from '../logic/dates'
import { expiryBanner } from '../logic/freezer'
import { entriesInRange, entryDays, layoutWeekBars, unplannedDays, upcomingEntries } from '../logic/plan'

type Mode = 'month' | 'agenda'
type Sheet = { kind: 'new'; startDate: ISODate } | { kind: 'edit'; entry: PlanEntry }

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
/** Minimum horizontal travel in px for a touch to count as a swipe. */
const SWIPE_MIN = 50

const entryLabel = (entry: PlanEntry) =>
  `${entry.title}${entry.freezerItemId ? ', from the freezer' : ''}, ${formatRange(entry.startDate, entry.endDate)}`

const FreezerMarker = () => (
  <span className="freezer-marker" aria-hidden="true">
    ❄
  </span>
)

export default function CalendarView() {
  const today = useToday()
  const [mode, setMode] = useState<Mode>('month')
  const [month, setMonth] = useState(() => startOfMonthISO(today))
  const [sheet, setSheet] = useState<Sheet>()
  const closeSheet = useCallback(() => setSheet(undefined), [])
  const openEntry = (entry: PlanEntry) => setSheet({ kind: 'edit', entry })
  const banner = useLiveQuery(async () => expiryBanner(await db.freezer.toArray(), today), [today])

  return (
    <section className="screen">
      <div className="screen-header">
        <h1>Calendar</h1>
        <div className="view-toggle" role="group" aria-label="View">
          {(['month', 'agenda'] as const).map((m) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>
              {m === 'month' ? 'Month' : 'Agenda'}
            </button>
          ))}
        </div>
      </div>
      {banner && (
        <p className="freezer-banner" role="status">
          <FreezerMarker />
          <span>{banner}</span>
        </p>
      )}

      {mode === 'month' ? (
        <MonthGrid
          today={today}
          month={month}
          onMonthChange={setMonth}
          onPlan={(startDate) => setSheet({ kind: 'new', startDate })}
          onOpen={openEntry}
        />
      ) : (
        <Agenda today={today} onPlan={() => setSheet({ kind: 'new', startDate: today })} onOpen={openEntry} />
      )}

      {sheet && (
        <PlanEntrySheet
          key={sheet.kind === 'edit' ? sheet.entry.id : sheet.startDate}
          entry={sheet.kind === 'edit' ? sheet.entry : undefined}
          startDate={sheet.kind === 'new' ? sheet.startDate : undefined}
          onClose={closeSheet}
        />
      )}
    </section>
  )
}

interface PaneProps {
  today: ISODate
  onPlan: (startDate: ISODate) => void
  onOpen: (entry: PlanEntry) => void
}

interface MonthGridProps extends PaneProps {
  /** First day of the visible month. */
  month: ISODate
  onMonthChange: (month: ISODate) => void
}

function MonthGrid({ today, month, onMonthChange, onPlan, onOpen }: MonthGridProps) {
  const weeks = monthWeeks(month)
  const from = weeks[0]
  const to = addDaysISO(weeks[weeks.length - 1], 6)
  // Only the visible range is queried, so any month far back or ahead is cheap.
  const entries = useLiveQuery(() => entriesInRange(from, to), [from, to])
  const nextWeek = useLiveQuery(() => entriesInRange(today, addDaysISO(today, 6)), [today])
  const unplanned = new Set(nextWeek ? unplannedDays(today, nextWeek) : [])

  const step = (months: number) => onMonthChange(addMonthsISO(month, months))
  const touch = useRef<{ x: number; y: number }>(undefined)

  return (
    <>
      <div className="month-nav">
        <button type="button" aria-label="Previous month" onClick={() => step(-1)}>
          ‹
        </button>
        <h2 aria-live="polite">{formatMonth(month)}</h2>
        <button type="button" aria-label="Next month" onClick={() => step(1)}>
          ›
        </button>
        <button type="button" className="today-button" onClick={() => onMonthChange(startOfMonthISO(today))}>
          Today
        </button>
      </div>

      <div
        className="month"
        data-testid="month-grid"
        onTouchStart={(e) => {
          const t = e.touches[0]
          touch.current = { x: t.clientX, y: t.clientY }
        }}
        onTouchEnd={(e) => {
          const start = touch.current
          touch.current = undefined
          const t = e.changedTouches[0]
          if (!start || !t) return
          const dx = t.clientX - start.x
          const dy = t.clientY - start.y
          if (Math.abs(dx) >= SWIPE_MIN && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1)
        }}
      >
        <div className="weekdays" aria-hidden="true">
          {WEEKDAYS.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        {weeks.map((weekStart) => (
          <WeekRow
            key={weekStart}
            weekStart={weekStart}
            month={month}
            today={today}
            entries={entries ?? []}
            unplanned={unplanned}
            onPlan={onPlan}
            onOpen={onOpen}
          />
        ))}
      </div>
      {unplanned.size > 0 && (
        <p className="calendar-legend">
          <span className="legend-swatch" aria-hidden="true" /> No dinner planned yet (next 7 days)
        </p>
      )}
    </>
  )
}

interface WeekRowProps {
  weekStart: ISODate
  month: ISODate
  today: ISODate
  entries: readonly PlanEntry[]
  unplanned: ReadonlySet<ISODate>
  onPlan: (startDate: ISODate) => void
  onOpen: (entry: PlanEntry) => void
}

function WeekRow({ weekStart, month, today, entries, unplanned, onPlan, onOpen }: WeekRowProps) {
  const bars = layoutWeekBars(weekStart, entries)
  const lanes = bars.reduce((n, b) => Math.max(n, b.lane + 1), 0)
  const days = Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart, i))
  return (
    <div className="week" style={{ gridTemplateRows: `var(--day-number-height) repeat(${lanes}, var(--bar-height)) 1fr` }}>
      {days.map((day, i) => {
        // A planned day opens its (earliest-starting) dinner, so the whole cell is its tap target, not just the thin bar.
        const planned = bars.find((b) => b.column <= i && i < b.column + b.span)?.entry
        const isUnplanned = unplanned.has(day)
        const classes = ['day']
        if (startOfMonthISO(day) !== month) classes.push('day-outside')
        if (isUnplanned) classes.push('day-unplanned')
        return (
          <button
            key={day}
            type="button"
            className={classes.join(' ')}
            style={{ gridColumn: i + 1 }}
            aria-current={day === today ? 'date' : undefined}
            aria-label={`${formatDayLong(day)}${planned ? `, ${planned.title}` : isUnplanned ? ', nothing planned' : ''}`}
            onClick={() => (planned ? onOpen(planned) : onPlan(day))}
          >
            <span className="day-number">{fromISODate(day).getDate()}</span>
          </button>
        )
      })}
      {bars.map((bar) => {
        const classes = ['bar']
        if (bar.continuesBefore) classes.push('bar-continues-before')
        if (bar.continuesAfter) classes.push('bar-continues-after')
        return (
          <button
            key={bar.entry.id}
            type="button"
            className={classes.join(' ')}
            style={{ gridColumn: `${bar.column + 1} / span ${bar.span}`, gridRow: bar.lane + 2 }}
            aria-label={entryLabel(bar.entry)}
            onClick={() => onOpen(bar.entry)}
          >
            {bar.entry.freezerItemId && <FreezerMarker />}
            {bar.entry.title}
          </button>
        )
      })}
    </div>
  )
}

function Agenda({ today, onPlan, onOpen }: PaneProps) {
  const entries = useLiveQuery(() => upcomingEntries(today), [today])
  return (
    <>
      <div className="toolbar">
        <h2>Upcoming</h2>
        <button type="button" className="primary" onClick={() => onPlan(today)}>
          + Plan dinner
        </button>
      </div>
      {!entries ? null : entries.length === 0 ? (
        <p className="placeholder">Nothing planned yet.</p>
      ) : (
        <ul className="agenda-list" aria-label="Upcoming dinners">
          {entries.map((entry) => {
            const days = entryDays(entry)
            const year = !isSameYearISO(entry.startDate, today) || !isSameYearISO(entry.endDate, today)
            return (
              <li key={entry.id}>
                <button type="button" className="agenda-row" onClick={() => onOpen(entry)}>
                  <span className="agenda-date">{formatRange(entry.startDate, entry.endDate, { year })}</span>
                  <span className="meal-name">
                    {entry.freezerItemId && (
                      <>
                        <FreezerMarker />
                        <span className="visually-hidden">From the freezer: </span>
                      </>
                    )}
                    {entry.title}
                  </span>
                  {days > 1 && <span className="agenda-meta">{days} days</span>}
                  {entry.note && <span className="agenda-meta">{entry.note}</span>}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
