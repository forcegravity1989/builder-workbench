import { useEffect, useState } from 'react'
import type { MetricsPort, MetricScope, MetricWindow } from '../../../../shared/workbench/metrics'
import { currentMetricWeek } from '../../../../shared/workbench/metric-windows'

export function useAcceptanceMetricWindow(port: MetricsPort, scope: MetricScope, needed: boolean) {
  const [refresh, setRefresh] = useState(0)
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
  }, [port, scope, needed, refresh])
  return { window, error, refresh: () => setRefresh((value) => value + 1) }
}
