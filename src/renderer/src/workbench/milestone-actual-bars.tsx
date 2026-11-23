import type {
  MilestoneFeature,
  MilestoneMaterial,
  ScheduledVersion
} from '../../../shared/workbench/project-milestones'
import { milestoneDay } from '../../../shared/workbench/milestone-calendar'
import type { MilestoneVersionFacts } from './milestone-feature-facts'
import { milestoneActualLayout } from './milestone-actual-layout'
import { MILESTONE_DAY_WIDTH } from './use-milestone-gesture'

export function MilestoneActualBars({
  feature,
  material,
  facts,
  origin,
  onOpen
}: {
  feature: MilestoneFeature
  material: MilestoneMaterial
  facts: Record<string, MilestoneVersionFacts>
  origin: number
  onOpen(version: ScheduledVersion): void
}) {
  return milestoneActualLayout(feature, material, facts).results.map((result) => {
    const { version, outcome, label, lane } = result
    const { start, end } = version.timeWindow!
    const title = `${feature.title} ${version.version} · ${label}`
    return (
      <button
        key={version.cycleId}
        type="button"
        className={`wb-ml-result-bar ${outcome}`}
        style={{
          left: (milestoneDay(start) - origin) * MILESTONE_DAY_WIDTH,
          width: (milestoneDay(end) - milestoneDay(start) + 1) * MILESTONE_DAY_WIDTH,
          top: 31 + lane * 36
        }}
        title={`${title}；${start}—${end} 为版本周期。点击查看版本总览。`}
        aria-label={title}
        data-actual-start={start}
        data-actual-end={end}
        onClick={() => onOpen(version)}
      >
        <span aria-hidden="true">{outcome === 'met' ? '✓' : '○'}</span>
        {version.version} · {label}
      </button>
    )
  })
}
