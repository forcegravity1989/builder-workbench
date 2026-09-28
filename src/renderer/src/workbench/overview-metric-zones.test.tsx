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

it('未读取时保持诚实空态：行标未读取、值为空、不补零不画线', async () => {
  await renderZones({})
  expect(text()).toContain('未读取')
  expect(text()).toContain('本窗口暂无历史点')
  expect(container.querySelectorAll('svg path[fill="none"]')).toHaveLength(0)
  expect(text()).not.toMatch(/·\s*0个/)
})

it('历史点画成折线，失败系列保持 Unknown 并标陈旧读数', async () => {
  await renderZones({
    readings: {
      'hash-滞后A': weekReading([
        { day: mondays.at(-2)!, value: 2 },
        { day: lastMonday, value: 5 }
      ]),
      'hash-引领A': {
        status: 'error',
        reason: { code: 'collector-failed', message: '脚本失败' },
        previous: weekReading([{ day: lastMonday, value: 2 }])
      }
    }
  })
  expect(container.querySelectorAll('svg path[fill="none"]')).toHaveLength(1)
  expect(text()).toContain('5个')
  expect(text()).toContain('未知：脚本失败')
  expect(text()).toContain('陈旧读数 2')
})

it('字符串读数只显示文本，不画数值曲线', async () => {
  await renderZones({
    readings: { 'hash-字符串指标': weekReading([{ day: lastMonday, value: '达标' }]) }
  })
  const tab = [...container.querySelectorAll('.tab')].find((item) => item.textContent === 'F1')
  await act(async () => (tab as HTMLButtonElement).click())
  expect(text()).toContain('达标')
  expect(container.querySelectorAll('svg path[fill="none"]')).toHaveLength(0)
})

it('仅当前值指标：标注只展示当前值，不按窗口伪造历史', async () => {
  await renderZones({ readings: { 'hash-仅当前': instantReading(3) } })
  const tab = [...container.querySelectorAll('.tab')].find((item) => item.textContent === 'F1')
  await act(async () => (tab as HTMLButtonElement).click())
  expect(text()).toContain('仅当前值')
  expect(text()).toContain('3次')
  expect(text()).toContain('仅当前值指标，无历史曲线')
})

it('特性页签切换分组；主要页签承载未指定特性的定义', async () => {
  await renderZones({})
  const tabs = [...container.querySelectorAll('.tab')].map((item) => item.textContent)
  expect(tabs).toEqual(['主要', 'F1'])
  expect(text()).toContain('滞后A')
  expect(text()).not.toContain('字符串指标')
  const tab = [...container.querySelectorAll('.tab')].find((item) => item.textContent === 'F1')
  await act(async () => (tab as HTMLButtonElement).click())
  expect(text()).toContain('字符串指标')
  expect(text()).not.toContain('滞后A')
})

it('系列显隐由勾选控制：取消全部后提示由人决定显示', async () => {
  await renderZones({
    readings: {
      'hash-滞后A': weekReading([
        { day: mondays.at(-2)!, value: 2 },
        { day: lastMonday, value: 5 }
      ])
    }
  })
  expect(container.querySelectorAll('svg path[fill="none"]')).toHaveLength(1)
  const boxes = [...container.querySelectorAll<HTMLInputElement>('.wb-mz-toggle input')]
  await act(async () => boxes.forEach((box) => box.click()))
  expect(container.querySelector('svg')).toBeNull()
  expect(text()).toContain('点上面的系列决定显示哪几条')
})

it('粒度切换回调传出天/周选择', async () => {
  const onGranularityChange = vi.fn()
  await renderZones({ onGranularityChange })
  const day = container.querySelector<HTMLInputElement>(
    'input[name="wb-mz-granularity"][value="day"]'
  )
  await act(async () => day?.click())
  expect(onGranularityChange).toHaveBeenCalledWith('day')
})

it('长定义收进详情，含口径与引领关系', async () => {
  await renderZones({})
  const details = container.querySelector<HTMLDetailsElement>('.wb-mz-defs')
  expect(details).not.toBeNull()
  expect(details?.open).toBe(false)
  expect(text()).toContain('滞后A 的长定义文本')
  expect(text()).toContain('可按窗口查历史')
  expect(text()).toContain('引领「滞后A」')
})

it('刷新按钮走既有通道', async () => {
  const onRefresh = vi.fn()
  await renderZones({ onRefresh })
  const button = [...container.querySelectorAll('button')].find(
    (item) => item.textContent === '刷新读数'
  )
  await act(async () => (button as HTMLButtonElement).click())
  expect(onRefresh).toHaveBeenCalledTimes(1)
})
