import { useMemo, useState, type CSSProperties } from 'react'
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
  fill: boolean
  valueText: string
  statusText: string
  staleText: string | null
  currentOnly: boolean
  plottable: boolean
}

function buildRows(
  plot: ZonePlot,
  readings: Record<string, MetricReading | null>,
  labels: string[],
  range: ReturnType<typeof zoneChartRange>,
  timezone: string
): ZoneRow[] {
  const defs = plot.lagging ? [plot.lagging, ...plot.leads] : plot.leads
  return defs.map((def, index) => {
    const state = zonePointState(
      readings[def.ref.definitionHash] ?? null,
      labels,
      def.collect.retro ? range : null,
      timezone
    )
    const color =
      def.role === 'lagging'
        ? ZONE_LAG_COLOR
        : ZONE_LEAD_COLORS[(index - (plot.lagging ? 1 : 0)) % ZONE_LEAD_COLORS.length]
    return {
      def,
      color,
      values: state.kind === 'ready' ? state.values : labels.map(() => null),
      unit: def.unit,
      fill: def.role === 'lagging',
      valueText:
        state.kind === 'ready' && state.latest
          ? `${state.latest.value}${typeof state.latest.value === 'number' ? def.unit : ''}`
          : '—',
      statusText:
        state.kind === 'unread'
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
      currentOnly: !def.collect.retro,
      plottable: def.collect.retro && state.kind === 'ready'
    }
  })
}

function PlotCard({
  plot,
  rows,
  labels,
  hidden,
  onToggle,
  currentIndex,
  currentNote
}: {
  plot: ZonePlot
  rows: ZoneRow[]
  labels: string[]
  hidden: Record<string, boolean>
  onToggle(hash: string, next: boolean): void
  currentIndex: number
  currentNote: string | null
}) {
  const title = plot.lagging?.name ?? '引领指标'
  const series: MetricChartSeries[] = rows.map((row) => ({
    name: row.def.name,
    values: row.values,
    color: row.color,
    unit: row.unit,
    fill: row.fill,
    target: numericTarget(row.def.target),
    on: hidden[row.def.ref.definitionHash] !== true
  }))
  const charts = splitSeriesByAxis(series)
  const anyRetro = rows.some((row) => !row.currentOnly)
  const emptyText = anyRetro
    ? '本窗口暂无历史点；刷新读数执行采集（不补零）'
    : '仅当前值指标，无历史曲线'
  return (
    <div className="wb-mz-plot">
      <div className="wb-mz-series" role="list">
        {rows.map((row) => (
          <div
            key={row.def.ref.definitionHash}
            className="wb-mz-series-row"
            role="listitem"
            style={{ '--swatch': row.color } as CSSProperties}
          >
            <label className="wb-mz-toggle">
              <input
                type="checkbox"
                checked={hidden[row.def.ref.definitionHash] !== true}
                aria-label={`显示或隐藏 ${row.def.name}`}
                onChange={(event) => onToggle(row.def.ref.definitionHash, !event.target.checked)}
              />
              <i className="wb-mz-swatch" />
              <span className="wb-mz-name">{row.def.name}</span>
            </label>
            {row.currentOnly && <span className="wb-tag wb-tag-neutral">仅当前值</span>}
            <span className="wb-mz-kind">
              {row.def.role === 'leading'
                ? `引领${row.def.leads ? `→${row.def.leads}` : ''}`
                : '滞后'}
            </span>
            <span className="wb-mz-val wb-mono">{row.valueText}</span>
            {row.def.target && <span className="wb-mz-tgt">目标 {row.def.target}</span>}
            <span className="wb-tag wb-tag-neutral">{row.statusText}</span>
            {row.staleText && <span className="wb-mz-stale">{row.staleText}</span>}
          </div>
        ))}
      </div>
      {charts.map((chart) => (
        <MetricLineChart
          key={`${title}-chart-${chart[0]?.unit ?? 'unit'}`}
          labels={labels}
          series={chart}
          emptyText={emptyText}
          hiddenText="点上面的系列决定显示哪几条"
          ariaLabel={`${title} 趋势${charts.length > 1 ? `（单位 ${chart[0].unit || '无'}）` : ''}`}
          currentIndex={currentIndex}
          currentNote={currentNote}
        />
      ))}
      <details className="wb-mz-defs">
        <summary>指标定义与采集口径</summary>
        {rows.map((row) => (
          <p key={row.def.ref.definitionHash} className="wb-mz-def">
            <b>{row.def.name}</b>：{row.def.def.trim() || '（未提供定义文本）'}
            <span className="wb-muted">
              （{row.def.role === 'leading' ? '引领' : '滞后'} · 单位 {row.def.unit || '无'} ·{' '}
              {row.def.collect.retro ? '可按窗口查历史' : '仅当前值'}
              {row.def.leads ? ` · 引领「${row.def.leads}」` : ''}）
            </span>
          </p>
        ))}
      </details>
    </div>
  )
}

