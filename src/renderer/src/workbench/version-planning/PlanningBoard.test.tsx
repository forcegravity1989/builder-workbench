// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { PlanningMaterial } from '../../../../shared/workbench/version-material'
import type { VersionCycleContext } from '../version-cycle/cycle-context'
import { planningDraftKey } from './use-planning-material'

vi.mock('../version-cycle/native-cycle-workspace', () => ({
  cycleScopeKey: () => 'test-project'
}))
vi.mock('./use-plan-metrics', () => ({
  usePlanMetrics: () => ({ catalog: null, values: {}, readings: [], error: null })
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
  localStorage.setItem(planningDraftKey('test-project', 'A'), JSON.stringify({
    document: { ...material('A'), summary: { progress: 'unsaved A', risks: '' } },
    expectedRevision: revision, dirty: true
  }))
  const value = context(vi.fn())
  await mount(value)
  const originalInput = progress()
  await mount({ ...value, session: { ...value.session!, sessionId: 'older-session', tabId: 'older-tab' } })
  expect(progress()).toBe(originalInput)
  expect(progress()?.value).toBe('unsaved A')
  expect(selector().value).toBe('A')
  await mount({ ...value, session: null })
  expect(progress()).toBe(originalInput)
  expect(progress()?.value).toBe('unsaved A')
})
