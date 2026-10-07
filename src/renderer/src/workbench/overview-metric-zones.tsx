import { MessageSquarePlus } from 'lucide-react'
import { useMemo } from 'react'
import { OverviewGrain, OverviewRefresh } from './overview-controls'
import { useOverviewViewState } from './overview-view-state'
import type {
  MetricCatalog,
  MetricDefinition,
  MetricReading
} from '../../../shared/workbench/metrics'
import { MetricLineChart, type MetricChartSeries } from './overview-metric-chart'
import {
  groupZonePlots,
  numericTarget,
  splitSeriesByAxis,
  zoneBucketLabels,
  zoneChartRange,
  zonePointState,
  ZONE_LAG_COLOR,
  ZONE_LEAD_COLORS,
  ZONE_MAIN_TAB,
  type ZoneGranularity,
  type ZonePlot
} from './overview-zone-series'

export type MetricZoneGroup = { feature: string; defs: MetricDefinition[] }

/** Lagging/leading definitions grouped by their feature tab; empty feature = main tab. */
export function groupZoneDefs(catalog: MetricCatalog | null): MetricZoneGroup[] {
  const defs = (catalog?.definitions ?? []).filter((item) => item.role !== 'north_star')
  const groups = new Map<string, MetricDefinition[]>()
  for (const def of defs) {
    const key = def.feature.trim() || ZONE_MAIN_TAB
    const bucket = groups.get(key)
    if (bucket) {
      bucket.push(def)
    } else {
      groups.set(key, [def])
    }
  }
  return [...groups.entries()].map(([feature, grouped]) => ({ feature, defs: grouped }))
}

type ZoneRow = {
  def: MetricDefinition
  color: string
  values: (number | null)[]
  unit: string
  solid: boolean
  valueText: string
  statusText: string
  staleText: string | null
  readingNote: string | null
  failed: boolean
}

function buildRows(
  plot: ZonePlot,
  readings: Record<string, MetricReading | null>,
  labels: string[],
  range: ReturnType<typeof zoneChartRange>,
  timezone: string,
  busy: boolean
): ZoneRow[] {
  const defs = plot.lagging ? [plot.lagging, ...plot.leads] : plot.leads
  return defs.map((def, index) => {
    const state = zonePointState(readings[def.ref.definitionHash] ?? null, labels, range, timezone)
    const color =
      def.role === 'lagging'
        ? ZONE_LAG_COLOR
        : ZONE_LEAD_COLORS[(index - (plot.lagging ? 1 : 0)) % ZONE_LEAD_COLORS.length]
    return {
      def,
      color,
      values: state.kind === 'ready' ? state.values : labels.map(() => null),
      unit: def.unit,
      solid: def.role === 'lagging',
      valueText:
        state.kind === 'ready' && state.latest
          ? `${state.latest.value}${typeof state.latest.value === 'number' ? def.unit : ''}`
          : '—',
      failed: readings[def.ref.definitionHash]?.status === 'error',
      statusText:
        busy && state.kind !== 'ready'
          ? '正在读取…'
          : state.kind === 'unread'
            ? '未读取'
            : state.kind === 'unknown'
              ? `未知：${state.message}`
              : state.latest
                ? `采集于 ${state.latest.collectedAt}`
                : '本窗口无点',
      staleText:
        state.kind === 'unknown' && state.stale
          ? `陈旧读数 ${state.stale.value}（采集于 ${state.stale.collectedAt}）`
          : null,
      readingNote:
        state.kind === 'ready' && state.latest
          ? typeof state.latest.value === 'string'
            ? '文本读数，见指标详情'
            : null
          : null
    }
  })
}

