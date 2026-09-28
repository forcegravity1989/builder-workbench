import { useEffect, useRef } from 'react'
import { init, use as registerCharts, type EChartsType, type ComposeOption } from 'echarts/core'
import { LineChart, type LineSeriesOption } from 'echarts/charts'
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
  AriaComponent,
  MarkLineComponent,
  type GridComponentOption,
  type LegendComponentOption,
  type TooltipComponentOption,
  type AriaComponentOption,
  type MarkLineComponentOption
} from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'

registerCharts([
  LineChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  AriaComponent,
  MarkLineComponent,
  SVGRenderer
])

export type MetricChartSeries = {
  name: string
  values: (number | null)[]
  color: string
  unit: string
  solid?: boolean
  target?: number | null
  on: boolean
}
type ChartOption = ComposeOption<
  | LineSeriesOption
  | GridComponentOption
  | LegendComponentOption
  | TooltipComponentOption
  | AriaComponentOption
  | MarkLineComponentOption
>
type ChartProps = {
  labels: string[]
  series: MetricChartSeries[]
  emptyText: string
  hiddenText: string
  ariaLabel: string
  integer?: boolean
  legend?: boolean
  onToggle?(name: string, visible: boolean): void
}

export function metricChartOption(
  props: ChartProps,
  color: (value: string) => string
): ChartOption {
  const units = [...new Set(props.series.map((item) => item.unit))]
  const text = color('var(--color-text)')
  const muted = color('var(--color-neutral-500)')
  const divider = color('var(--color-divider)')
  return {
    animation: false,
    aria: { enabled: true },
    grid: { top: props.legend ? 54 : 18, bottom: 24, left: 42, right: units.length > 1 ? 42 : 16 },
    legend: {
      show: props.legend ?? false,
      type: 'scroll',
      top: 0,
      left: 0,
      right: 0,
      selected: Object.fromEntries(props.series.map((item) => [item.name, item.on])),
      textStyle: { color: text, width: 220, overflow: 'truncate', fontSize: 12 },
      tooltip: { show: true, confine: true },
      pageTextStyle: { color: muted },
      pageIconColor: text,
      pageIconInactiveColor: divider
    },
    tooltip: {
      trigger: 'axis',
      confine: true,
      enterable: true,
      axisPointer: { type: 'line', lineStyle: { color: muted, type: 'dashed' } },
      backgroundColor: color('var(--color-card)'),
      borderColor: divider,
      textStyle: { color: text, fontSize: 12 },
      extraCssText: 'max-width:min(420px,90%);max-height:160px;overflow:auto;white-space:normal;'
    },
    xAxis: {
      type: 'category',
      data: props.labels,
      boundaryGap: false,
      axisLine: { lineStyle: { color: divider } },
      axisTick: { show: false },
      axisLabel: { color: muted, fontSize: 10, hideOverlap: true }
    },
    yAxis: units.map((unit, index) => ({
      type: 'value',
      name: unit,
      position: index === 0 ? 'left' : 'right',
      nameTextStyle: { color: muted },
      axisLabel: { color: muted, fontSize: 10 },
      splitNumber: 3,
      minInterval: props.integer ? 1 : undefined,
      splitLine: { show: index === 0, lineStyle: { color: divider, type: 'dashed' } }
    })),
    series: props.series.map((item) => ({
      name: item.name,
      type: 'line',
      data: item.values,
      yAxisIndex: units.indexOf(item.unit),
      connectNulls: false,
      smooth: false,
      showSymbol: true,
      symbolSize: 6,
      lineStyle: { color: color(item.color), width: 2, type: item.solid ? 'solid' : 'dashed' },
      itemStyle: { color: color(item.color) },
      emphasis: { focus: 'series' },
      tooltip: {
        valueFormatter: (value) => (value == null || value === '-' ? '—' : `${value}${item.unit}`)
      },
      markLine:
        item.target == null
          ? undefined
          : {
              silent: true,
              symbol: 'none',
              data: [{ yAxis: item.target }],
              lineStyle: { color: color(item.color), type: 'dashed' },
              label: { position: 'insideEndBottom', formatter: `目标 ${item.target}${item.unit}` }
            }
    }))
  }
}

function chartColors(element: HTMLElement) {
  const style = getComputedStyle(element)
  return (value: string) => {
    const match = /^var\((--[^,)]+)(?:,\s*([^)]*))?\)$/.exec(value)
    return match ? style.getPropertyValue(match[1]).trim() || match[2] || '#888' : value
  }
}

export function MetricLineChart(props: ChartProps) {
  const container = useRef<HTMLDivElement>(null)
  const chart = useRef<EChartsType | null>(null)
  const latest = useRef(props)
  latest.current = props
  const activeIndex = useRef(-1)
  useEffect(() => {
    const element = container.current!
    const instance = init(element, undefined, { renderer: 'svg' })
    chart.current = instance
    const redraw = () => {
      instance.setOption(metricChartOption(latest.current, chartColors(element)), {
        notMerge: true
      })
    }
    redraw()
    const resize = new ResizeObserver(() => instance.resize())
    resize.observe(element)
    const theme = new MutationObserver(redraw)
    theme.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-theme']
    })
    instance.on('legendselectchanged', (event: unknown) => {
      const selection = event as { name: string; selected: Record<string, boolean> }
      latest.current.onToggle?.(selection.name, selection.selected[selection.name])
    })
    return () => {
      resize.disconnect()
      theme.disconnect()
      instance.dispose()
      chart.current = null
    }
  }, [])
  useEffect(() => {
    const element = container.current!
    const instance = chart.current
    if (instance) {
      const previous = instance.getOption().legend as { scrollDataIndex?: number }[] | undefined
      const option = metricChartOption(props, chartColors(element))
      Object.assign(option.legend!, { scrollDataIndex: previous?.[0]?.scrollDataIndex ?? 0 })
      instance.setOption(option, { notMerge: true })
    }
    activeIndex.current = -1
  }, [props])
  const visible = props.series.filter((item) => item.on)
  const known = visible.some((item) => item.values.some((value) => value !== null))
  return (
    <div className="wb-mz-chart" data-legend={props.legend || undefined}>
      <div
        ref={container}
        className="wb-mz-canvas"
        role="img"
        aria-label={props.ariaLabel}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            chart.current?.dispatchAction({ type: 'hideTip' })
          } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault()
            activeIndex.current = Math.max(
              0,
              Math.min(
                props.labels.length - 1,
                activeIndex.current + (event.key === 'ArrowRight' ? 1 : -1)
              )
            )
            chart.current?.dispatchAction({
              type: 'showTip',
              seriesIndex: Math.max(
                0,
                props.series.findIndex((item) => item.on)
              ),
              dataIndex: activeIndex.current
            })
          }
        }}
      />
      {!known && (
        <div className="wb-mz-empty">{visible.length ? props.emptyText : props.hiddenText}</div>
      )}
    </div>
  )
}
