// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { addCalendarDays } from '../../../shared/workbench/metric-windows'
import type {
  MetricCatalog,
  MetricDefinition,
  MetricReading
} from '../../../shared/workbench/metrics'
import { zoneChartRange } from './overview-zone-series'
import { OverviewMetricZones } from './overview-metric-zones'

vi.mock('./overview-metric-chart', () => ({
  MetricLineChart: (props: {
    series: { name: string; values: (number | null)[]; on: boolean }[]
    onToggle(name: string, visible: boolean): void
  }) => (
    <div data-testid="chart" data-series={JSON.stringify(props.series)}>
      {props.series.map((item) => (
        <button key={item.name} onClick={() => props.onToggle(item.name, !item.on)}>
          {item.name}
        </button>
      ))}
    </div>
  )
}))
let identity = 0
const TZ = 'UTC'
const ref = (name: string) => ({
  name,
  definitionHash: `hash-${name}`,
  configurationCommit: 'a'.repeat(40)
})

function def(overrides: Partial<MetricDefinition> & { name: string }): MetricDefinition {
  return {
    ref: ref(overrides.name),
    role: 'lagging',
    def: `${overrides.name} 的长定义文本`,
    target: '',
    unit: '',
    feature: '',
    collect: { kind: 'script', run: ['node', 'x.js'], retro: true },
    ...overrides
  }
}

const range = zoneChartRange('week', TZ)
const mondays: string[] = []
for (let day = range.since; day < range.until; day = addCalendarDays(day, 7)) {
  mondays.push(day)
}
const lastMonday = mondays.at(-1)!

function weekReading(
  points: { day: string; value: number | string }[]
): Extract<MetricReading, { status: 'ready' }> {
  return {
    status: 'ready',
    readings: points.map((point) => ({
      ref: ref('m'),
      value: point.value,
      unit: '',
      collectedAt: `${point.day}T12:00:00.000Z`,
      source: 'repo@a',
      collectorRevision: 'rev',
      observation: {
        kind: 'window',
        start: `${point.day}T00:00:00.000Z`,
        end: `${addCalendarDays(point.day, 7)}T00:00:00.000Z`,
        granularity: 'week' as const,
        timezone: TZ
      }
    })),
    run: {
      runId: 'r',
      startedAt: `${lastMonday}T12:00:00.000Z`,
      finishedAt: `${lastMonday}T12:00:00.000Z`,
      collectorRevision: 'rev',
      dataTarget: { repository: 'repo', commit: 'b'.repeat(40), hostId: 'local' }
    }
  }
}

function instantReading(value: number | string): MetricReading {
  const base = weekReading([{ day: lastMonday, value }])
  return {
    ...base,
    readings: [
      {
        ...base.readings[0],
        observation: { kind: 'instant', observedAt: `${lastMonday}T12:00:00.000Z` }
      }
    ]
  }
}

const defs = {
  lag: def({ name: '滞后A', unit: '个', target: '≥3' }),
  lead: def({ name: '引领A', role: 'leading', leads: '滞后A', unit: '个' }),
  text: def({ name: '字符串指标', feature: 'F1' }),
  current: def({
    name: '仅当前',
    feature: 'F1',
    unit: '次',
    collect: { kind: 'script', run: [], retro: false }
  })
}
const catalog: MetricCatalog = {
  scope: { repoId: 'repo', worktreeId: 'tree', hostId: 'local' },
  configurationCommit: 'c'.repeat(40),
  configurationRef: 'main',
  timezone: TZ,
  definitions: [defs.lag, defs.lead, defs.text, defs.current],
  problems: []
}

let root: Root
let container: HTMLDivElement
beforeEach(() => {
  identity++
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

async function renderZones(args: {
  readings?: Record<string, MetricReading | null>
  granularity?: 'day' | 'week'
  onGranularityChange?(granularity: 'day' | 'week'): void
  onRefresh?(): void
}): Promise<void> {
  await act(async () =>
    root.render(
      <OverviewMetricZones
        identity={`zones-test-${identity}`}
        setupBusy={false}
        onSetup={() => {}}
        catalog={catalog}
        readings={args.readings ?? {}}
        busy={false}
        onRefresh={args.onRefresh ?? (() => {})}
        granularity={args.granularity ?? 'week'}
        onGranularityChange={args.onGranularityChange ?? (() => {})}
      />
    )
  )
}

const text = () => container.textContent ?? ''

const series = () =>
  [...container.querySelectorAll('[data-series]')].flatMap((item) =>
    JSON.parse(item.getAttribute('data-series')!)
  )
it('unknown and stale readings never become zero or a fresh curve', async () => {
  await renderZones({
    readings: {
      'hash-引领A': {
        status: 'error',
        reason: { code: 'collector-failed', message: '脚本失败' },
        previous: weekReading([{ day: lastMonday, value: 2 }])
      }
    }
  })
  expect(series().every((item) => item.values.every((value: unknown) => value === null))).toBe(true)
  expect(text()).toContain('未知：脚本失败')
  expect(text()).toContain('陈旧读数 2')
  expect(container.querySelector<HTMLDetailsElement>('details')!.open).toBe(false)
})
it('charts history while leaving string and current-only readings in details', async () => {
  await renderZones({
    readings: {
      'hash-滞后A': weekReading([{ day: lastMonday, value: 5 }]),
      'hash-字符串指标': weekReading([{ day: lastMonday, value: '达标' }]),
      'hash-仅当前': instantReading(3)
    }
  })
  expect(series()[0].values.at(-1)).toBe(5)
  await act(async () => (container.querySelectorAll('.tab')[1] as HTMLButtonElement).click())
  expect(text()).toContain('达标')
  expect(text()).toContain('3次')
  expect(text()).toContain('仅当前值')
  expect(series().every((item) => item.values.every((value: unknown) => value === null))).toBe(true)
})
it('preserves metric selection across remount and routes visible controls', async () => {
  const onRefresh = vi.fn()
  const onGranularityChange = vi.fn()
  await renderZones({ onRefresh, onGranularityChange })
  await act(async () =>
    (container.querySelector('[data-testid="chart"] button') as HTMLButtonElement).click()
  )
  expect(series()[0].on).toBe(false)
  await act(async () => root.render(null))
  await renderZones({ onRefresh, onGranularityChange })
  expect(series()[0].on).toBe(false)
  await act(async () =>
    (container.querySelector('[aria-label="刷新业务指标"]') as HTMLButtonElement).click()
  )
  expect(onRefresh).toHaveBeenCalledTimes(1)
  const day = [...container.querySelectorAll('button')].find((item) => item.textContent === '天')!
  await act(async () => day.click())
  expect(onGranularityChange).toHaveBeenCalledWith('day')
})
