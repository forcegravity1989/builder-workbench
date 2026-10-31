import type {
  MilestoneFeature,
  MilestoneMaterial
} from '../../../shared/workbench/project-milestones'
import { actualDay, plannedDay } from '../../../shared/workbench/milestone-sdlc'
import { timeLabel } from './version-overview/overview-time'
import type { MilestoneVersionFacts } from './milestone-feature-facts'
import { milestoneActualLayout } from './milestone-actual-layout'
import { MILESTONE_DAY_WIDTH } from './use-milestone-gesture'

export function MilestoneActualBars({
  feature,
  material,
  facts,
  started,
  origin
}: {
  feature: MilestoneFeature
  material: MilestoneMaterial
  facts: Record<string, MilestoneVersionFacts>
  started: Set<string>
  origin: number
}) {
  const { stages, missing } = milestoneActualLayout(feature, material, facts, started)
  const completedTest = stages.find((stage) => stage.id === 'Test' && !stage.ongoing)
  return (
    <>
      {missing.map(({ delivery, read }) => (
        <span
          key={delivery.id}
          className="wb-ml-actual-unknown"
          style={{ left: (plannedDay(delivery.stages[0]!.start) - origin) * MILESTONE_DAY_WIDTH }}
        >
          {!read || read.loading ? '正在采集实际进度…' : '未采集到实际进度，请到版本总览查看'}
        </span>
      ))}
      {stages.map((stage) => {
        const width = (actualDay(stage.end!) - actualDay(stage.start!)) * MILESTONE_DAY_WIDTH
        return (
          <button
            key={stage.id}
            type="button"
            className={`wb-ml-actual-phase${stage.ongoing ? ' ongoing' : ''}`}
            style={{
              left: (actualDay(stage.start!) - origin) * MILESTONE_DAY_WIDTH,
              width: Math.max(12, width)
            }}
            title={`${stage.id} · ${timeLabel(stage.start)} → ${timeLabel(stage.end)}${stage.ongoing ? ' · 进行中，截至采集时刻' : ''}`}
            aria-label={`${stage.id} 实际记录`}
            data-actual-start={stage.start}
            data-actual-end={stage.end}
          >
            <i className={`wb-phase-${stage.id.toLowerCase()}`} style={{ width }} />
            {width > 30 && (
              <span>
                {stage.id}
                {stage.ongoing ? ' · 进行中' : ''}
              </span>
            )}
          </button>
        )
      })}
      {completedTest && (
        <span
          className="wb-ml-actual-unknown wb-ml-deploy-unknown"
          style={{ left: (actualDay(completedTest.end!) - origin) * MILESTONE_DAY_WIDTH + 7 }}
        >
          Deploy · 未跟踪
        </span>
      )}
    </>
  )
}
