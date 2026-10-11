import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import TabBar, { type Tab } from './components/TabBar'
import { db } from './db'
import { useToday } from './hooks/useToday'
import { countExpiryWarnings } from './logic/freezer'
import CalendarView from './views/CalendarView'
import FreezerView from './views/FreezerView'
import MealsView from './views/MealsView'
import SettingsView from './views/SettingsView'

const VIEWS: Record<Tab, () => React.JSX.Element> = {
  calendar: CalendarView,
  freezer: FreezerView,
  meals: MealsView,
  settings: SettingsView,
}

export default function App() {
  const [tab, setTab] = useState<Tab>('calendar')
  const today = useToday()
  const expiring = useLiveQuery(async () => countExpiryWarnings(await db.freezer.toArray(), today), [today]) ?? 0
  const View = VIEWS[tab]
  return (
    <div className="app">
      <main className="content">
        <View />
      </main>
      <TabBar
        current={tab}
        onChange={setTab}
        badges={{ freezer: { count: expiring, description: 'expiring soon or expired' } }}
      />
    </div>
  )
}