/**
 * Overview lagging/leading zones (hi-fi target block): feature tabs, one chart per
 * lagging metric plus its leads, series show/hide, day/week granularity through the
 * existing window protocol, long definitions in details. Failures stay Unknown with
 * identifiable stale evidence; gaps stay empty; string readings never become curves.
 */
export function OverviewMetricZones({
  catalog,
  readings,
  busy,
  onRefresh,
  granularity,
  onGranularityChange
}: {
  catalog: MetricCatalog
  readings: Record<string, MetricReading | null>
  busy: boolean
  onRefresh: () => void
  granularity: ZoneGranularity
  onGranularityChange(granularity: ZoneGranularity): void
}) {
  const groups = useMemo(() => groupZoneDefs(catalog), [catalog])
  const [tab, setTab] = useState<string | null>(null)
  const [hidden, setHidden] = useState<Record<string, boolean>>({})
  const active = groups.find((group) => group.feature === tab) ?? groups[0]
  const range = useMemo(
    () => zoneChartRange(granularity, catalog.timezone),
    [granularity, catalog.timezone]
  )
  const labels = useMemo(() => zoneBucketLabels(range), [range])
  const plots = useMemo(() => (active ? groupZonePlots(active.defs) : []), [active])
  const currentIndex = labels.length - 1
  if (groups.length === 0) {
    return null
  }
  return (
    <section className="card" id="metrics-zones">
      <div className="card-head">
        <div className="row-between">
          <h6>滞后与引领指标</h6>
          <span className="row-start">
            <span className="seg wb-mz-seg" role="group" aria-label="业务指标粒度">
              <label className="seg-opt">
                <input
                  type="radio"
                  name="wb-mz-granularity"
                  value="week"
                  checked={granularity === 'week'}
                  onChange={() => onGranularityChange('week')}
                />
                周
              </label>
              <label className="seg-opt">
                <input
                  type="radio"
                  name="wb-mz-granularity"
                  value="day"
                  checked={granularity === 'day'}
                  onChange={() => onGranularityChange('day')}
                />
                天
              </label>
            </span>
            <button
              type="button"
              className="wb-btn wb-btn-ghost wb-btn-sm"
              disabled={busy}
              title="执行登记采集脚本后按当前粒度窗口重读"
              onClick={onRefresh}
            >
              刷新读数
            </button>
          </span>
        </div>
        {groups.length > 1 && (
          <div className="tabs" role="tablist" aria-label="指标范围">
            {groups.map((group) => (
              <button
                key={group.feature}
                type="button"
                className="tab"
                role="tab"
                aria-selected={group.feature === active?.feature}
                onClick={() => setTab(group.feature)}
              >
                {group.feature}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className={`wb-mz-plots${plots.length > 1 ? ' is-multi' : ''}`}>
        {plots.map((plot) => {
          const rows = buildRows(plot, readings, labels, range, catalog.timezone)
          const latest = rows
            .filter((row) => row.plottable)
            .map((row) => row.statusText)
            .find((text) => text.startsWith('采集于'))
          return (
            <PlotCard
              key={plot.lagging?.ref.definitionHash ?? plot.leads[0].ref.definitionHash}
              plot={plot}
              rows={rows}
              labels={labels}
              hidden={hidden}
              onToggle={(hash, next) => setHidden((current) => ({ ...current, [hash]: next }))}
              currentIndex={currentIndex}
              currentNote={latest ? `截至${latest.slice('采集于'.length)}` : null}
            />
          )
        })}
      </div>
    </section>
  )
}
