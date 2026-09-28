// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { PlanningMaterial } from '../../../../shared/workbench/version-material'
import type { ArchiveStatus } from '../../../../shared/workbench/version-archive'
import type { MetricCatalog } from '../../../../shared/workbench/metrics'
import type { VersionCycleContext } from '../version-cycle/cycle-context'
import { planningDraftKey } from './use-planning-material'

vi.mock('../version-cycle/native-cycle-workspace', () => ({
  cycleScopeKey: () => 'test-project'
}))
const metricsFixture = vi.hoisted(() => ({ catalog: null as MetricCatalog | null }))
vi.mock('./use-plan-metrics', () => ({
  usePlanMetrics: () => ({ catalog: metricsFixture.catalog, values: {}, readings: [], error: null })
}))
import { PlanningBoard } from './PlanningBoard'

const revision = `sha256:${'a'.repeat(64)}`
function material(version: string): PlanningMaterial {
  return {
    schema_version: 3,
    version,
    cycleId: 'cycle',
    summary: { progress: `${version} progress`, risks: '' },
    goals: [],
    tasks: []
  }
}
const unexpected = async (): Promise<never> => {
  throw new Error('unexpected operation')
}
function context(selectVersion: VersionCycleContext['selectVersion']): VersionCycleContext {
  const scope = {
    projectId: 'project',
    repoId: 'repo',
    hostId: 'local',
    workflow: 'plan'
  } as const
  return {
    scope,
    worktreeId: 'tree',
    session: {
      ...scope,
      worktreeId: 'tree',
      sessionId: 'session',
      tabId: 'tab',
      kind: 'terminal',
      title: 'Plan'
    },
    version: 'A',
    sessionPort: {
      prepareRequest: unexpected
    },
    taskPort: { listVersion: async () => [], refresh: unexpected, openDetail: unexpected },
    archivePort: {
      readStatus: async () => ({ kind: 'unknown', reason: 'fixture' }),
      prepareRequest: unexpected
    },
    materialPort: {
      context: unexpected,
      select: unexpected,
      list: async () => ['A', 'B', 'C'].map((version) => ({ version, state: 'ready' })),
      read: async (version) => ({ document: material(version), revision }),
      save: unexpected,
      migrate: unexpected,
      previewMigration: unexpected
    },
    error: null,
    selectVersion
  }
}
let root: Root
let container: HTMLDivElement
beforeEach(() => {
  localStorage.clear()
  metricsFixture.catalog = null
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  localStorage.clear()
})
const selector = () => container.querySelector<HTMLSelectElement>('[aria-label="计划版本"]')!
const progress = () => container.querySelector<HTMLTextAreaElement>('.vp-preparation textarea')
async function mount(value: VersionCycleContext) {
  await act(async () => {
    root.render(<PlanningBoard context={value} prepareMetrics={unexpected} />)
  })
}
async function select(version: string) {
  await act(async () => {
    selector().value = version
    selector().dispatchEvent(new Event('change', { bubbles: true }))
  })
}

it('keeps version selection locked until the workflow preference is saved', async () => {
  let finish!: () => void
  const associate = vi.fn(async (version: string) => {
    if (version === 'B') {
      await new Promise<void>((resolve) => {
        finish = resolve
      })
    }
  })
  const value = context(associate)
  await mount(value)
  await select('B')
  expect(progress()?.value).toBe('B progress')
  expect(selector().disabled).toBe(true)
  expect(container.querySelector('.vp-body')?.hasAttribute('inert')).toBe(true)
  expect(
    [...container.querySelectorAll<HTMLButtonElement>('.vp-footer button')].every(
      (button) => button.disabled
    )
  ).toBe(true)
  await select('C')
  expect(associate.mock.calls).toEqual([['B']])
  expect(progress()?.value).toBe('B progress')
  await act(async () => finish())
  await mount({ ...value, version: 'B' })
  expect(selector().disabled).toBe(false)
  await select('C')
  await mount({ ...value, version: 'C' })
  expect(associate.mock.calls).toEqual([['B'], ['C']])
  expect(selector().value).toBe('C')
  expect(progress()?.value).toBe('C progress')
})

it('clears the editable view but retains the draft when association fails', async () => {
  localStorage.setItem(
    planningDraftKey('test-project', 'B'),
    JSON.stringify({
      document: { ...material('B'), summary: { progress: 'unsaved B', risks: '' } },
      expectedRevision: revision,
      dirty: true
    })
  )
  await mount(
    context(async () => {
      throw new Error('host unavailable')
    })
  )
  await select('B')
  expect(selector().disabled).toBe(false)
  expect(selector().value).toBe('')
  expect(progress()).toBeNull()
  expect(container.textContent).toContain('选版未保存')
  expect(localStorage.getItem(planningDraftKey('test-project', 'B'))).toContain('unsaved B')
})

