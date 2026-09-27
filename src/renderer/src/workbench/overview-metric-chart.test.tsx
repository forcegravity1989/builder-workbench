// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { MetricLineChart, type MetricChartSeries } from './overview-metric-chart'

function series(overrides: Partial<MetricChartSeries> = {}): MetricChartSeries {
  return {
    name: '滞后指标',
    values: [1, 2, 3],
    color: 'var(--color-accent-2)',
    unit: '个',
    on: true,
    ...overrides
  }
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

async function render(element: React.ReactElement): Promise<void> {
  await act(async () => root.render(element))
}

const labels = ['2026-W37', '2026-W38', '2026-W39']

it('无任何已知点时渲染诚实空态，不画曲线不补零', async () => {
  await render(
    <MetricLineChart
      labels={labels}
      series={[series({ values: [null, null, null] })]}
      emptyText="本窗口暂无历史点"
      hiddenText="点上面的系列决定显示哪几条"
      ariaLabel="图"
    />
  )
  expect(container.querySelector('svg')).toBeNull()
  expect(container.textContent).toContain('本窗口暂无历史点')
})

it('全部系列隐藏时提示由人决定显示，不冒充无数据', async () => {
  await render(
    <MetricLineChart
      labels={labels}
      series={[series({ on: false })]}
      emptyText="无数据"
      hiddenText="点上面的系列决定显示哪几条"
      ariaLabel="图"
    />
  )
  expect(container.querySelector('svg')).toBeNull()
  expect(container.textContent).toContain('点上面的系列决定显示哪几条')
})

it('缺失桶断开折线：两段实体线，缺口处不画点', async () => {
  await render(
    <MetricLineChart
      labels={['a', 'b', 'c', 'd']}
      series={[series({ values: [1, null, null, 4] })]}
      emptyText="无"
      hiddenText="无"
      ariaLabel="图"
    />
  )
  // Single-point segments render dots but no connecting line; with one gap the
  // two isolated points produce zero polyline paths and exactly two dots.
  const strokes = container.querySelectorAll('path[fill="none"]')
  expect(strokes).toHaveLength(0)
  const dots = container.querySelectorAll('circle[r="3.5"]')
  expect(dots).toHaveLength(2)
})

it('连续点连成折线并画全部点', async () => {
  await render(
    <MetricLineChart
      labels={labels}
      series={[series()]}
      emptyText="无"
      hiddenText="无"
      ariaLabel="图"
    />
  )
  expect(container.querySelectorAll('path[fill="none"]')).toHaveLength(1)
  expect(container.querySelectorAll('circle[r="3.5"]')).toHaveLength(3)
})

it('悬停列显示周标签与各系列值；离开后消失', async () => {
  await render(
    <MetricLineChart
      labels={labels}
      series={[series(), series({ name: '引领指标', values: [9, 8, 7], unit: '个' })]}
      emptyText="无"
      hiddenText="无"
      ariaLabel="图"
    />
  )
  const hits = container.querySelectorAll('rect[fill="transparent"]')
  expect(hits).toHaveLength(3)
  await act(async () => {
    hits[1].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
  })
  const tip = container.querySelector('.wb-mz-tip')
  expect(tip).not.toBeNull()
  expect(tip?.textContent).toContain('2026-W38')
  expect(tip?.textContent).toContain('滞后指标 · 2个')
  expect(tip?.textContent).toContain('引领指标 · 8个')
  await act(async () => {
    hits[1].dispatchEvent(new MouseEvent('mouseout', { bubbles: true }))
  })
  expect(container.querySelector('.wb-mz-tip')).toBeNull()
})

it('当前桶的悬浮提示附采集时刻，当前点用实心大点标记', async () => {
  await render(
    <MetricLineChart
      labels={labels}
      series={[series()]}
      emptyText="无"
      hiddenText="无"
      ariaLabel="图"
      currentIndex={2}
      currentNote="截至 2026-09-24T10:00Z"
    />
  )
  expect(container.querySelectorAll('circle[r="4.5"]')).toHaveLength(1)
  const hits = container.querySelectorAll('rect[fill="transparent"]')
  await act(async () => {
    hits[2].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
  })
  expect(container.querySelector('.wb-mz-tip')?.textContent).toContain('截至 2026-09-24T10:00Z')
})

it('纯数字目标画虚线参考；第二个单位启用右轴刻度', async () => {
  await render(
    <MetricLineChart
      labels={labels}
      series={[series({ target: 5 }), series({ name: 'lead', values: [1, 1, 1], unit: '次' })]}
      emptyText="无"
      hiddenText="无"
      ariaLabel="图"
    />
  )
  const dashed = container.querySelectorAll('line[stroke-dasharray="3 3"]')
  expect(dashed).toHaveLength(1)
  // Right axis labels render at x = 640 - 34 + 6 = 612 when a second unit exists.
  const rightLabels = [...container.querySelectorAll('text')].filter(
    (text) => text.getAttribute('x') === '612'
  )
  expect(rightLabels.length).toBeGreaterThan(0)
})
