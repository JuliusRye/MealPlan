import { useEffect, useState } from 'react'
import { addDays, startOfDay } from 'date-fns'
import { todayISO, type ISODate } from '../logic/dates'

/** Today's local date, updated at midnight so long-open screens don't go stale. */
export function useToday(): ISODate {
  const [today, setToday] = useState(todayISO)
  useEffect(() => {
    const now = new Date()
    const timer = setTimeout(() => setToday(todayISO()), addDays(startOfDay(now), 1).getTime() - now.getTime() + 1000)
    return () => clearTimeout(timer)
  }, [today])
  return today
}