it('keeps the selected version and draft when native history changes or the chat closes', async () => {
  localStorage.setItem(
    planningDraftKey('test-project', 'A'),
    JSON.stringify({
      document: { ...material('A'), summary: { progress: 'unsaved A', risks: '' } },
      expectedRevision: revision,
      dirty: true
    })
  )
  const value = context(vi.fn())
  await mount(value)
  const originalInput = progress()
  await mount({
    ...value,
    session: { ...value.session!, sessionId: 'older-session', tabId: 'older-tab' }
  })
  expect(progress()).toBe(originalInput)
  expect(progress()?.value).toBe('unsaved A')
  expect(selector().value).toBe('A')
  await mount({ ...value, session: null })
  expect(progress()).toBe(originalInput)
  expect(progress()?.value).toBe('unsaved A')
})

it('keeps a confirmed plan archive read-only over a stale dirty draft and offers host re-read', async () => {
  localStorage.setItem(
    planningDraftKey('test-project', 'A'),
    JSON.stringify({
      document: { ...material('A'), summary: { progress: 'unsaved A', risks: '' } },
      expectedRevision: revision,
      dirty: true
    })
  )
  const gate = Promise.withResolvers<ArchiveStatus>()
  const value: VersionCycleContext = {
    ...context(vi.fn()),
    archivePort: { readStatus: () => gate.promise, prepareRequest: unexpected }
  }
  const saveButton = () =>
    [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === '保存草稿'
    )!
  await mount(value)
  expect(progress()?.value).toBe('unsaved A')
  expect(container.querySelector('.vp-preparation')?.hasAttribute('inert')).toBe(true)
  expect(saveButton().disabled).toBe(true)
  const reference = {
    provider: 'github',
    repository: 'github.com/team/repo',
    number: 3,
    materialRevision: revision
  }
  await act(async () => {
    gate.resolve({
      kind: 'merged',
      reference,
      url: 'https://github.com/team/repo/pull/3',
      checkedAt: '2026-09-25T01:00:00Z',
      checks: 'passed',
      review: 'approved',
      mergeCommit: '4'.repeat(40),
      proof: {
        kind: 'verified',
        value: {
          reference,
          mergeCommit: '4'.repeat(40),
          material: { workflow: 'plan', version: 'A', cycleId: 'cycle', revision },
          checkedAt: '2026-09-25T01:00:00Z'
        }
      }
    })
  })
  expect(container.querySelector('.vp-preparation')?.hasAttribute('inert')).toBe(true)
  expect(container.textContent).toContain('本轮计划已归档，未保存的本地修改不能写入。')
  expect(container.textContent).toContain('开始下一轮计划')
  expect(saveButton().disabled).toBe(true)
  const discard = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
    button.textContent?.includes('放弃本地修改')
  )!
  await act(async () => {
    discard.click()
  })
  expect(progress()?.value).toBe('A progress')
  expect(container.textContent).not.toContain('放弃本地修改')
  expect(container.querySelector('.vp-preparation')?.hasAttribute('inert')).toBe(true)
})

it('renders catalog problems as fixable errors instead of swallowing them', async () => {
  metricsFixture.catalog = {
    definitions: [],
    problems: [{ code: 'collector-required', message: '指标缺少采集配置', name: '构建时长' }]
  } as unknown as MetricCatalog
  await mount(context(vi.fn()))
  expect(container.textContent).toContain('存在待修复问题')
  expect(container.textContent).toContain('构建时长：指标缺少采集配置')
})

it('derives the archive journey lamp from provider-confirmed states', async () => {
  const reference = {
    provider: 'github',
    repository: 'github.com/team/repo',
    number: 3,
    materialRevision: revision
  }
  const archiveDot = () => container.querySelector('.vp-journey button:last-child .vp-dot')!
  const closedValue: VersionCycleContext = {
    ...context(vi.fn()),
    archivePort: {
      readStatus: async () =>
        ({
          kind: 'closed',
          reference,
          url: 'https://github.com/team/repo/pull/3',
          checkedAt: '2026-09-25T01:00:00Z',
          checks: 'passed',
          review: 'pending',
          mergeCommit: null,
          proof: { kind: 'unknown', reason: '评审尚未合入' }
        }) as ArchiveStatus,
      prepareRequest: unexpected
    }
  }
  await mount(closedValue)
  await act(async () => {})
  expect(archiveDot().className).toContain('failed')
  expect(container.textContent).toContain('归档 PR 已关闭')

  const mergedUnprovenValue: VersionCycleContext = {
    ...context(vi.fn()),
    archivePort: {
      readStatus: async () =>
        ({
          kind: 'merged',
          reference,
          url: 'https://github.com/team/repo/pull/3',
          checkedAt: '2026-09-25T01:00:00Z',
          checks: 'passed',
          review: 'approved',
          mergeCommit: '4'.repeat(40),
          proof: { kind: 'unknown', reason: '合入文件未读回' }
        }) as ArchiveStatus,
      prepareRequest: unexpected
    }
  }
  await mount(mergedUnprovenValue)
  await act(async () => {})
  expect(archiveDot().className).toContain('pending')
  expect(container.textContent).toContain('已合入，当前材料待核')
})
