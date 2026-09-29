// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { PlanningMaterial } from '../../../../shared/workbench/version-material'
import type { nativeVersionMaterialPort } from '../version-material-port'
import { planningDraftKey, usePlanningMaterial } from './use-planning-material'
import type { PlanningAutosaveOptions } from './use-planning-autosave'

type Port = ReturnType<typeof nativeVersionMaterialPort>
type Model = ReturnType<typeof usePlanningMaterial>
const revision = `sha256:${'a'.repeat(64)}`
const document: PlanningMaterial = {
  schema_version: 3,
  version: 'v1',
  cycleId: 'cycle',
  summary: { progress: 'saved', risks: '' },
  goals: [],
  tasks: []
}
const unavailable = async (): Promise<never> => {
  throw new Error('unexpected operation')
}
function makePort(overrides: Partial<Port> = {}): Port {
  return {
    context: unavailable,
    select: unavailable,
    list: async () => [],
    read: async () => null,
    save: unavailable,
    migrate: unavailable,
    previewMigration: unavailable,
    ...overrides
  }
}
let root: Root
let container: HTMLDivElement
let latest: Model
function Harness({
  port,
  scope,
  autosave
}: {
  port: Port
  scope: string
  autosave?: PlanningAutosaveOptions
}) {
  latest = usePlanningMaterial(port, scope, autosave)
  return null
}
async function mount(port: Port, scope: string, autosave?: PlanningAutosaveOptions) {
  await act(async () => {
    root.render(<Harness port={port} scope={scope} autosave={autosave} />)
  })
}
beforeEach(() => {
  localStorage.clear()
  vi.useRealTimers()
  container = documentGlobal.createElement('div')
  documentGlobal.body.append(container)
  root = createRoot(container)
})
const documentGlobal = globalThis.document
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  localStorage.clear()
  vi.useRealTimers()
})

it('ignores a former project read and catalog after switching scope', async () => {
  let finishRead!: (value: Awaited<ReturnType<Port['read']>>) => void
  let finishList!: (value: Awaited<ReturnType<Port['list']>>) => void
  const first = makePort({
    read: () =>
      new Promise((resolve) => {
        finishRead = resolve
      }),
    list: () =>
      new Promise((resolve) => {
        finishList = resolve
      })
  })
  const second = makePort({
    read: async () => ({
      revision,
      document: { ...document, summary: { progress: 'second project', risks: '' } }
    })
  })
  await mount(first, 'first')
  let pending!: Promise<PlanningMaterial | undefined>
  act(() => {
    pending = latest.select('v1')
  })
  await mount(second, 'second')
  await act(async () => {
    await latest.select('v1')
  })
  await act(async () => {
    finishRead({ document, revision })
    finishList([{ version: 'v-stale', state: 'ready' }])
    await pending
  })
  expect(latest.draft?.document.summary.progress).toBe('second project')
  expect(latest.versions).toEqual([])
})

it('recovers edits to an existing version and preserves conflicting file contents', async () => {
  const existing = makePort({ read: async () => ({ document, revision }) })
  await mount(existing, 'project')
  await act(async () => {
    await latest.select('v1')
  })
  act(() => latest.edit({ ...document, summary: { progress: 'unsaved work', risks: '' } }))
  const cached = localStorage.getItem(planningDraftKey('project', 'v1'))
  await mount(makePort(), 'another')
  await mount(existing, 'project')
  await act(async () => {
    await latest.select('v1')
  })
  expect(latest.draft?.document.summary.progress).toBe('unsaved work')
  expect(latest.draft?.dirty).toBe(true)
  expect(latest.draft?.remote).toBeUndefined()
  expect(cached).not.toBeNull()
  const remote = makePort({
    read: async () => ({ document, revision: `sha256:${'b'.repeat(64)}` })
  })
  await mount(remote, 'project')
  await act(async () => {
    await latest.select('v1')
  })
  expect(latest.draft?.document.summary.progress).toBe('unsaved work')
  expect(latest.draft?.remote?.document.summary.progress).toBe('saved')
  expect(latest.draft?.error).toBeTruthy()
  localStorage.setItem(
    planningDraftKey('project', 'v1'),
    JSON.stringify({ ...JSON.parse(cached!), expectedRevision: null })
  )
  await mount(makePort(), 'project')
  await act(async () => {
    await latest.select('v1')
    expect(await latest.flush()).toBeNull()
  })
  expect(latest.draft?.remote).toBeNull()
  expect(latest.draft?.document.summary.progress).toBe('unsaved work')
})

