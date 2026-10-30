import { useCallback, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { MilestoneDraft, ScheduledVersion } from '../../../shared/workbench/project-milestones'
import { milestoneCalendar } from '../../../shared/workbench/milestone-calendar'

export function useMilestoneActualRange(draft: MilestoneDraft, started: Set<string>) {
  const calendar = milestoneCalendar(draft)
  const [ranges, setRanges] = useState<Record<string, [number, number]>>({})
  const reportRange = useCallback((key: string, start: number | null, end: number | null) => {
    setRanges((previous) => {
      if (previous[key]?.[0] === start && previous[key]?.[1] === end) {
        return previous
      }
      if (start === null || end === null) {
        if (!previous[key]) {
          return previous
        }
        const next = { ...previous }
        delete next[key]
        return next
      }
      return { ...previous, [key]: [start, end] }
    })
  }, [])
  const active = Object.entries(ranges)
    .filter(([key]) => started.has(key))
    .map(([, range]) => range)
  return {
    ...calendar,
    origin: Math.min(calendar.start, ...active.map((r) => r[0])),
    end: Math.max(calendar.end, ...active.map((r) => r[1])),
    reportRange
  }
}

export function UndatedMilestoneVersions({
  versions,
  started,
  open
}: {
  versions: ScheduledVersion[]
  started: Set<string>
  open(v: ScheduledVersion): void
}) {
  const undated = versions.filter((v) => !v.timeWindow && started.has(v.cycleId))
  return undated.length ? (
    <div className="wb-ml-toolbar" aria-label="未记录日期的版本">
      <span>版本日期未记录</span>
      {undated.map((v) => (
        <Button key={v.cycleId} variant="ghost" size="xs" onClick={() => open(v)}>
          {v.version} ↗
        </Button>
      ))}
    </div>
  ) : null
}
