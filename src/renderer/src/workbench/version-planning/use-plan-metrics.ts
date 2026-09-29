import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  metricRefKey,
  type MetricCatalog,
  type MetricReading,
  type MetricRef,
  type MetricScope
} from '../../../../shared/workbench/metrics'
import { nativeMetricsPort } from '../metrics-port'
import { currentMetricWeek } from '../../../../shared/workbench/metric-windows'
import type { PlanningMaterial } from '../../../../shared/workbench/version-material'

export function usePlanMetrics(
  scope: MetricScope | null,
  owner: string | undefined,
  plan?: PlanningMaterial
) {
  const port = useMemo(() => nativeMetricsPort(owner), [owner])
  const epoch = useRef({ value: 0 })
  const catalogRequest = useRef(0)
  const requests = useRef(new Map<string, number>())
  const collecting = useRef(new Set<string>())
  const [catalog, setCatalog] = useState<MetricCatalog | null>(null)
  const [values, setValues] = useState<Record<string, MetricReading>>({})
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const lifetime = epoch.current
    const generation = ++lifetime.value
    const listing = ++catalogRequest.current
    collecting.current.clear()
    setCatalog(null)
    setValues({})
    setError(null)
    if (scope) {
      void port.list(scope).then(
        (result) => {
          if (generation === epoch.current.value && listing === catalogRequest.current) {
            setCatalog(result)
          }
        },
        (reason) => {
          if (generation === epoch.current.value && listing === catalogRequest.current) {
            setError(String(reason))
          }
        }
      )
    }
    return () => {
      lifetime.value++
    }
  }, [port, scope])
  const read = useCallback(
    async (ref: MetricRef, refresh = false) => {
      if (!scope || !catalog) {
        return
      }
      const generation = epoch.current.value
      const listing = refresh ? ++catalogRequest.current : catalogRequest.current
      const key = metricRefKey(ref)
      if (!refresh && collecting.current.has(key)) {
        return
      }
      if (refresh) {
        collecting.current.add(key)
      }
      const request = (requests.current.get(key) ?? 0) + 1
      requests.current.set(key, request)
      // The previous reading no longer represents a successful current refresh.
      setValues((current) => ({
        ...current,
        [key]: { status: 'unknown', reason: { code: 'reading', message: '正在读取' } }
      }))
      let value: MetricReading
      try {
        const nextCatalog = refresh ? await port.list(scope) : catalog
        if (generation !== epoch.current.value) {
          return
        }
        const definition = nextCatalog.definitions.find((item) => item.name === ref.name)
        if (!definition) {
          throw new Error('当前目录没有此指标，请选择其他指标或配置脚本')
        }
        value = await port[refresh ? 'refresh' : 'read']({
          scope,
          ref: definition.ref,
          window: currentMetricWeek(nextCatalog.timezone)
        })
        if (refresh && generation === epoch.current.value && listing === catalogRequest.current) {
          setCatalog(nextCatalog)
        }
      } catch (reason) {
        value = { status: 'error', reason: { code: 'read-failed', message: String(reason) } }
      }
      if (generation === epoch.current.value && requests.current.get(key) === request) {
        if (refresh) {
          collecting.current.delete(key)
        }
        setValues((current) => ({ ...current, [key]: value }))
      }
    },
    [port, scope, catalog]
  )
  const referenceKey = JSON.stringify([
    ...new Map(
      plan?.goals.flatMap((goal) =>
        goal.metricTargets.map((target) => [metricRefKey(target.ref), target.ref] as const)
      ) ?? []
    ).values()
  ])
  const references = useMemo(() => JSON.parse(referenceKey) as MetricRef[], [referenceKey])
  useEffect(() => {
    if (catalog) {
      for (const ref of references) {
        void read(ref)
      }
    }
  }, [catalog, references, read])
  const readings = references.flatMap((ref) => {
    const value = values[metricRefKey(ref)]
    return value?.status === 'ready' ? value.readings : []
  })
  async function reloadCatalog() {
    if (!scope) {
      return
    }
    const generation = epoch.current.value
    const listing = ++catalogRequest.current
    try {
      const next = await port.list(scope)
      if (generation === epoch.current.value && listing === catalogRequest.current) {
        setCatalog(next)
        setError(null)
      }
    } catch (reason) {
      if (generation === epoch.current.value && listing === catalogRequest.current) {
        setError(String(reason))
      }
    }
  }
  return {
    catalog,
    values,
    readings,
    error,
    reloadCatalog,
    refresh: (ref: MetricRef) => read(ref, true)
  }
}
