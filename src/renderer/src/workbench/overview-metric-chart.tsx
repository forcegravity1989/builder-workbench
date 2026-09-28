import { useState } from 'react'

export type MetricChartSeries = {
  name: string
  /** Bucketed values; null is a real gap and is never drawn or zero-filled. */
  values: (number | null)[]
  color: string
  unit: string
  fill?: boolean
  target?: number | null
  on: boolean
}

const VW = 640
const VH = 148
const PAD_T = 10
const PAD_B = 22
const PAD_L = 34
const PAD_R = 8
const PAD_R_AXIS = 34
const TICKS = 3

function knownValues(series: MetricChartSeries[]): number[] {
  const values: number[] = []
  for (const item of series) {
    for (const value of item.values) {
      if (value !== null) {
        values.push(value)
      }
    }
    if (item.target !== null && item.target !== undefined) {
      values.push(item.target)
    }
  }
  return values
}

function extentOf(series: MetricChartSeries[]): [number, number] {
  const known = knownValues(series)
  if (known.length === 0) {
    return [0, 1]
  }
  const min = Math.min(0, ...known)
  const max = Math.max(...known, min + 1)
  return [min, max]
}

/** Consecutive known points form one polyline; gaps break the line instead of bridging or dropping to zero. */
function segmentsOf(values: (number | null)[]): [number, number][][] {
  const segments: [number, number][][] = []
  let current: [number, number][] = []
  values.forEach((value, index) => {
    if (value === null) {
      if (current.length > 0) {
        segments.push(current)
        current = []
      }
      return
    }
    current.push([index, value])
  })
  if (current.length > 0) {
    segments.push(current)
  }
  return segments
}

function formatAxis(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10)
}

function formatValue(value: number | null, unit: string): string {
  return value === null ? '—' : `${value}${unit}`
}

/**
 * Hand-rolled SVG line chart in the hi-fi drawChart style — no chart dependency.
 * Same-unit series share the left axis, a second unit gets the right axis; the
 * newest bucket can be marked so the current point states its collection time.
 */
