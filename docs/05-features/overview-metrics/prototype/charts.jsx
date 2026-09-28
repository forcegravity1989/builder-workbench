import { React, useEffect, useRef, useState } from 'react'
import { facts } from './snapshot.js'

const dayMs = 86400000,
  clock = new Date(facts.readAt),
  today = Date.UTC(clock.getUTCFullYear(), clock.getUTCMonth(), clock.getUTCDate())
const isoWeek = (t) => {
  const d = new Date(t)
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const y = d.getUTCFullYear()
  return `${y}-W${String(Math.ceil(((d - Date.UTC(y, 0, 1)) / dayMs + 1) / 7)).padStart(2, '0')}`
}
function windows(grain) {
  const monday = today - ((new Date(today).getUTCDay() + 6) % 7) * dayMs,
    step = grain === 'week' ? dayMs * 7 : dayMs,
    start = grain === 'week' ? monday - 4 * step : today - 13 * step,
    count = grain === 'week' ? 5 : 14
  return Array.from(
    {
      length: count
    },
    (_, i) => {
      const from = start + i * step,
        to = from + step,
        key = grain === 'week' ? isoWeek(from) : new Date(from).toISOString().slice(0, 10)
      return {
        from,
        to,
        key,
        label: grain === 'week' ? key.slice(5) : key.slice(5)
      }
    }
  )
}
const segments = (xs, pick) => {
  const list = []
  let run = []
  for (const x of xs) {
    const y = pick(x)
    if (y === null) {
      if (run.length) {
        list.push(run)
      }
      run = []
    } else {
      run.push([x.x, y])
    }
  }
  if (run.length) {
    list.push(run)
  }
  return list
}
function Trend({ bins, series, label, compact = false }) {
  const [hover, setHover] = useState(null),
    [size, setSize] = useState({
      w: 600,
      h: 100
    }),
    chartRef = useRef(null)
  useEffect(() => {
    const el = chartRef.current
    if (!el) {
      return
    }
    const update = () =>
      setSize({
        w: el.clientWidth,
        h: el.clientHeight
      })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const w = size.w,
    h = size.h,
    l = 34,
    r = 18,
    top = 16,
    bottom = 24,
    values = series.flatMap((s) => s.values.filter((v) => v !== null)),
    max = Math.max(1, ...values),
    ymax = Math.ceil(max * 1.15),
    py = (v) => top + (h - top - bottom) * (1 - v / ymax),
    px = (i) => l + ((w - l - r) * i) / Math.max(1, bins.length - 1),
    real = series.some((s) => s.values.some((v) => v !== null))
  return (
    <div
      ref={chartRef}
      className={`ov6-trend ${compact ? 'compact' : ''}`}
      onMouseLeave={() => setHover(null)}
    >
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={label}
        className="ov6-chart"
      >
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line className="grid-line" x1={l} x2={w - r} y1={py(ymax * t)} y2={py(ymax * t)} />
            {real && (
              <text className="y-label" x={l - 8} y={py(ymax * t) + 3} textAnchor="end">
                {Math.round(ymax * t)}
              </text>
            )}
          </g>
        ))}
        {bins.map((b, i) => (
          <g key={b.key}>
            {(bins.length <= 5 || i === 0 || i === bins.length - 1 || i % 3 === 0) && (
              <text
                className="x-label"
                x={px(i)}
                y={h - 3}
                textAnchor={i === 0 ? 'start' : i === bins.length - 1 ? 'end' : 'middle'}
              >
                {b.label}
              </text>
            )}
            <rect
              x={px(i) - (w - l - r) / bins.length / 2}
              y={top}
              width={(w - l - r) / bins.length}
              height={h - top - bottom}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
          </g>
        ))}
        {series.map((s) => (
          <g
            key={s.name}
            style={{
              color: s.color
            }}
          >
            {segments(
              bins.map((b, i) => ({
                ...b,
                x: px(i),
                i
              })),
              (b) => (s.values[b.i] === null ? null : py(s.values[b.i]))
            ).map((seg, i) => (
              <polyline
                key={i}
                points={seg.map((p) => p.join(',')).join(' ')}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {s.values.map(
              (v, i) =>
                v !== null && (
                  <circle
                    key={i}
                    data-point={v}
                    cx={px(i)}
                    cy={py(v)}
                    r="3.2"
                    fill="var(--color-card)"
                    stroke="currentColor"
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                    onMouseEnter={() => setHover(i)}
                  >
                    <title>{`${bins[i].key} · ${s.name}：${v}`}</title>
                  </circle>
                )
            )}
          </g>
        ))}
      </svg>
      {!real && <div className="ov6-empty-chart">暂无该窗口的读数</div>}
      {hover !== null && (
        <div className="ov6-chart-tooltip">
          <strong>{bins[hover].key}</strong>
          {series.map((s) => (
            <span key={s.name}>
              <i
                style={{
                  background: s.color
                }}
              />
              {s.name}
              <b>{s.values[hover] ?? '—'}</b>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
function Grain({ name, value, onChange }) {
  return (
    <div className="seg ov6-grain" role="group" aria-label={name}>
      {[
        ['week', '周'],
        ['day', '天']
      ].map(([v, label]) => (
        <button
          key={v}
          aria-pressed={value === v}
          className={value === v ? 'chosen' : ''}
          onClick={() => onChange(v)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
export { dayMs, clock, today, isoWeek, windows, segments, Trend, Grain }
