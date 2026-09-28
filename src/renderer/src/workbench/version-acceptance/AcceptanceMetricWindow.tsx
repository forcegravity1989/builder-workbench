import { useEffect, useState } from 'react'
import type { MetricsPort, MetricScope, MetricWindow } from '../../../../shared/workbench/metrics'
import { MetricWindowSchema } from '../../../../shared/workbench/metrics'
import { currentMetricWeek } from '../../../../shared/workbench/metric-windows'

function windowError(window: MetricWindow): string | null {
  const checked = MetricWindowSchema.safeParse(window)
  if (checked.success) {
    return null
  }
  if (checked.error.issues.some((issue) => issue.path.includes('timezone'))) {
    return '项目时区无效，请检查指标配置。'
  }
  if (
    checked.error.issues.some(
      (issue) => issue.path.includes('since') || issue.path.includes('until')
    )
  ) {
    return '请选择有效的开始和结束日期，结束日期不包含在区间内。'
  }
  return checked.error.issues
    .map((issue) =>
      issue.message === 'Window must be left-closed, right-open'
        ? '开始日期应早于结束日期，结束日期不包含在区间内。'
        : issue.message
    )
    .join('；')
}

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
          setWindow(currentMetricWeek(catalog.timezone))
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
  const invalid = windowError(window)
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
                    granularity: 'day'
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
          <select
            aria-label="指标采集粒度"
            disabled={disabled}
            value={window.granularity}
            onChange={(event) =>
              onChange({ ...window, granularity: event.target.value === 'week' ? 'week' : 'day' })
            }
          >
            <option value="day">按日</option>
            <option value="week">按周</option>
          </select>
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
      {invalid && (
        <p className="va-warning" role="alert">
          {invalid}
        </p>
      )}
    </div>
  )
}
