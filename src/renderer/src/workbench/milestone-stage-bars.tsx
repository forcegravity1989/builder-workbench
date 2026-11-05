import { RefreshCw } from 'lucide-react'
import { MilestoneIconButton } from './milestone-icon-button'
import { timeLabel } from './version-overview/overview-time'
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

export function MilestoneSdlcToolbar({
  showActual,
  onChange,
  editing,
  warning,
  featureCount,
  ownerCount,
  actual
}: {
  editing: boolean
  showActual: boolean
  onChange(value: boolean): void
  warning?: string
  featureCount: number
  ownerCount: number
  actual: { loading: boolean; failed: boolean; readAt?: string; refresh(): void }
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
        {!showActual && (
          <div className="wb-ml-legend" aria-label="SDLC 阶段图例">
            {MilestonePhases.map((phase) => (
              <span key={phase}>
                <i className={`wb-phase-${phase.toLowerCase()}`} />
                {phase}
              </span>
            ))}
          </div>
        )}
        <label
          className="wb-ml-show-actual"
          data-contextual-tour-target={editing && showActual ? 'milestone-start' : undefined}
        >
          <input
            type="checkbox"
            checked={showActual}
            onChange={(e) => onChange(e.target.checked)}
          />
          显示实际
        </label>
        {showActual && (
          <div className="wb-ml-actual-refresh" role="status">
            <span>
              {actual.failed
                ? `本次未读取到${actual.readAt ? ` · 保留 ${timeLabel(actual.readAt)} 数据` : ''}，请到版本总览查看`
                : actual.loading
                  ? '正在读取…'
                  : '实际：已归档目标验收结果'}
            </span>
            <MilestoneIconButton
              label="刷新实际结果"
              onClick={actual.refresh}
              disabled={actual.loading}
            >
              <RefreshCw size={13} className={actual.loading ? 'animate-spin' : undefined} />
            </MilestoneIconButton>
          </div>
        )}
      </div>
    </div>
  )
}

export function MilestoneStageBars({
  feature,
  versions,
  origin,
  enabled,
  gesture
}: {
  feature: MilestoneFeature
  versions: ScheduledVersion[]
  origin: number
  enabled: boolean
  gesture: MilestoneGestureApi
}) {
  const x = (time: string) => (plannedDay(time) - origin) * width
  return (
    <>
      <svg className="wb-ml-connection" aria-hidden="true">
        {feature.deliveries.slice(1).map((d, i) => {
          const previous = milestoneDeliveryWindow(feature.deliveries[i], versions),
            current = milestoneDeliveryWindow(d, versions)
          return previous && current && x(current.start) > x(previous.end) ? (
            <path key={d.id} d={`M ${x(previous.end)} 45 H ${x(current.start)}`} />
          ) : null
        })}
      </svg>
      {feature.deliveries.map((delivery, index) => {
        const window = milestoneDeliveryWindow(delivery, versions)
        if (!window) {
          return null
        }
        const left = x(window.start),
          pixels = x(window.end) - left
        const operation: MilestoneGesture = {
          kind: 'delivery',
          id: feature.id,
          deliveryId: delivery.id,
          mode: 'move'
        }
        const label = `${feature.title} · ${delivery.version.version} · ${index > 0 ? '维护' : '上线'} · ${window.start.replace('T', ' ')} — ${window.end.replace('T', ' ')}`
        return (
          <div
            key={delivery.id}
            className={`wb-ml-delivery${enabled ? ' editable' : ''}${!delivery.stages.length ? ' unrecorded' : ''}`}
            style={{ left, width: pixels }}
          >
            <button
              className="wb-ml-delivery-body"
              title={
                enabled
                  ? `${label}；${delivery.stages.length ? '拖动整体或左右键换版本，两端调整时长' : '拖动重新安排，按整段生成默认阶段'}`
                  : label
              }
              aria-label={label}
              onPointerDown={enabled ? (e) => gesture.begin(e, operation) : undefined}
              onKeyDown={enabled ? (e) => gesture.keyboard(e, operation) : undefined}
            >
              {!delivery.stages.length && (
                <span className="wb-ml-unrecorded-label" style={{ width: pixels }}>
                  阶段未记录
                </span>
              )}
              {delivery.stages.map((s) => {
                const size = x(s.end) - x(s.start)
                return (
                  <span
                    key={s.phase}
                    className={`wb-phase-${s.phase.toLowerCase()}`}
                    style={{ left: x(s.start) - left, width: size }}
                  >
                    {size >= 38 ? s.phase : s.phase.slice(0, s.phase === 'Deploy' ? 2 : 1)}
                  </span>
                )
              })}
            </button>
            {enabled &&
              (['start', 'end'] as const).map((edge) => (
                <button
                  key={edge}
                  className={`wb-ml-resize ${edge}`}
                  aria-label={`${feature.title} ${edge === 'start' ? '开始' : '结束'}：拖动或方向键调整半天`}
                  onPointerDown={(e) => gesture.begin(e, { ...operation, mode: edge })}
                  onKeyDown={(e) => gesture.keyboard(e, { ...operation, mode: edge })}
                />
              ))}
          </div>
        )
      })}
    </>
  )
}
