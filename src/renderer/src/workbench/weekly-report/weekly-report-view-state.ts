import { useCallback, useSyncExternalStore } from 'react'
import { weeklyReportPeriod } from '../../../../shared/workbench/weekly-report'

type ReportView = { start: string; selected: string | null }
const views = new Map<string, ReportView>()
const listeners = new Set<() => void>()

export function weekEndExclusive(start: string): string {
  const date = new Date(`${start}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + 7)
  return date.toISOString().slice(0, 10)
}

function read(identity: string): ReportView {
  const cached = views.get(identity)
  if (cached) {
    return cached
  }
  let view: ReportView = { start: weeklyReportPeriod().start, selected: null }
  try {
    const saved = JSON.parse(sessionStorage.getItem(`bw:weekly-report:view:${identity}`) ?? 'null')
    if (
      saved &&
      typeof saved.start === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(saved.start) &&
      Number.isFinite(Date.parse(saved.start)) &&
      new Date(saved.start).toISOString().slice(0, 10) === saved.start
    ) {
      view = {
        start: saved.start,
        selected: typeof saved.selected === 'string' ? saved.selected : null
      }
    }
  } catch {}
  views.set(identity, view)
  return view
}

export function useWeeklyReportView(identity: string) {
  const view = useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    useCallback(() => read(identity), [identity])
  )
  const update = useCallback(
    (patch: Partial<ReportView>) => {
      const next = { ...read(identity), ...patch }
      views.set(identity, next)
      try {
        sessionStorage.setItem(`bw:weekly-report:view:${identity}`, JSON.stringify(next))
      } catch {}
      for (const listener of listeners) {
        listener()
      }
    },
    [identity]
  )
  return [view, update] as const
}
