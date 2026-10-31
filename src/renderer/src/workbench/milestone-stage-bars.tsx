import { Fragment } from 'react'
import {
  MilestonePhases,
  type MilestoneFeature,
  type ScheduledVersion
} from '../../../shared/workbench/project-milestones'
import { milestoneDeliveryWindow } from '../../../shared/workbench/milestone-delivery-window'
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

export function MilestoneSdlcToolbar({
  showPlan,
  onChange,
  warning,
  featureCount,
  ownerCount
}: {
  showPlan: boolean
  onChange(value: boolean): void
  warning?: string
  featureCount: number
  ownerCount: number
}) {
  return (
    <div className="wb-ml-sdlc-toolbar">
      <span className="wb-ml-counts">
        {featureCount} 个特性 · {ownerCount} 位负责人
      </span>
      {warning && (
        <span className="wb-ml-drag-warning" role="status">
          {warning}
        </span>
      )}
      <div className="wb-ml-sdlc-options">
        <MilestoneLegend />
        <label className="wb-ml-show-plan">
          <input type="checkbox" checked={showPlan} onChange={(e) => onChange(e.target.checked)} />
          显示计划
        </label>
      </div>
    </div>
  )
}

export function MilestoneStageBars({
  feature,
  versions,
  origin,
  enabled,
  started,
  showPlan,
  gesture
}: {
  feature: MilestoneFeature
  versions: ScheduledVersion[]
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
          if (!d.stages.length || !feature.deliveries[i].stages.length) {
            return null
          }
          const previous = milestoneDeliveryWindow(feature.deliveries[i], versions),
            current = milestoneDeliveryWindow(d, versions)
          if (!previous || !current) {
            return null
          }
          const left = x(previous.end),
            right = x(current.start)
          return right > left ? <path key={d.id} d={`M ${left} 45 H ${right}`} /> : null
        })}
      </svg>
      {feature.deliveries.map((delivery) => {
        const window = milestoneDeliveryWindow(delivery, versions)
        if (!window) {
          return null
        }
        if (!delivery.stages.length) {
          return (
            <div
              key={delivery.id}
              className="wb-ml-unrecorded"
              style={{ left: x(window.start), width: x(window.end) - x(window.start) }}
              title={`${delivery.version.version} · 仅表示版本归属，未记录 SDLC 阶段时间`}
            >
              阶段未记录
            </div>
          )
        }
        const frozen = started.has(delivery.version.cycleId),
          editable = enabled && !frozen
        const hasFirstDelivery = gesture.hasFirstDelivery(delivery.version.cycleId)
        return (
          <Fragment key={delivery.id}>
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
                  const move: MilestoneGesture =
                    s.phase === 'Maintain'
                      ? { kind: 'version', id: delivery.version.cycleId, mode: 'move' }
                      : operation
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
                        onPointerDown={editable ? (e) => gesture.begin(e, move) : undefined}
                        onKeyDown={editable ? (e) => gesture.keyboard(e, move) : undefined}
                      >
                        <span>
                          {pixels >= 38 ? s.phase : s.phase.slice(0, s.phase === 'Deploy' ? 2 : 1)}
                        </span>
                      </button>
                      {editable &&
                        (s.phase !== 'Maintain' || !hasFirstDelivery) &&
                        (['start', 'end'] as const).map((edge) => (
                          <button
                            key={edge}
                            className={`wb-ml-resize ${edge}`}
                            aria-label={`${s.phase} ${edge === 'start' ? '开始' : '结束'}：拖动或方向键调整${s.phase === 'Maintain' ? '一天' : '半天'}`}
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
