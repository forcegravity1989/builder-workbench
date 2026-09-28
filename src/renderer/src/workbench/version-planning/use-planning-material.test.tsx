// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it } from 'vitest'
import type { PlanningMaterial } from '../../../../shared/workbench/version-material'
import type { nativeVersionMaterialPort } from '../version-material-port'
import { planningDraftKey, usePlanningMaterial } from './use-planning-material'

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
function Harness({ port, scope }: { port: Port; scope: string }) {
  latest = usePlanningMaterial(port, scope)
  return null
}
async function mount(port: Port, scope: string) {
  await act(async () => {
    root.render(<Harness port={port} scope={scope} />)
  })
}
beforeEach(() => {
  localStorage.clear()
  container = documentGlobal.createElement('div')
  documentGlobal.body.append(container)
  root = createRoot(container)
})
const documentGlobal = globalThis.document
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  localStorage.clear()
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

it('recovers an explicitly selected unsaved version and preserves conflicting file contents', async () => {
  const empty = makePort()
  await mount(empty, 'project')
  await act(async () => {
    await latest.select('v1', true)
  })
  act(() => latest.edit({ ...document, summary: { progress: 'unsaved work', risks: '' } }))
  const cached = localStorage.getItem(planningDraftKey('project', 'v1'))
  await mount(makePort(), 'another')
  await mount(empty, 'project')
  await act(async () => {
    await latest.select('v1', true)
  })
  expect(latest.draft?.document.summary.progress).toBe('unsaved work')
  expect(latest.draft?.dirty).toBe(true)
  expect(latest.draft?.remote).toBeUndefined()
  expect(cached).not.toBeNull()
  const remote = makePort({ read: async () => ({ document, revision }) })
  await mount(remote, 'project')
  await act(async () => {
    await latest.select('v1')
  })
  expect(latest.draft?.document.summary.progress).toBe('unsaved work')
  expect(latest.draft?.remote?.document.summary.progress).toBe('saved')
  expect(latest.draft?.error).toBeTruthy()
})

