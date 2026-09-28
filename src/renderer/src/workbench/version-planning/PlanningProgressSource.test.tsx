// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  PlanningMaterialSchema,
  type AcceptanceMaterial,
  type PlanningMaterial,
  type PlanningProgressSource as Source
} from '../../../../shared/workbench/version-material'
import type { VersionHistoryCatalog } from '../../../../shared/workbench/version-history'
import { PlanningProgressSource } from './PlanningProgressSource'

const history = vi.hoisted(() => ({ list: vi.fn(), read: vi.fn(), readPlan: vi.fn() }))
vi.mock('../version-history-port', () => ({ nativeVersionHistoryPort: () => history }))
const revision = `sha256:${'a'.repeat(64)}`
const source: Source = {
  version: 'release-blue',
  cycleId: 'round-a',
  sourceCommit: 'b'.repeat(40),
  revision
}
const currentPlan: PlanningMaterial = {
  schema_version: 3,
  version: 'release-green',
  cycleId: 'round-b',
  summary: { progress: '保留人的编辑', risks: '' },
  goals: [],
  tasks: []
}
const acceptedPlan: PlanningMaterial = {
  ...currentPlan,
  version: source.version,
  cycleId: 'plan-round'
}
const acceptance: AcceptanceMaterial = {
  schema_version: 3,
  version: source.version,
  cycleId: source.cycleId,
  planRef: {
    kind: 'committed',
    version: source.version,
    cycleId: acceptedPlan.cycleId,
    sourceCommit: 'c'.repeat(40),
    revision
  },
  preparedArtifacts: [],
  results: []
}
const catalog: VersionHistoryCatalog = {
  records: [{ ...source, workflow: 'acceptance', committedAt: '2026-09-25T01:00:00Z' }],
  problems: []
}
const scope = { projectId: 'project', repoId: 'repo', hostId: 'local', workflow: 'plan' } as const
let root: Root
let container: HTMLDivElement
let onSource: ReturnType<typeof vi.fn>
beforeEach(() => {
  vi.clearAllMocks()
  history.list.mockResolvedValue(catalog)
  history.read.mockResolvedValue({
    document: acceptance,
    revision,
    sourceCommit: source.sourceCommit
  })
  history.readPlan.mockResolvedValue({
    document: acceptedPlan,
    revision,
    planRef: acceptance.planRef,
    source: {
      kind: 'committed',
      sourceCommit: acceptance.planRef.kind === 'committed' ? acceptance.planRef.sourceCommit : '',
      baselineCommit: 'd'.repeat(40),
      baselineRef: 'main'
    }
  })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  onSource = vi.fn()
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})
async function mount(plan = currentPlan, repoId = 'repo') {
  await act(async () =>
    root.render(
      <PlanningProgressSource
        scope={{ ...scope, repoId }}
        worktreeId="tree"
        plan={plan}
        disabled={false}
        onSource={onSource}
      />
    )
  )
}
async function click(text: string) {
  const button = [...document.body.querySelectorAll<HTMLButtonElement>('button')].find((item) =>
    item.textContent?.includes(text)
  )!
  await act(async () => button.click())
}

it('keeps existing schema3 plans valid and validates the optional fixed acceptance identity', () => {
  expect(PlanningMaterialSchema.parse(currentPlan).summary.progressSource).toBeUndefined()
  const withSource = { ...currentPlan, summary: { ...currentPlan.summary, progressSource: source } }
  expect(PlanningMaterialSchema.parse(withSource).summary.progressSource).toEqual(source)
  expect(
    PlanningMaterialSchema.safeParse({
      ...withSource,
      summary: {
        ...withSource.summary,
        progressSource: { ...source, sourceCommit: 'latest', workflow: 'plan' }
      }
    }).success
  ).toBe(false)
})

it('requires an explicit record choice, reads its fixed plan, and only emits the source', async () => {
  await mount()
  await click('上版验收')
  expect(history.read).not.toHaveBeenCalled()
  expect(onSource).not.toHaveBeenCalled()
  const select = document.body.querySelector<HTMLSelectElement>('select')!
  expect(container.querySelector('[role="dialog"]')).toBeNull()
  expect(select.value).toBe('')
  await act(async () => {
    select.value = '0'
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
  expect(history.read).toHaveBeenCalledWith({
    scope: { repoId: 'repo', hostId: 'local', worktreeId: 'tree' },
    version: source.version,
    cycleId: source.cycleId,
    sourceCommit: source.sourceCommit,
    workflow: 'acceptance'
  })
  expect(history.readPlan).toHaveBeenCalledWith({
    scope: { repoId: 'repo', hostId: 'local', worktreeId: 'tree' },
    planRef: acceptance.planRef
  })
  expect(document.body.textContent).toContain('由固定材料派生的只读纪要')
  await click('作为进展来源')
  expect(onSource).toHaveBeenCalledWith(source)
  expect(currentPlan.summary.progress).toBe('保留人的编辑')
})

it('reports a changed fixed revision instead of falling back to another acceptance', async () => {
  history.read.mockResolvedValue({
    document: acceptance,
    revision: `sha256:${'e'.repeat(64)}`,
    sourceCommit: source.sourceCommit
  })
  await mount({ ...currentPlan, summary: { ...currentPlan.summary, progressSource: source } })
  await click('上版验收')
  expect(document.body.querySelector('[role="alert"]')?.textContent).toContain('修订不一致')
  expect(history.list).not.toHaveBeenCalled()
  expect(history.readPlan).not.toHaveBeenCalled()
  expect(onSource).not.toHaveBeenCalled()
})

it('does not surface an old project read after the workspace scope changes', async () => {
  let resolveOld!: (value: VersionHistoryCatalog) => void
  history.list.mockImplementationOnce(
    () =>
      new Promise<VersionHistoryCatalog>((resolve) => {
        resolveOld = resolve
      })
  )
  await mount()
  await click('上版验收')
  await mount(currentPlan, 'other-repo')
  await act(async () => resolveOld(catalog))
  expect(document.body.querySelector('[role="dialog"]')).toBeNull()
  expect(document.body.textContent).not.toContain(source.version)
  expect(onSource).not.toHaveBeenCalled()
})
