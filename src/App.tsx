import { useState } from 'react'
import TabBar, { type Tab } from './components/TabBar'
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
  const View = VIEWS[tab]
  return (
    <div className="app">
      <main className="content">
        <View />
      </main>
      <TabBar current={tab} onChange={setTab} />
    </div>
  )
}
