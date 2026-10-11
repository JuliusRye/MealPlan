export type Tab = 'calendar' | 'freezer' | 'meals' | 'settings'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'calendar', label: 'Calendar', icon: '📅' },
  { id: 'freezer', label: 'Freezer', icon: '❄️' },
  { id: 'meals', label: 'Meals', icon: '🍲' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
]

interface Props {
  current: Tab
  onChange: (tab: Tab) => void
}

export default function TabBar({ current, onChange }: Props) {
  return (
    <nav className="tab-bar" aria-label="Main">
      {TABS.map(({ id, label, icon }) => (
        <button
          key={id}
          type="button"
          className="tab"
          aria-current={id === current ? 'page' : undefined}
          onClick={() => onChange(id)}
        >
          <span className="tab-icon" aria-hidden="true">{icon}</span>
          <span className="tab-label">{label}</span>
        </button>
      ))}
    </nav>
  )
}