it('persists edits locally immediately but only autosaves after the archive gate and debounce', async () => {
  vi.useFakeTimers()
  const nextRevision = `sha256:${'b'.repeat(64)}`
  const save = vi.fn<Port['save']>(async (input) => ({
    document: input.document,
    revision: nextRevision
  }))
  const port = makePort({ read: async () => ({ document, revision }), save })
  await mount(port, 'project', { canSave: () => false })
  await act(async () => {
    await latest.select('v1')
  })
  act(() => latest.edit({ ...document, summary: { progress: 'new edit', risks: '' } }))
  expect(localStorage.getItem(planningDraftKey('project', 'v1'))).toContain('new edit')
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000)
  })
  expect(save).not.toHaveBeenCalled()
  await mount(port, 'project', { canSave: () => true })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(599)
  })
  expect(save).not.toHaveBeenCalled()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1)
  })
  expect(save).toHaveBeenCalledOnce()
  expect(save.mock.calls[0]?.[0].expectedRevision).toBe(revision)
  expect(latest.draft?.dirty).toBe(false)
  await mount(port, 'project', { canSave: () => false })
  act(() => latest.edit({ ...document, summary: { progress: 'must remain local', risks: '' } }))
  await act(async () => {
    expect(await latest.flush()).toBeNull()
  })
  expect(save).toHaveBeenCalledOnce()
})

it('flush joins an in-flight save and drains newer edits with the returned CAS revision', async () => {
  const first = Promise.withResolvers<Awaited<ReturnType<Port['save']>>>()
  const secondRevision = `sha256:${'b'.repeat(64)}`
  const finalRevision = `sha256:${'c'.repeat(64)}`
  const save = vi
    .fn<Port['save']>()
    .mockImplementationOnce(() => first.promise)
    .mockImplementation(async (input) => ({ document: input.document, revision: finalRevision }))
  const port = makePort({ read: async () => ({ document, revision }), save })
  await mount(port, 'project', { canSave: () => true })
  await act(async () => {
    await latest.select('v1')
  })
  const firstEdit = { ...document, summary: { progress: 'first edit', risks: '' } }
  act(() => latest.edit(firstEdit))
  const flush = latest.flush
  let pending!: ReturnType<Model['flush']>
  act(() => {
    pending = flush()
  })
  act(() => latest.edit({ ...document, summary: { progress: 'newer edit', risks: '' } }))
  expect(latest.flush).toBe(flush)
  expect(latest.flush()).toBe(pending)
  await act(async () => {
    first.resolve({ document: firstEdit, revision: secondRevision })
    expect(await pending).toMatchObject({
      revision: finalRevision,
      document: { summary: { progress: 'newer edit' } }
    })
  })
  expect(save).toHaveBeenCalledTimes(2)
  expect(save.mock.calls[1]?.[0].expectedRevision).toBe(secondRevision)
  expect(latest.draft?.dirty).toBe(false)
  expect(latest.busy).toBe(false)
})

it('stops automatic writes on a revision conflict and retains both drafts until explicit resolution', async () => {
  vi.useFakeTimers()
  const remoteRevision = `sha256:${'b'.repeat(64)}`
  let remote = { document, revision }
  const save = vi.fn<Port['save']>(async () => {
    remote = {
      document: { ...document, summary: { progress: 'model edit', risks: '' } },
      revision: remoteRevision
    }
    throw Object.assign(new Error('revision changed'), { code: 'revision-conflict' })
  })
  await mount(makePort({ read: async () => remote, save }), 'project', { canSave: () => true })
  await act(async () => {
    await latest.select('v1')
  })
  act(() => latest.edit({ ...document, summary: { progress: 'human edit', risks: '' } }))
  await act(async () => {
    await vi.advanceTimersByTimeAsync(600)
  })
  expect(latest.draft?.document.summary.progress).toBe('human edit')
  expect(latest.draft?.remote?.document.summary.progress).toBe('model edit')
  expect(localStorage.getItem(planningDraftKey('project', 'v1'))).toContain('human edit')
  await act(async () => {
    await vi.advanceTimersByTimeAsync(6000)
  })
  await act(async () => {
    expect(await latest.flush()).toBeNull()
  })
  expect(save).toHaveBeenCalledOnce()
})

it('does not let a former project save publish into the new project or leave it busy', async () => {
  const pendingSave = Promise.withResolvers<Awaited<ReturnType<Port['save']>>>()
  const saveFirst = vi.fn<Port['save']>(() => pendingSave.promise)
  const first = makePort({ read: async () => ({ document, revision }), save: saveFirst })
  const saveSecond = vi.fn<Port['save']>(async (input) => ({ document: input.document, revision }))
  const second = makePort({ read: async () => ({ document, revision }), save: saveSecond })
  await mount(first, 'first', { canSave: () => true })
  await act(async () => {
    await latest.select('v1')
  })
  act(() => latest.edit({ ...document, summary: { progress: 'first project draft', risks: '' } }))
  let savingFirst!: ReturnType<Model['flush']>
  act(() => {
    savingFirst = latest.flush()
  })
  await mount(second, 'second', { canSave: () => true })
  await act(async () => {
    await latest.select('v1')
  })
  act(() => latest.edit({ ...document, summary: { progress: 'second project draft', risks: '' } }))
  await act(async () => {
    await latest.flush()
  })
  await act(async () => {
    pendingSave.resolve({ document, revision })
    expect(await savingFirst).toBeNull()
  })
  expect(saveFirst).toHaveBeenCalledOnce()
  expect(saveSecond).toHaveBeenCalledOnce()
  expect(latest.draft?.document.summary.progress).toBe('second project draft')
  expect(latest.busy).toBe(false)
  expect(localStorage.getItem(planningDraftKey('first', 'v1'))).toContain('first project draft')
})
