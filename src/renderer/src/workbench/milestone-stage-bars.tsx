import { Fragment } from 'react'
import {
  MilestonePhases,
  type MilestoneFeature
} from '../../../shared/workbench/project-milestones'
import { plannedDay } from '../../../shared/workbench/milestone-sdlc'
import {
  MILESTONE_DAY_WIDTH as width,
  type MilestoneGestureApi,
  type MilestoneGesture
} from './use-milestone-gesture'

export function MilestoneLegend() {
  return (
    <div className="wb-ml-legend" aria-label="SDLC 阶段图例">
      {MilestonePhases.map((phase) => (
        <span key={phase}>
          <i className={`wb-phase-${phase.toLowerCase()}`} />
          {phase}
        </span>
      ))}
    </div>
  )
}

export function MilestoneStageBars({
  feature,
  origin,
  enabled,
  started,
  showPlan,
  gesture
}: {
  feature: MilestoneFeature
  origin: number
  enabled: boolean
  started: Set<string>
  showPlan: boolean
  gesture: MilestoneGestureApi
}) {
  const x = (time: string) => (plannedDay(time) - origin) * width
  return (
    <>
      <svg className="wb-ml-connection" aria-hidden="true">
        {feature.deliveries.slice(1).map((d, i) => {
          const left = x(feature.deliveries[i].stages.at(-1)!.end),
            right = x(d.stages[0].start)
          return right > left ? <path key={d.id} d={`M ${left} 45 H ${right}`} /> : null
        })}
      </svg>
      {feature.deliveries.map((delivery) => {
        const frozen = started.has(delivery.version.cycleId),
          editable = enabled && !frozen
        return (
          <Fragment key={delivery.id}>
            {frozen && (
              <span className="wb-ml-actual-unknown" style={{ left: x(delivery.stages[0].start) }}>
                实际阶段未知
              </span>
            )}
            {(!frozen || showPlan) && (
              <div className={`wb-ml-phase-group ${frozen ? 'ghost' : ''}`}>
                {delivery.stages.map((s, index) => {
                  const operation: MilestoneGesture = {
                    kind: 'delivery',
                    id: feature.id,
                    deliveryId: delivery.id,
                    stage: index,
                    mode: 'move'
                  }
                  const pixels = x(s.end) - x(s.start)
                  const label = `${s.phase} · ${s.start.replace('T', ' ')} — ${s.end.replace('T', ' ')} · ${frozen ? '原计划，只读' : '计划'}`
                  return (
                    <div
                      key={s.phase}
                      className={`wb-ml-phase wb-phase-${s.phase.toLowerCase()} ${editable ? 'editable' : ''}`}
                      style={{ left: x(s.start), width: pixels, top: frozen ? 76 : 31 }}
                    >
                      <button
                        className="wb-ml-phase-body"
                        title={label}
                        aria-label={label}
                        onPointerDown={editable ? (e) => gesture.begin(e, operation) : undefined}
                        onKeyDown={editable ? (e) => gesture.keyboard(e, operation) : undefined}
                      >
                        <span>
                          {pixels >= 38 ? s.phase : s.phase.slice(0, s.phase === 'Deploy' ? 2 : 1)}
                        </span>
                      </button>
                      {editable &&
                        (['start', 'end'] as const).map((edge) => (
                          <button
                            key={edge}
                            className={`wb-ml-resize ${edge}`}
                            aria-label={`${s.phase} ${edge === 'start' ? '开始' : '结束'}：拖动或方向键调整半天`}
                            onPointerDown={(e) => gesture.begin(e, { ...operation, mode: edge })}
                            onKeyDown={(e) => gesture.keyboard(e, { ...operation, mode: edge })}
                          />
                        ))}
                    </div>
                  )
                })}
                {frozen && (
                  <span
                    className="wb-ml-baseline-caption"
                    style={{ left: x(delivery.stages[0].start) }}
                  >
                    原计划
                  </span>
                )}
              </div>
            )}
          </Fragment>
        )
      })}
    </>
  )
}
