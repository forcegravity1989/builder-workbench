import { RefreshCw, Trash2 } from 'lucide-react'
import { MilestoneIconButton } from './milestone-icon-button'
import { timeLabel } from './version-overview/overview-time'
import {
  MilestonePlanPhases,
  type MilestoneFeature,
  type MilestoneDelivery
} from '../../../shared/monica/project-milestones'
import { plannedDay } from '../../../shared/monica/milestone-sdlc'
import {
  MILESTONE_DAY_WIDTH as width,
  type MilestoneGestureApi,
  type MilestoneGesture
} from './use-milestone-gesture'

export function MilestoneSdlcToolbar({
  showActual,
  onChange,
  editing,
  featureCount,
  ownerCount,
  totalCount,
  actual
}: {
  editing: boolean
  showActual: boolean
  onChange(value: boolean): void
  featureCount: number
  ownerCount: number
  totalCount: number
  actual: { loading: boolean; failed: boolean; readAt?: string; refresh(): void }
}) {
  return (
    <div className="monica-ml-sdlc-toolbar">
      <span className="monica-ml-counts">
        {featureCount} / {totalCount} 个特性 · {ownerCount} 位负责人
      </span>
      <div className="monica-ml-sdlc-options">
        {!showActual && (
          <div className="monica-ml-legend" aria-label="工作阶段图例">
            {MilestonePlanPhases.map((phase) => (
              <span key={phase}>
                <i className={`monica-phase-${phase.toLowerCase()}`} />
                {phase}
              </span>
            ))}
          </div>
        )}
        <label
          className="monica-ml-show-actual"
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
          <div className="monica-ml-actual-refresh" role="status">
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
  origin,
  end,
  range,
  enabled,
  gesture,
  remove,
  arrange
}: {
  feature: MilestoneFeature
  origin: number
  end: number
  range: { start: number; end: number }
  enabled: boolean
  gesture: MilestoneGestureApi
  remove(deliveryId: string): void
  arrange(delivery: MilestoneDelivery): void
}) {
  return (
    <>
      <div
        className="monica-ml-undated"
        style={{ left: Math.max(0, range.start - origin) * width }}
      >
        {feature.deliveries
          .filter((d) => !d.timeWindow)
          .map((d) => (
            <span key={d.id} className="monica-ml-undated-period">
              <button disabled={!enabled} title={`安排 ${d.phase}`} onClick={() => arrange(d)}>
                {d.phase} · 未记录日期
              </button>
              {enabled && d.phase === 'Maintain' && (
                <MilestoneIconButton label="删除此段 Maintain" onClick={() => remove(d.id)}>
                  <Trash2 size={13} />
                </MilestoneIconButton>
              )}
            </span>
          ))}
      </div>
      {feature.deliveries.map((delivery) => {
        const window = delivery.timeWindow
        if (!window) {
          return null
        }
        const start = plannedDay(window.start),
          finish = plannedDay(window.end)
        const left = Math.max(start, origin),
          right = Math.min(finish, end + 1)
        if (right <= left) {
          return null
        }
        const operation: MilestoneGesture = {
          kind: 'delivery',
          id: feature.id,
          deliveryId: delivery.id,
          mode: 'move'
        }
        const label = `${feature.title} ${delivery.phase} · ${window.start.replace('T', ' ')} — ${window.end.replace('T', ' ')}`
        const visibleStart = Math.max(left, range.start),
          visibleEnd = Math.min(right, range.end)
        return (
          <div
            key={delivery.id}
            className={`monica-ml-delivery${enabled ? ' editable' : ''}`}
            data-delivery-id={delivery.id}
            style={{ left: (left - origin) * width, width: (right - left) * width }}
          >
            <button
              className={`monica-ml-delivery-body monica-phase-${delivery.phase.toLowerCase()}`}
              aria-label={label}
              title={label + (enabled ? '；拖动移动，两端调整日期，可跨版本' : '')}
              onPointerDown={enabled ? (e) => gesture.begin(e, operation) : undefined}
              onKeyDown={enabled ? (e) => gesture.keyboard(e, operation) : undefined}
            >
              <b
                className="monica-ml-phase-label"
                style={{
                  left: (visibleStart - left) * width,
                  width: Math.max(0, visibleEnd - visibleStart) * width
                }}
              >
                {delivery.phase}
              </b>
            </button>
            {enabled && delivery.phase === 'Maintain' && visibleEnd > visibleStart && (
              <div
                className="monica-ml-delivery-tools"
                style={{ left: ((visibleStart + visibleEnd) / 2 - left) * width }}
              >
                <MilestoneIconButton
                  label="删除此段 Maintain"
                  className="monica-ml-maintain-delete"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    e.currentTarget
                      .closest('[data-milestone-feature]')
                      ?.querySelector<HTMLButtonElement>('[aria-label="添加 Maintain"]')
                      ?.focus({ preventScroll: true })
                    remove(delivery.id)
                  }}
                >
                  <Trash2 size={13} />
                </MilestoneIconButton>
              </div>
            )}
            {enabled &&
              (['start', 'end'] as const)
                .filter((edge) => (edge === 'start' ? start >= origin : finish <= end + 1))
                .map((edge) => (
                  <button
                    key={edge}
                    className={`monica-ml-resize ${edge}`}
                    aria-label={`${feature.title} ${delivery.phase} ${edge === 'start' ? '开始' : '结束'}：拖动或方向键调整半天`}
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
