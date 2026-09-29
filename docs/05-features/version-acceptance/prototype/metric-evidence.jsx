import { React } from 'react'
import { ChartNoAxesCombined, RefreshCw } from 'lucide-react'
import { metrics } from '../../version-planning/prototype/snapshot.js'

const sampleWindow = { since: '2026-09-21', until: '2026-09-28', granularity: 'week' }
export function acceptanceMetric(goal) {
  return metrics.find((item) => item.id === (goal.acceptanceMetricId ?? goal.metricId))
}
export function acceptanceWindow(goal) {
  return goal.acceptanceMetricWindow ?? sampleWindow
}
export function AcceptanceMetricEvidence({ goal, updateResult, refreshMetrics, onWindowChange }) {
  const planned = metrics.find((item) => item.id === goal.metricId)
  const selected = acceptanceMetric(goal)
  const window = acceptanceWindow(goal)
  const invalid = !window.since || !window.until || window.since >= window.until
  return (
    <div className="acceptance-metric-evidence">
      {planned && (
        <p className="acceptance-metric-plan">
          计划约定：{planned.name} · 目标 {goal.target || '未约定'} · 基线{' '}
          {goal.metricBaseline ?? '—'}
        </p>
      )}
      <div className="metric-row acceptance-metric">
        <label>
          <ChartNoAxesCombined />
          <select
            aria-label={`${goal.label} 验收指标`}
            value={selected?.id || ''}
            onChange={(event) => updateResult(goal.id, 'acceptanceMetricId', event.target.value)}
          >
            <option value="">选择验收指标（可选）</option>
            {metrics
              .filter((item) => item.kind === 'script')
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
          </select>
        </label>
        {selected && (
          <>
            <div className="metric-value">
              <span>实测</span>
              <strong>—</strong>
            </div>
            <button
              className="btn btn-secondary metric-collect"
              disabled={invalid}
              aria-label={`${goal.label} 刷新实测`}
              onClick={refreshMetrics}
            >
              <RefreshCw />
              刷新实测
            </button>
          </>
        )}
      </div>
      {selected && (
        <details className="acceptance-metric-source">
          <summary>
            取值区间与口径 · {window.since || '开始'} 至 {window.until || '结束'}
          </summary>
          <div className="acceptance-metric-window">
            <select
              className="input"
              aria-label={`${goal.label} 采集粒度`}
              value={window.granularity}
              onChange={(event) => onWindowChange({ ...window, granularity: event.target.value })}
            >
              <option value="day">按日</option>
              <option value="week">按周</option>
            </select>
            <label>
              开始
              <input
                type="date"
                className="input"
                aria-label={`${goal.label} 区间开始`}
                value={window.since}
                onChange={(event) => onWindowChange({ ...window, since: event.target.value })}
              />
            </label>
            <label>
              结束（不含）
              <input
                type="date"
                className="input"
                aria-label={`${goal.label} 区间结束（不含）`}
                value={window.until}
                onChange={(event) => onWindowChange({ ...window, until: event.target.value })}
              />
            </label>
          </div>
          {invalid && (
            <p className="metric-window-error" role="alert">
              请选择有效区间，开始日期须早于结束日期。
            </p>
          )}
          <p>{selected.definition}</p>
          <p>采集来源：尚未取得 · 读数：尚未采集</p>
        </details>
      )}
    </div>
  )
}
