// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { addCalendarDays } from '../../../shared/workbench/metric-windows'
import type { Repo } from '../../../shared/repo-types'
import type { NativeWorkspaceScope } from './version-cycle/native-workspace'
import { zoneChartRange } from './overview-zone-series'
import type { OverviewSdlcState } from './use-overview-sdlc'

const fixture = vi.hoisted(() => ({ state: null as unknown as OverviewSdlcState }))
vi.mock('./use-overview-sdlc', () => ({ useOverviewSdlc: () => fixture.state }))

import { OverviewSdlcZones } from './overview-sdlc-zones'

const TZ = 'UTC'
const range = zoneChartRange('week', TZ)
const currentWeekMonday = addCalendarDays(range.until, -7)
const previousWeekMonday = addCalendarDays(range.until, -14)
const tsOf = (day: string) => Date.parse(`${day}T12:00:00Z`)

const repo = { id: 'repo', path: '/repo' } as Repo
const baseScope = { projectId: 'p', repoId: 'repo', hostId: 'local' } as NativeWorkspaceScope

function stateOf(overrides: Partial<OverviewSdlcState> = {}): OverviewSdlcState {
  return {
    provider: 'codehub',
    commits: {
      kind: 'ready',
      value: {
        items: [{ timestamp: tsOf(previousWeekMonday) }, { timestamp: tsOf(currentWeekMonday) }],
        hasMore: false,
        readAt: '2026-09-24T10:00:00.000Z'
      }
    },
    issues: {
      kind: 'ready',
      value: { count: 11, truncated: false, readAt: '2026-09-24T10:00:00.000Z' }
    },
    busy: false,
    refresh: vi.fn(async () => {}),
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

async function renderZones(state: OverviewSdlcState): Promise<void> {
  fixture.state = state
  await act(async () =>
    root.render(
      <OverviewSdlcZones
        repo={repo}
        baseScope={baseScope}
        baseWorktreeId="tree"
        baseWorktreePath="/repo"
        timezone={TZ}
      />
    )
  )
}

const text = () => container.textContent ?? ''

it('提交画真实时间桶折线，头卡显示当前桶计数并注明口径与采集时刻', async () => {
  await renderZones(stateOf())
  expect(text()).toContain('本周提交')
  expect(container.querySelectorAll('svg path[fill="none"]')).toHaveLength(1)
  expect(text()).toContain('按项目主工作树可达历史统计，时间为提交作者时间')
  const tipNote = container.querySelector('.wb-sdlc-head .wb-sdlc-val')
  expect(tipNote?.textContent).toBe('1')
})

it('历史被截断时如实标注，截断前的桶留空不补数', async () => {
  await renderZones(
    stateOf({
      commits: {
        kind: 'ready',
        value: {
          items: [{ timestamp: tsOf(currentWeekMonday) }],
          hasMore: true,
          readAt: '2026-09-24T10:00:00.000Z'
        }
      }
    })
  )
  expect(text()).toContain('仅计入最近 200 条')
  // The current bucket is the truncation boundary → value stays — instead of a low count.
  expect(container.querySelector('.wb-sdlc-head .wb-sdlc-val')?.textContent).toBe('—')
})

it('提交通道失败只影响提交卡，显示未知与原因', async () => {
  await renderZones(stateOf({ commits: { kind: 'error', message: 'git 不可用' } }))
  expect(text()).toContain('未知：git 不可用')
  expect(text()).toContain('11')
})

it('合入 PR 保持诚实空态：不画推造趋势、不显示近似数字', async () => {
  await renderZones(stateOf())
  const cells = [...container.querySelectorAll('.wb-sdlc-cell')]
  const prCell = cells.find((cell) => cell.textContent?.includes('合入的 PR'))
  expect(prCell?.querySelector('.wb-sdlc-val')?.textContent).toBe('—')
  expect(prCell?.textContent).toContain('缺少真实合入时刻')
  expect(prCell?.textContent).toContain('不用更新时间推造历史')
  expect(prCell?.querySelector('svg')).toBeNull()
})

it('开放 Issue 只显示时点存量与截至时刻，不画历史曲线', async () => {
  await renderZones(stateOf())
  const cells = [...container.querySelectorAll('.wb-sdlc-cell')]
  const issueCell = cells.find((cell) => cell.textContent?.includes('开放 Issue'))
  expect(issueCell?.querySelector('.wb-sdlc-val')?.textContent).toBe('11')
  expect(issueCell?.textContent).toContain('仅展示当前存量；历史存量需完整事件源，不从当前状态推造')
  expect(issueCell?.textContent).toContain('截至 2026-09-24T10:00:00.000Z')
  expect(issueCell?.querySelector('svg')).toBeNull()
})

it('Issue 分页截断如实标注；失败保持未知；无任务来源如实说明', async () => {
  await renderZones(
    stateOf({
      issues: {
        kind: 'ready',
        value: { count: 100, truncated: true, readAt: '2026-09-24T10:00:00.000Z' }
      }
    })
  )
  expect(text()).toContain('仅计入前 100 条，开放 Issue 还有更多')

  await act(async () => root.unmount())
  container.remove()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await renderZones(stateOf({ issues: { kind: 'error', message: '离线' } }))
  expect(text()).toContain('未知：离线')

  await act(async () => root.unmount())
  container.remove()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await renderZones(stateOf({ provider: null, issues: null }))
  expect(text()).toContain('未识别可用的任务来源')
})

it('粒度切换改按日桶重算提交；刷新按钮独立重读', async () => {
  const refresh = vi.fn(async () => {})
  await renderZones(stateOf({ refresh }))
  expect(text()).toContain('本周提交')
  const day = container.querySelector<HTMLInputElement>(
    'input[name="wb-sdlc-granularity"][value="day"]'
  )
  await act(async () => day?.click())
  expect(text()).toContain('今日提交')
  const button = [...container.querySelectorAll('button')].find(
    (item) => item.textContent === '刷新'
  )
  await act(async () => (button as HTMLButtonElement).click())
  expect(refresh).toHaveBeenCalledTimes(1)
})
