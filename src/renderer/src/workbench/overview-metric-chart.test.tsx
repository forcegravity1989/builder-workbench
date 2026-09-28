// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
const fixture = vi.hoisted(() => ({
  getOption: () => ({}),
  setOption: vi.fn(),
  resize: vi.fn(),
  dispose: vi.fn(),
  on: vi.fn(),
  dispatchAction: vi.fn()
}))
vi.mock('echarts/core', () => ({ use: vi.fn(), init: () => fixture }))
import { MetricLineChart, metricChartOption } from './overview-metric-chart'
const props = {
  labels: ['a', 'b', 'c'],
  series: [{ name: 'M', values: [1, null, 3], color: '#123', unit: '个', target: 5, on: true }],
  legend: true,
  emptyText: '无读数',
  hiddenText: '未选择',
  ariaLabel: '指标趋势'
}
it('keeps missing buckets, target and units while using a single scrolling legend and axis tooltip', () => {
  const option = metricChartOption(props, (value) => value)
  expect(option.legend).toMatchObject({ type: 'scroll', selected: { M: true } })
  expect(option.tooltip).toMatchObject({ trigger: 'axis', confine: true, enterable: true })
  expect(option.series).toMatchObject([
    { data: [1, null, 3], connectNulls: false, markLine: { data: [{ yAxis: 5 }] } }
  ])
})
it('retains axes when all series are hidden and disposes the renderer on unmount', async () => {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const toggle = vi.fn()
  await act(async () =>
    root.render(
      <MetricLineChart {...props} series={[{ ...props.series[0], on: false }]} onToggle={toggle} />
    )
  )
  expect(container.querySelector('.wb-mz-canvas')).not.toBeNull()
  expect(container.textContent).toContain('未选择')
  const selection = fixture.on.mock.calls.find((call) => call[0] === 'legendselectchanged')![1]
  act(() => selection({ name: 'M', selected: { M: true } }))
  expect(toggle).toHaveBeenCalledWith('M', true)
  container
    .querySelector('.wb-mz-canvas')!
    .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
  expect(fixture.dispatchAction).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'showTip', dataIndex: 0 })
  )
  act(() => root.unmount())
  expect(fixture.dispose).toHaveBeenCalled()
  container.remove()
})
