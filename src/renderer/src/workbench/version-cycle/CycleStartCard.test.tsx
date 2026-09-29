// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import type { CycleEntry } from './cycle-workspace-context'
import { CycleStartCard } from './CycleStartCard'
import { materialProblemRequest } from './cycle-start-request'

function entry(overrides: Partial<CycleEntry> = {}): CycleEntry {
  return {
    workflow: 'plan',
    busy: false,
    notice: null,
    start: vi.fn(async () => {}),
    configure: vi.fn(async () => {}),
    ...overrides
  }
}

async function render(card: React.ReactElement) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  await act(async () => root.render(card))
  return {
    host,
    unmount: async () => {
      await act(async () => root.unmount())
      host.remove()
    }
  }
}

it('starts without one-shot context when no material problem exists', async () => {
  const start = vi.fn(async () => {})
  const { host, unmount } = await render(
    <CycleStartCard entry={entry({ start })} problems={[]} version="v0.5" />
  )
  expect(host.textContent).toContain('与 Agent 一起制定版本计划')
  expect(host.querySelector('[role="alert"]')).toBeNull()
  await act(async () => {
    ;[...host.querySelectorAll('button')].find((b) => b.textContent?.includes('新建计划'))!.click()
  })
  expect(start).toHaveBeenCalledExactlyOnceWith(undefined)
  await unmount()
})

it('carries the selected version and the real unreadable files into the single launch', async () => {
  const start = vi.fn(async () => {})
  const problems = [
    { version: 'v0.3', state: 'migration-required' as const },
    { version: 'v0.4', state: 'invalid' as const, error: 'unexpected end of JSON' }
  ]
  const { host, unmount } = await render(
    <CycleStartCard
      entry={entry({ start, workflow: 'acceptance' })}
      problems={problems}
      version="v0.5"
    />
  )
  expect(host.textContent).toContain('v0.3、v0.4 的验收数据文件格式有问题')
  expect(host.textContent).toContain('新建验收时将一并带入会话')
  await act(async () => {
    ;[...host.querySelectorAll('button')].find((b) => b.textContent?.includes('新建验收'))!.click()
  })
  expect(start).toHaveBeenCalledOnce()
  const oneShot = start.mock.calls[0]![0] as string
  expect(oneShot).toContain('.bw/planning/v0.3/acceptance.json：旧格式，需要迁移')
  expect(oneShot).toContain('.bw/planning/v0.4/acceptance.json：unexpected end of JSON')
  expect(oneShot).toContain('右侧当前选中的版本：v0.5')
  expect(oneShot).toContain('等我确认后执行')
  await unmount()
})

it('builds plan-workflow requests against the plan data file and keeps ready versions out', () => {
  const text = materialProblemRequest(
    [
      { version: 'v0.3', state: 'migration-required' },
      { version: 'v0.5', state: 'ready' }
    ],
    'plan',
    null
  )
  expect(text).toContain('.bw/planning/v0.3/data.json')
  expect(text).not.toContain('v0.5')
  expect(text).toContain('右侧当前未选择版本')
  expect(text).toContain('ORCA skills get week-planning --reference data-and-runtime')
})

it('opens the native automation editor from the card without launching a session', async () => {
  const configure = vi.fn(async () => {})
  const start = vi.fn(async () => {})
  const { host, unmount } = await render(
    <CycleStartCard entry={entry({ configure, start })} problems={[]} version={null} />
  )
  await act(async () => {
    ;[...host.querySelectorAll('button')]
      .find((b) => b.textContent?.includes('配置自动化'))!
      .click()
  })
  expect(configure).toHaveBeenCalledOnce()
  expect(start).not.toHaveBeenCalled()
  await unmount()
})
