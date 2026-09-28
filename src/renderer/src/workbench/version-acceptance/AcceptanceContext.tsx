import type { AcceptanceMaterial } from '../../../../shared/workbench/version-material'
import type { MetricWindow } from '../../../../shared/workbench/metrics'
import { AcceptanceMetricWindow } from './AcceptanceMetricWindow'

export function AcceptanceContext({
  document,
  hasMetrics,
  metricWindow,
  disabled,
  onPrepare
}: {
  document: AcceptanceMaterial
  hasMetrics: boolean
  metricWindow: {
    window: MetricWindow | null
    setWindow(value: MetricWindow): void
    error: string | null
  }
  disabled: boolean
  onPrepare(text: string): void
}) {
  const window = metricWindow.window
  return (
    <div className="va-context-row">
      <details className="va-source">
        <summary>
          {document.planRef.kind === 'draft' ? '草案预验收' : '固定计划'} ·{' '}
          {document.planRef.cycleId}
        </summary>
        <p>
          {document.planRef.kind === 'committed'
            ? document.planRef.sourceCommit
            : document.planRef.sourceWorktreeId}
        </p>
        <p>{document.planRef.revision}</p>
        <button
          className="wb-btn wb-btn-ghost wb-btn-sm"
          disabled={disabled}
          onClick={() =>
            onPrepare(
              `请核对当前 ${document.version} 验收固定计划与项目基线的新计划差异。先向我展示变化，由我明确是否换引用；保留原结果，更换后所有原结论待重新核对。`
            )
          }
        >
          核对计划更新
        </button>
      </details>
      {hasMetrics && (
        <details className="va-window-choice">
          <summary>
            指标取值 ·{' '}
            {window?.kind === 'current'
              ? '当前值'
              : window?.kind === 'range'
                ? `${window.since || '开始'} 至 ${window.until || '结束'}`
                : '待配置'}
          </summary>
          <AcceptanceMetricWindow
            window={window}
            onChange={metricWindow.setWindow}
            error={metricWindow.error}
            disabled={disabled}
          />
        </details>
      )}
    </div>
  )
}
