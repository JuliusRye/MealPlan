export type Tab = 'calendar' | 'freezer' | 'meals' | 'settings'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'calendar', label: 'Calendar', icon: '📅' },
  { id: 'freezer', label: 'Freezer', icon: '❄️' },
  { id: 'meals', label: 'Meals', icon: '🍲' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
]

interface Badge {
  count: number
  /** Spoken after the tab name, e.g. "expiring soon or expired". */
  description: string
}

interface Props {
  current: Tab
  onChange: (tab: Tab) => void
  /** Counts shown on a tab icon; hidden when 0. */
  badges?: Partial<Record<Tab, Badge>>
}

export default function TabBar({ current, onChange, badges = {} }: Props) {
  return (
    <nav className="tab-bar" aria-label="Main">
      {TABS.map(({ id, label, icon }) => {
        const badge = badges[id]
        const count = badge?.count ?? 0
        return (
          <button
            key={id}
            type="button"
            className="tab"
            aria-current={id === current ? 'page' : undefined}
            onClick={() => onChange(id)}
          >
            <span className="tab-icon" aria-hidden="true">
              {icon}
              {count > 0 && <span className="tab-badge">{count}</span>}
            </span>
            <span className="tab-label">{label}</span>
            {count > 0 && (
              <span className="visually-hidden">
                , {count} {badge?.description}
              </span>
            )}
          </button>
        )
      })}
    </nav>
  )
}
