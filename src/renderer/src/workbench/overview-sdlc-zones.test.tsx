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

vi.mock('./overview-metric-chart', () => ({
  MetricLineChart: (props: { series: unknown }) => (
    <div data-series={JSON.stringify(props.series)} />
  )
}))
import { OverviewSdlcZones } from './overview-sdlc-zones'

const TZ = 'UTC'
const range = zoneChartRange('week', TZ)
const previousWeekMonday = addCalendarDays(range.until, -14)
const tsOf = (day: string) => Date.parse(`${day}T12:00:00Z`)

const repo = { id: 'repo', path: '/repo' } as Repo
const baseScope = { projectId: 'p', repoId: 'repo', hostId: 'local' } as NativeWorkspaceScope

function stateOf(overrides: Partial<OverviewSdlcState> = {}): OverviewSdlcState {
  return {
    provider: 'codehub',
    merges: {
      kind: 'ready',
      value: { items: [], hasMore: false, readAt: new Date().toISOString() }
    },
    commits: {
      kind: 'ready',
      value: {
        items: [{ timestamp: tsOf(previousWeekMonday) }, { timestamp: Date.now() - 1 }],
        hasMore: false,
        readAt: new Date().toISOString()
      }
    },
    issues: {
      kind: 'ready',
      value: { count: 11, truncated: false, readAt: new Date().toISOString() }
    },
    busy: false,
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
  vi.useRealTimers()
})

async function renderZones(state: OverviewSdlcState): Promise<void> {
  fixture.state = state
  await act(async () =>
    root.render(
      <OverviewSdlcZones
        identity="sdlc-ui-test"
        repo={repo}
        baseScope={baseScope}
        baseWorktreeId="tree"
        baseWorktreePath="/repo"
        timezone={TZ}
      />
    )
  )
}

it('renders three charts with real bucket counts and only one current Issue point', async () => {
  await renderZones(stateOf())
  const charts = [...container.querySelectorAll('[data-series]')].map(
    (item) => JSON.parse(item.getAttribute('data-series')!)[0]
  )
  expect(charts).toHaveLength(3)
  expect(charts[0].values.filter((value: number) => value > 0)).toHaveLength(2)
  expect(charts[1].values.every((value: number) => value === 0)).toBe(true)
  expect(charts[2].values.filter((value: unknown) => value !== null)).toEqual([11])
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(Date.now() + 8 * 86_400_000)
  await act(async () =>
    (
      container.querySelector('[aria-label="项目指标粒度"] button:last-child') as HTMLButtonElement
    ).click()
  )
  await renderZones(stateOf())
  const currentIssues = JSON.parse(
    container.querySelectorAll('[data-series]')[2].getAttribute('data-series')!
  )[0]
  expect(currentIssues.values.at(-1)).toBe(11)
})
it('a failed merge source does not hide commits or Issues', async () => {
  await renderZones(stateOf({ merges: { kind: 'error', message: '合入时间缺失' } }))
  const cells = [...container.querySelectorAll('.wb-sdlc-cell')]
  expect(cells[1].querySelector('.wb-sdlc-val')?.textContent).toBe('—')
  expect(cells[1].textContent).toContain('合入时间缺失')
  expect(cells[2].querySelector('.wb-sdlc-val')?.textContent).toBe('11')
})
