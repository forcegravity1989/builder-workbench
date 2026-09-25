import { useEffect, useState } from 'react'
import type { MetricsPort, MetricScope, MetricWindow } from '../../../../shared/workbench/metrics'

export function useAcceptanceMetricWindow(port: MetricsPort, scope: MetricScope, needed: boolean) {
  const [window, setWindow] = useState<MetricWindow | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!needed) {
      return
    }
    let current = true
    setWindow(null)
    void port
      .list(scope)
      .then((catalog) => {
        if (current) {
          setWindow({ kind: 'current', timezone: catalog.timezone })
          setError(null)
        }
      })
      .catch((reason) => {
        if (current) {
          setError(`无法读取项目指标时区：${String(reason)}`)
        }
      })
    return () => {
      current = false
    }
  }, [port, scope, needed])
  return { window, setWindow, error }
}

export function AcceptanceMetricWindow({
  window,
  onChange,
  disabled,
  error
}: {
  window: MetricWindow | null
  onChange(value: MetricWindow): void
  disabled: boolean
  error: string | null
}) {
  if (!window) {
    return <p className="va-warning">{error ?? '正在读取项目指标配置…'}</p>
  }
  return (
    <div className="va-window">
      <label>
        指标取值
        <select
          aria-label="指标取值范围"
          value={window.kind}
          disabled={disabled}
          onChange={(event) =>
            onChange(
              event.target.value === 'current'
                ? { kind: 'current', timezone: window.timezone }
                : {
                    kind: 'range',
                    since: '',
                    until: '',
                    timezone: window.timezone,
                    granularity: 'week'
                  }
            )
          }
        >
          <option value="current">当前值</option>
          <option value="range">指定历史区间</option>
        </select>
      </label>
      {window.kind === 'range' && (
        <>
          <input
            type="date"
            disabled={disabled}
            aria-label="区间开始"
            value={window.since}
            onChange={(event) => onChange({ ...window, since: event.target.value })}
          />
          <input
            type="date"
            disabled={disabled}
            aria-label="区间结束（不含）"
            value={window.until}
            onChange={(event) => onChange({ ...window, until: event.target.value })}
          />
        </>
      )}
      <span>{window.timezone}</span>
    </div>
  )
}
