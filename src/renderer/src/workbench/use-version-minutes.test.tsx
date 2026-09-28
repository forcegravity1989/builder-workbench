// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type {
  AcceptanceMaterial,
  PlanningMaterial
} from '../../../shared/workbench/version-material'
import type { VersionHistorySource } from '../../../shared/workbench/version-history'
import type { NativeWorkspaceScope } from './version-cycle/native-workspace'

const revision = `sha256:${'a'.repeat(64)}`
const fixture = vi.hoisted(() => ({
  planRead: null as ((version: string) => Promise<unknown>) | null,
  acceptanceRead: null as ((version: string) => Promise<unknown>) | null,
  historyRead: null as ((input: unknown) => Promise<unknown>) | null
}))
vi.mock('./version-history-port', () => ({
  nativeVersionHistoryPort: () => ({
    read: async (input: unknown) => {
      if (!fixture.historyRead) {
        throw new Error('unexpected history read')
      }
      return fixture.historyRead(input)
    }
  })
}))
vi.mock('./version-material-port', () => ({
  nativeVersionMaterialPort: (scope: { workflow: string }) => ({
    read: async (version: string) => {
      const read = scope.workflow === 'plan' ? fixture.planRead : fixture.acceptanceRead
      return read ? read(version) : null
    }
  })
}))
import { useVersionMinutes, type VersionMinutes } from './use-version-minutes'

const planDocument: PlanningMaterial = {
  schema_version: 3,
  version: 'v1',
  cycleId: 'cycle',
  summary: { progress: 'p', risks: '' },
  goals: [],
  tasks: []
}
const acceptanceDocument: AcceptanceMaterial = {
  schema_version: 3,
  version: 'v1',
  cycleId: 'cycle',
  planRef: {
    kind: 'draft',
    version: 'v1',
    cycleId: 'cycle',
    revision,
    sourceWorktreeId: 'tree',
    sourceHostId: 'local'
  },
  preparedArtifacts: [],
  results: []
}
const baseScope = { projectId: 'p', repoId: 'r', hostId: 'local' } as NativeWorkspaceScope

let root: Root
let container: HTMLDivElement
let latest: VersionMinutes | null
function Harness(props: Parameters<typeof useVersionMinutes>[0]) {
  latest = useVersionMinutes(props)
  return null
}
async function render(props: Parameters<typeof useVersionMinutes>[0]) {
  await act(async () => {
    root.render(<Harness {...props} />)
  })
  await act(async () => {})
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  latest = null
  fixture.planRead = async () => ({ document: planDocument, revision })
  fixture.acceptanceRead = async () => null
  fixture.historyRead = null
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

it('falls back to live acceptance material for the in-progress version', async () => {
  fixture.acceptanceRead = async () => ({ document: acceptanceDocument, revision })
  await render({
    baseScope,
    baseWorktreeId: 'tree',
    history: { records: [], problems: [] },
    currentVersion: 'v1',
    version: 'v1'
  })
  expect(latest?.acceptance?.source).toBe('当前材料（未归档）')
  expect(latest?.acceptance?.document.version).toBe('v1')
})

it('keeps a non-current version honest: no archive record means no acceptance column', async () => {
  fixture.acceptanceRead = async () => ({ document: acceptanceDocument, revision })
  await render({
    baseScope,
    baseWorktreeId: 'tree',
    history: { records: [], problems: [] },
    currentVersion: 'v2',
    version: 'v1'
  })
  expect(latest?.acceptance).toBeNull()
})

it('prefers the archive record over live material', async () => {
  const record: VersionHistorySource = {
    version: 'v1',
    workflow: 'acceptance',
    cycleId: 'cycle',
    sourceCommit: 'b'.repeat(40),
    revision,
    committedAt: '2026-09-25T00:00:00Z'
  }
  fixture.historyRead = async () => ({ document: acceptanceDocument })
  await render({
    baseScope,
    baseWorktreeId: 'tree',
    history: { records: [record], problems: [] },
    currentVersion: 'v1',
    version: 'v1'
  })
  expect(latest?.acceptance?.source).toContain('归档 bbbbbbbbbbbb')
})

it('reports no acceptance column when the live material is invalid', async () => {
  fixture.acceptanceRead = async () => ({ document: { schema_version: 3 }, revision })
  await render({
    baseScope,
    baseWorktreeId: 'tree',
    history: { records: [], problems: [] },
    currentVersion: 'v1',
    version: 'v1'
  })
  expect(latest?.acceptance).toBeNull()
})