export function MetricLineChart({
  labels,
  series,
  emptyText,
  hiddenText,
  ariaLabel,
  currentIndex = null,
  currentNote = null
}: {
  labels: string[]
  series: MetricChartSeries[]
  emptyText: string
  hiddenText: string
  ariaLabel: string
  currentIndex?: number | null
  currentNote?: string | null
}) {
  const [hover, setHover] = useState<number | null>(null)
  const visible = series.filter((item) => item.on)
  if (visible.length === 0) {
    return <div className="wb-mz-empty">{hiddenText}</div>
  }
  if (!visible.some((item) => item.values.some((value) => value !== null))) {
    return <div className="wb-mz-empty">{emptyText}</div>
  }

  const leftUnit = visible[0].unit
  const left = visible.filter((item) => item.unit === leftUnit)
  const right = visible.filter((item) => item.unit !== leftUnit)
  const hasRight = right.length > 0
  const padR = hasRight ? PAD_R_AXIS : PAD_R
  const iw = VW - PAD_L - padR
  const ih = VH - PAD_T - PAD_B
  const leftExtent = extentOf(left)
  const rightExtent = hasRight ? extentOf(right) : leftExtent
  const xAt = (index: number) =>
    PAD_L + (labels.length === 1 ? iw / 2 : (iw * index) / (labels.length - 1))
  const yAt = (value: number, [min, max]: [number, number]) =>
    PAD_T + ih - ((value - min) / (max - min)) * ih
  const extentFor = (item: MetricChartSeries) => (item.unit === leftUnit ? leftExtent : rightExtent)

  const gridLines = Array.from({ length: TICKS + 1 }, (_, tick) => {
    const y = PAD_T + (ih * tick) / TICKS
    const ratio = 1 - tick / TICKS
    return {
      y,
      left: formatAxis(leftExtent[0] + (leftExtent[1] - leftExtent[0]) * ratio),
      right: hasRight
        ? formatAxis(rightExtent[0] + (rightExtent[1] - rightExtent[0]) * ratio)
        : null
    }
  })
  const labelStep = labels.length > 10 ? 3 : 1

  const hovered = hover
  const tooltipRows =
    hovered === null
      ? []
      : visible.map((item) => ({
          name: item.name,
          text: formatValue(item.values[hovered] ?? null, item.unit)
        }))
  const tooltipAt =
    hovered === null
      ? null
      : (() => {
          const ys = visible
            .map((item) => {
              const value = item.values[hovered]
              return value === null ? null : yAt(value, extentFor(item))
            })
            .filter((y): y is number => y !== null)
          return { x: xAt(hovered), y: ys.length > 0 ? Math.min(...ys) : PAD_T }
        })()

  return (
    <div className="wb-mz-chart">
      <svg viewBox={`0 0 ${VW} ${VH}`} role="img" aria-label={ariaLabel} preserveAspectRatio="none">
        {gridLines.map((line, index) => (
          <g key={`grid-${index}`}>
            <line
              x1={PAD_L}
              y1={line.y}
              x2={VW - padR}
              y2={line.y}
              style={{ stroke: 'var(--color-divider, rgba(128,128,128,0.25))' }}
              strokeWidth={1}
            />
            {(index === 0 || index === TICKS) && (
              <>
                <text
                  x={PAD_L - 6}
                  y={line.y + 3}
                  textAnchor="end"
                  fontSize={10}
                  style={{ fill: 'var(--color-neutral-500, #888)', fontFamily: 'var(--font-mono)' }}
                >
                  {line.left}
                </text>
                {line.right !== null && (
                  <text
                    x={VW - padR + 6}
                    y={line.y + 3}
                    textAnchor="start"
                    fontSize={10}
                    style={{
                      fill: 'var(--color-neutral-500, #888)',
                      fontFamily: 'var(--font-mono)'
                    }}
                  >
                    {line.right}
                  </text>
                )}
              </>
            )}
          </g>
        ))}
        {visible.map((item) =>
          item.target === null || item.target === undefined ? null : (
            <line
              key={`target-${item.name}`}
              x1={PAD_L}
              y1={yAt(item.target, extentFor(item))}
              x2={VW - padR}
              y2={yAt(item.target, extentFor(item))}
              style={{ stroke: item.color }}
              strokeWidth={1}
              strokeDasharray="3 3"
              opacity={0.4}
            />
          )
        )}
        {labels.map((label, index) =>
          index % labelStep !== 0 && index !== labels.length - 1 ? null : (
            <text
              key={`label-${label}-${index}`}
              x={xAt(index)}
              y={VH - 6}
              textAnchor="middle"
              fontSize={10}
              style={{
                fill:
                  index === currentIndex
                    ? 'var(--color-text, #333)'
                    : 'var(--color-neutral-600, #666)',
                fontFamily: 'var(--font-mono)',
                fontWeight: index === currentIndex ? 600 : 400
              }}
            >
              {label.replace(/^\d{4}-/, '')}
            </text>
          )
        )}
        {tooltipAt && (
          <line
            x1={tooltipAt.x}
            y1={PAD_T}
            x2={tooltipAt.x}
            y2={PAD_T + ih}
            style={{ stroke: 'var(--color-neutral-500, #888)' }}
            strokeWidth={1}
            opacity={0.35}
          />
        )}
        {visible.map((item, seriesIndex) => {
          const extent = extentFor(item)
          const segments = segmentsOf(item.values)
          return (
            <g key={`series-${item.name}`}>
              {item.fill &&
                segments.map((segment) =>
                  segment.length < 2 ? null : (
                    <path
                      key={`fill-${segment[0][0]}`}
                      d={`${segment
                        .map(
                          ([index, value], point) =>
                            `${point ? 'L' : 'M'}${xAt(index)} ${yAt(value, extent)}`
                        )
                        .join(
                          ' '
                        )} L${xAt(segment.at(-1)![0])} ${PAD_T + ih} L${xAt(segment[0][0])} ${PAD_T + ih} Z`}
                      style={{ fill: item.color }}
                      opacity={0.12}
                      stroke="none"
                    />
                  )
                )}
              {segments.map((segment) =>
                segment.length < 2 ? null : (
                  <path
                    key={`line-${segment[0][0]}`}
                    d={segment
                      .map(
                        ([index, value], point) =>
                          `${point ? 'L' : 'M'}${xAt(index)} ${yAt(value, extent)}`
                      )
                      .join(' ')}
                    fill="none"
                    style={{ stroke: item.color }}
                    strokeWidth={seriesIndex === 0 ? 2 : 1.6}
                    strokeLinejoin="round"
                  />
                )
              )}
              {item.values.map((value, index) =>
                value === null ? null : (
                  <circle
                    key={`dot-${index}`}
                    cx={xAt(index)}
                    cy={yAt(value, extent)}
                    r={index === currentIndex ? 4.5 : item.fill ? 4 : 3.5}
                    style={
                      index === currentIndex
                        ? { fill: item.color, stroke: 'var(--color-card, #fff)', strokeWidth: 1.5 }
                        : { fill: 'var(--color-card, #fff)', stroke: item.color, strokeWidth: 2 }
                    }
                  />
                )
              )}
            </g>
          )
        })}
        {labels.map((label, index) => (
          <rect
            key={`hit-${label}-${index}`}
            x={xAt(index) - iw / Math.max(labels.length - 1, 1) / 2}
            y={PAD_T}
            width={iw / Math.max(labels.length - 1, 1)}
            height={ih}
            fill="transparent"
            onMouseEnter={() => setHover(index)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
      </svg>
      {tooltipAt && (
        <div
          className="wb-mz-tip"
          style={{ left: `${(tooltipAt.x / VW) * 100}%`, top: `${(tooltipAt.y / VH) * 100}%` }}
        >
          <div className="wk">{labels[hovered ?? 0]}</div>
          {tooltipRows.map((row) => (
            <div className="vl" key={row.name}>
              {row.name} · {row.text}
            </div>
          ))}
          {hovered === currentIndex && currentNote && <div className="vl">{currentNote}</div>}
        </div>
      )}
    </div>
  )
}
