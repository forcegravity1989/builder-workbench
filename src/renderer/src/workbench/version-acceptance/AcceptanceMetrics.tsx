import { useEffect, useRef, useState } from 'react'
import { metricRefKey, MetricWindowSchema } from '../../../../shared/workbench/metrics'
import type {
  MetricReading,
  MetricRef,
  MetricsPort,
  MetricScope,
  MetricWindow
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
  const [results, setResults] = useState<Record<string, MetricReading>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const sourceKey = JSON.stringify([materialKey, goal, scope, window, disabled])
  const latestKey = useRef(sourceKey)
  latestKey.current = sourceKey
  const request = useRef({ sequence: 0 }).current
  useEffect(() => {
    setResults({})
    setBusy(null)
    return () => {
      request.sequence++
    }
  }, [sourceKey, port, request])
  async function refresh(index: number) {
    if (!window || disabled || !MetricWindowSchema.safeParse(window).success) {
      return
    }
    const target = goal.metricTargets[index]
    const key = metricRefKey(target.ref)
    const token = ++request.sequence
    const current = () => token === request.sequence && latestKey.current === sourceKey
    setBusy(key)
    try {
      const value = await port.refresh({ scope, ref: target.ref, window })
      if (!current()) {
        return
      }
      setResults((current) => ({ ...current, [key]: value }))
      if (value.status === 'ready') {
        onReadings(target.ref, value.readings)
      }
    } catch (error) {
      if (!current()) {
        return
      }
      setResults((current) => ({
        ...current,
        [key]: {
          status: 'error',
          reason: {
            code: 'read-failed',
            message: error instanceof Error ? error.message : String(error)
          }
        }
      }))
    } finally {
      if (current()) {
        setBusy(null)
      }
    }
  }
  return (
    <>
      {goal.metricTargets.map((target, index) => {
        const key = metricRefKey(target.ref)
        const result = results[key]
        const evidence = readings.filter(
          (item) =>
            item.ref.name === target.ref.name &&
            item.ref.definitionHash === target.ref.definitionHash &&
            item.ref.configurationCommit === target.ref.configurationCommit
        )
        const freshlyRead =
          result?.status === 'ready' && JSON.stringify(result.readings) === JSON.stringify(evidence)
        const visibleResult: MetricReading | undefined =
          result?.status === 'ready'
            ? freshlyRead
              ? result
              : undefined
            : result
              ? { status: result.status, reason: result.reason, run: result.run }
              : undefined
        return (
          <div className="va-metric" key={`${target.ref.name}:${target.ref.definitionHash}`}>
            <span>
              {target.ref.name} · 本版目标 {target.target}
            </span>
            <span>
              {freshlyRead || !evidence.length ? '实测' : '已存读数'}{' '}
              {evidence.length
                ? evidence.map((item) => `${item.value} ${item.unit}`).join('；')
                : '未知'}
            </span>
            <button
              className="wb-btn wb-btn-ghost wb-btn-sm"
              disabled={disabled || busy !== null || !MetricWindowSchema.safeParse(window).success}
              onClick={() => void refresh(index)}
            >
              {busy === key ? '采集中…' : '刷新实测'}
            </button>
            {(evidence.length > 0 || (visibleResult && visibleResult.status !== 'ready')) && (
              <details open={Boolean(visibleResult && visibleResult.status !== 'ready')}>
                <summary>
                  {visibleResult?.status === 'error'
                    ? '本次采集失败'
                    : visibleResult?.status === 'unknown'
                      ? '本次无有效读数'
                      : '读数来源与时间'}
                </summary>
                <MetricEvidenceView result={visibleResult} saved={evidence} />
              </details>
            )}
          </div>
        )
      })}
    </>
  )
}