function PlotCard({
  plot,
  rows,
  labels,
  hidden,
  busy,
  onToggle
}: {
  plot: ZonePlot
  rows: ZoneRow[]
  labels: string[]
  hidden: Record<string, boolean>
  busy: boolean
  onToggle(hash: string, next: boolean): void
}) {
  const series: MetricChartSeries[] = rows.map((row) => ({
    name: row.def.name,
    values: row.values,
    color: row.color,
    unit: row.unit,
    solid: row.solid,
    target: numericTarget(row.def.target),
    on: hidden[row.def.ref.definitionHash] !== true
  }))
  const charts = splitSeriesByAxis(series)
  const failures = rows.filter((row) => row.failed)
  return (
    <div className="wb-mz-plot">
      {charts.map((chart) => (
        <MetricLineChart
          key={chart[0]?.unit ?? ''}
          labels={labels}
          series={chart}
          legend
          onToggle={(name, visible) => {
            const row = rows.find((item) => item.def.name === name)
            if (row) {
              onToggle(row.def.ref.definitionHash, !visible)
            }
          }}
          emptyText={
            rows.find(
              (row) =>
                row.readingNote && chart.some((item) => item.on && item.name === row.def.name)
            )?.readingNote ?? (busy ? '正在读取指标…' : '本窗口暂无读数')
          }
          hiddenText="未选择指标"
          ariaLabel={`${plot.lagging?.name ?? '引领指标'} 趋势`}
        />
      ))}
      {!busy && failures.length > 0 && (
        <p className="wb-ov-alert" role="status">
          {failures.length} 项指标读取失败，详情中可查看原因
        </p>
      )}
      <details className="wb-mz-defs">
        <summary>指标详情</summary>
        {rows.map((row) => (
          <div key={row.def.ref.definitionHash} className="wb-mz-def">
            <strong>{row.def.name}</strong>
            <span className="wb-muted"> · {row.def.role === 'leading' ? '引领' : '滞后'}</span>
            <p>{row.def.def.trim() || '未提供定义'}</p>
            <p>
              最近读数 <b>{row.valueText}</b> · 长期目标 {row.def.target || '未设置'}
            </p>
            <p className="wb-muted">
              {row.statusText}
              {row.def.leads ? ` · 引领对象：${row.def.leads}` : ''}
            </p>
            {row.staleText && <p className="wb-mz-stale">{row.staleText}</p>}
          </div>
        ))}
      </details>
    </div>
  )
}

export function OverviewMetricZones({
  catalog,
  readings,
  busy,
  onRefresh,
  granularity,
  anchor,
  onGranularityChange,
  identity,
  setupBusy,
  onSetup
}: {
  catalog: MetricCatalog | null
  readings: Record<string, MetricReading | null>
  busy: boolean
  onRefresh(): void
  granularity: ZoneGranularity
  anchor?: string
  onGranularityChange(value: ZoneGranularity): void
  identity: string
  setupBusy: boolean
  onSetup(): void
}) {
  const groups = useMemo(() => groupZoneDefs(catalog), [catalog])
  const [view, setView] = useOverviewViewState(identity)
  const active = groups.find((group) => group.feature === view.feature) ?? groups[0]
  const timezone = catalog?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  const range = zoneChartRange(granularity, timezone, anchor)
  const labels = zoneBucketLabels(range)
  const plots = useMemo(() => (active ? groupZonePlots(active.defs) : []), [active])
  return (
    <section className="card wb-ov-section" id="metrics-zones" aria-label="业务指标">
      <header className="wb-ov-section-head">
        <h2>业务指标</h2>
        <nav className="tabs" role="tablist" aria-label="指标范围">
          {groups.map((group) => (
            <button
              key={group.feature}
              type="button"
              className="tab"
              role="tab"
              aria-selected={group.feature === active?.feature}
              onClick={() => setView({ feature: group.feature })}
            >
              {group.feature}
            </button>
          ))}
        </nav>
        <div className="wb-ov-tools">
          <OverviewGrain label="业务指标粒度" value={granularity} onChange={onGranularityChange} />
          <button
            type="button"
            className="wb-btn wb-btn-secondary wb-btn-sm"
            disabled={setupBusy}
            onClick={onSetup}
            title="新建会话，配置指标"
          >
            <MessageSquarePlus size={14} aria-hidden="true" /> 配置指标
          </button>
          <OverviewRefresh label="刷新业务指标" busy={busy} onClick={onRefresh} />
        </div>
      </header>
      <div className="wb-mz-plots">
        {plots.map((plot) => {
          const rows = buildRows(plot, readings, labels, range, timezone, busy)
          return (
            <PlotCard
              key={plot.lagging?.ref.definitionHash ?? plot.leads[0].ref.definitionHash}
              plot={plot}
              rows={rows}
              labels={labels}
              hidden={view.hidden}
              busy={busy}
              onToggle={(hash, next) => setView({ hidden: { ...view.hidden, [hash]: next } })}
            />
          )
        })}
        {!plots.length && (
          <p className="wb-muted">{catalog ? '尚未设置业务指标' : '指标目录未就绪'}</p>
        )}
      </div>
    </section>
  )
}
