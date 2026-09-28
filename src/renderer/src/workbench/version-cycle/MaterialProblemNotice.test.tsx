// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { MaterialProblemNotice, materialProblemRequest } from './MaterialProblemNotice'

it('lists only actual unreadable files and asks for confirmation before modifying them', () => {
  const text = materialProblemRequest(
    [
      { version: 'v0.3', state: 'migration-required' },
      { version: 'v0.4', state: 'invalid', error: 'unexpected end of JSON' },
      { version: 'v0.5', state: 'ready' }
    ],
    'plan'
  )
  expect(text).toContain('.bw/planning/v0.3/data.json')
  expect(text).toContain('.bw/planning/v0.4/data.json：unexpected end of JSON')
  expect(text).not.toContain('v0.5')
  expect(text).toContain('等我确认后执行')
})

it('the warning can create a request before a version or session has been selected', async () => {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const start = vi.fn(async (_text: string) => undefined)
  try {
    await act(async () =>
      root.render(
        <MaterialProblemNotice
          versions={[{ version: 'v0.3', state: 'migration-required' }]}
          workflow="plan"
          startRequest={start}
        />
      )
    )
    expect(host.textContent).toContain('v0.3 的计划数据文件格式较旧')
    await act(async () => host.querySelector('button')!.click())
    expect(start).toHaveBeenCalledOnce()
    expect(start.mock.calls[0]?.[0]).toContain('.bw/planning/v0.3/data.json')
    expect(host.querySelector('[role="dialog"]')).toBeNull()
    await act(async () =>
      root.render(
        <MaterialProblemNotice
          versions={[{ version: 'v0.3', state: 'ready' }]}
          workflow="plan"
          startRequest={start}
        />
      )
    )
    expect(host.querySelector('[role="alert"]')).toBeNull()
  } finally {
    act(() => root.unmount())
    host.remove()
  }
})

it('acceptance requests name their own file', () => {
  expect(
    materialProblemRequest(
      [{ version: 'v0.4', state: 'invalid', error: 'invalid planRef' }],
      'acceptance'
    )
  ).toContain('.bw/planning/v0.4/acceptance.json：invalid planRef')
})
