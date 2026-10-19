import { useEffect, useMemo, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import type {
  MetricReading,
  MetricRef,
  MetricsPort,
  MetricScope
} from '../../../../shared/workbench/metrics'
import { currentMetricWeek } from '../../../../shared/workbench/metric-windows'
import type {
  MetricReadingEvidence,
  VersionGoal
} from '../../../../shared/workbench/version-material'
import { MetricEvidenceView } from '../metrics/MetricEvidenceView'

export function AcceptanceMetrics({
  goal,
  materialKey,
  readings,
  port,
  scope,
  disabled,
  onReadings
}: {
  goal: VersionGoal
  materialKey: string
  readings: MetricReadingEvidence[]
  port: MetricsPort
  scope: MetricScope
  disabled: boolean
  onReadings(ref: MetricRef, readings: MetricReadingEvidence[]): void
}) {
  const namesKey = JSON.stringify([
    ...new Set([
      ...goal.metricTargets.map((target) => target.ref.name),
      ...readings.map((reading) => reading.ref.name)
    ])
  ])
  const names = useMemo(() => JSON.parse(namesKey) as string[], [namesKey])
  const identity = JSON.stringify([materialKey, scope, goal.goalId, namesKey, disabled])
  const latest = useRef(identity)
  latest.current = identity
  const requests = useRef(new Map<string, number>())
  const [values, setValues] = useState<Record<string, MetricReading>>({})
  const [busy, setBusy] = useState<string | null>(null)
  useEffect(() => {
    setValues({})
    setBusy(null)
    requests.current.clear()
  }, [identity])
  async function refresh(name: string) {
    if (disabled || busy) {
      return
    }
    const token = (requests.current.get(name) ?? 0) + 1
    requests.current.set(name, token)
    const current = () => latest.current === identity && requests.current.get(name) === token
    setBusy(name)
    try {
      const catalog = await port.list(scope)
      const definition = catalog.definitions.find((item) => item.name === name)
      if (!definition) {
        throw new Error('当前目录没有此指标，请在会话中核对指标配置。')
      }
      const value = await port.refresh({
        scope,
        ref: definition.ref,
        window: currentMetricWeek(catalog.timezone)
      })
      if (!current()) {
        return
      }
      setValues((previous) => ({ ...previous, [name]: value }))
      if (value.status === 'ready') {
        onReadings(definition.ref, value.readings)
      }
    } catch (reason) {
      if (current()) {
        setValues((previous) => ({
          ...previous,
          [name]: {
            status: 'error',
            reason: { code: 'read-failed', message: String(reason) }
          }
        }))
      }
    } finally {
      if (current()) {
        setBusy(null)
      }
    }
  }
  if (!names.length) {
    return null
  }
  return (
    <div className="vp-metrics">
      {names.map((name) => {
        const targets = goal.metricTargets.filter((item) => item.ref.name === name)
        const target = targets.length === 1 ? targets[0] : undefined
        const saved = readings.filter((reading) => reading.ref.name === name)
        const value = values[name]
        const actual = value && value.status !== 'ready' ? [] : saved
        const reading = actual.length === 1 ? actual[0] : null
        return (
          <div className="vp-metric" key={name}>
            <div className="vp-metric-row">
              <strong className="vp-metric-name">{name}</strong>
              {target && <span>目标 {target.target || '待明确'}</span>}
              <div className="vp-metric-value">
                <span>实际</span>
                <strong>{reading ? `${reading.value}${reading.unit}` : '—'}</strong>
              </div>
              <button
                className="wb-btn wb-btn-sm"
                disabled={disabled || busy !== null}
                onClick={() => void refresh(name)}
              >
                <RefreshCw size={14} />
                {busy === name ? '读取中…' : '刷新指标'}
              </button>
            </div>
            {targets.length > 1 && (
              <div className="va-warning">
                <p>同名指标有 {targets.length} 份承诺，无法唯一比较。请在计划会话核对。</p>
                <ul>
                  {targets.map((item, index) => (
                    <li key={index}>
                      目标 {index + 1}：{item.target || '待明确'}
                      {item.baseline && ` · 计划基线：${item.baseline.value}${item.baseline.unit}`}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {busy !== name && value && value.status !== 'ready' && (
              <p className="va-warning">{value.reason.message}</p>
            )}
            <details className="vp-metric-evidence">
              <summary>采集依据</summary>
              {target?.baseline && (
                <p>
                  计划基线：{target.baseline.value}
                  {target.baseline.unit}
                </p>
              )}
              <MetricEvidenceView
                result={value?.status === 'ready' ? undefined : value}
                saved={saved}
                busy={busy === name}
              />
            </details>
          </div>
        )
      })}
    </div>
  )
}
