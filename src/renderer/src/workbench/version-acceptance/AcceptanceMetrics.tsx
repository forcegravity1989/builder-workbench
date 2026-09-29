import { useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import {
  MetricWindowSchema,
  type MetricCatalog,
  type MetricReading,
  type MetricRef,
  type MetricsPort,
  type MetricScope,
  type MetricWindow
} from '../../../../shared/workbench/metrics'
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
  window,
  disabled,
  onReadings
}: {
  goal: VersionGoal
  materialKey: string
  readings: MetricReadingEvidence[]
  port: MetricsPort
  scope: MetricScope
  window: MetricWindow | null
  disabled: boolean
  onReadings(ref: MetricRef, readings: MetricReadingEvidence[]): void
}) {
  const [catalog, setCatalog] = useState<MetricCatalog | null>(null)
  const [selected, setSelected] = useState('')
  const [result, setResult] = useState<MetricReading | undefined>()
  const [busy, setBusy] = useState(false)
  const identity = JSON.stringify([materialKey, scope, goal.goalId, window, disabled])
  const latest = useRef(identity)
  latest.current = identity
  const sequence = useRef(0)
  useEffect(() => {
    let active = true
    const requests = sequence
    const token = ++requests.current
    setCatalog(null)
    setSelected('')
    setResult(undefined)
    setBusy(false)
    void port.list(scope).then(
      (value) => {
        if (active && token === requests.current) {
          setCatalog(value)
        }
      },
      (error) => {
        if (active && token === requests.current) {
          setResult({ status: 'error', reason: { code: 'catalog-failed', message: String(error) } })
        }
      }
    )
    return () => {
      active = false
      requests.current++
    }
  }, [port, scope, materialKey, goal.goalId])
  const name =
    selected ||
    catalog?.definitions.find((item) => item.name === goal.metricTargets[0]?.ref.name)?.name ||
    catalog?.definitions[0]?.name ||
    ''
  async function refresh(collect: boolean) {
    const token = ++sequence.current
    const current = () => token === sequence.current && identity === latest.current
    setBusy(true)
    setResult(undefined)
    try {
      const next = await port.list(scope)
      if (!current()) {
        return
      }
      setCatalog(next)
      if (!collect) {
        return
      }
      const definition = next.definitions.find((item) => item.name === name)
      if (!definition) {
        throw new Error('请选择当前目录中的指标')
      }
      const value = await port.refresh({
        scope,
        ref: definition.ref,
        window: MetricWindowSchema.parse(window)
      })
      if (!current()) {
        return
      }
      setResult(value)
      if (value.status === 'ready') {
        const previous = readings.find((item) => item.ref.name === definition.name)
        onReadings(previous?.ref ?? definition.ref, value.readings)
      }
    } catch (error) {
      if (current()) {
        setResult({ status: 'error', reason: { code: 'read-failed', message: String(error) } })
      }
    } finally {
      if (token === sequence.current) {
        setBusy(false)
      }
    }
  }
  return (
    <div className="va-metric">
      {goal.metricTargets.map((target) => (
        <p key={target.ref.name}>
          {target.ref.name} · 计划目标 {target.target || '未填写'}
          {target.baseline && (
            <>
              {' '}
              · 计划基线 {target.baseline.value}
              {target.baseline.unit}
            </>
          )}
        </p>
      ))}
      <div className="va-metric-controls">
        <select
          aria-label={`${goal.title || '目标'} 验收指标`}
          value={name}
          disabled={disabled || busy}
          onChange={(event) => {
            sequence.current++
            setSelected(event.target.value)
            setResult(undefined)
          }}
        >
          <option value="">选择验收指标</option>
          {catalog?.definitions.map((item) => (
            <option key={item.name} value={item.name}>
              {item.name}
            </option>
          ))}
        </select>
        <button
          className="wb-btn wb-btn-secondary wb-btn-sm"
          disabled={disabled || busy}
          onClick={() => void refresh(false)}
          title="刷新指标目录"
          aria-label="刷新指标目录"
        >
          <RefreshCw size={14} />
        </button>
        <button
          className="wb-btn wb-btn-secondary wb-btn-sm"
          disabled={disabled || busy || !name || !MetricWindowSchema.safeParse(window).success}
          onClick={() => void refresh(true)}
        >
          {busy ? '读取中…' : '采集'}
        </button>
      </div>
      {catalog?.problems.map((problem) => (
        <p
          className="va-warning"
          key={JSON.stringify([problem.name, problem.code, problem.message])}
        >
          {problem.name ? `${problem.name}：` : ''}
          {problem.message}
        </p>
      ))}
      {result && result.status !== 'ready' && <p className="va-warning">{result.reason.message}</p>}
      {[...new Set(readings.map((reading) => reading.ref.name))].map((metric) => (
        <div key={metric}>
          <strong>{metric}</strong>
          <MetricEvidenceView saved={readings.filter((reading) => reading.ref.name === metric)} />
        </div>
      ))}
    </div>
  )
}
