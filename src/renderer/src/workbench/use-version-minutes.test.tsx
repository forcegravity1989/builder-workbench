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
  readPlan: null as ((input: unknown) => Promise<unknown>) | null,
  historyRead: null as ((input: unknown) => Promise<unknown>) | null
}))
vi.mock('./version-history-port', () => ({
  nativeVersionHistoryPort: () => ({
    readPlan: (input: unknown) => fixture.readPlan!(input),
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
  fixture.readPlan = async () => ({ document: planDocument, revision, source: { kind: 'draft' } })
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
    planWorktreeId: 'plan-tree',
    acceptanceWorktreeId: 'accept-tree',
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
    planWorktreeId: 'plan-tree',
    acceptanceWorktreeId: 'accept-tree',
    history: { records: [], problems: [] },
    currentVersion: 'v2',
    version: 'v1'
  })
  expect(latest?.acceptance).toBeNull()
})

it('keeps the current plan when the saved acceptance references an older revision', async () => {
  const newerRevision = `sha256:${'c'.repeat(64)}`
  const adoptedPlan: PlanningMaterial = {
    ...planDocument,
    goals: [{ goalId: 'g1', title: '验收采用的目标', metricTargets: [] }]
  }
  const newerPlan: PlanningMaterial = {
    ...planDocument,
    goals: [{ goalId: 'g1', title: '后来调整的目标', metricTargets: [] }]
  }
  const archivedAcceptance: AcceptanceMaterial = {
    ...acceptanceDocument,
    planRef: {
      kind: 'committed',
      version: 'v1',
      cycleId: 'cycle',
      revision,
      sourceCommit: 'a'.repeat(40)
    }
  }
  const record: VersionHistorySource = {
    version: 'v1',
    workflow: 'acceptance',
    cycleId: 'cycle',
    sourceCommit: 'b'.repeat(40),
    revision,
    committedAt: '2026-09-25T00:00:00Z'
  }
  fixture.historyRead = async (input) =>
    (input as { workflow: string }).workflow === 'plan'
      ? { document: newerPlan, revision: newerRevision }
      : { document: archivedAcceptance, revision }
  const readPlan = vi.fn(async () => ({
    document: adoptedPlan,
    revision,
    source: { kind: 'committed', sourceCommit: 'a'.repeat(40) }
  }))
  fixture.readPlan = readPlan
  await render({
    baseScope,
    baseWorktreeId: 'tree',
    planWorktreeId: 'plan-tree',
    acceptanceWorktreeId: 'accept-tree',
    history: {
      records: [
        record,
        {
          ...record,
          workflow: 'plan',
          sourceCommit: 'c'.repeat(40),
          revision: newerRevision,
          committedAt: '2026-09-26T00:00:00Z'
        }
      ],
      problems: []
    },
    currentVersion: null,
    version: 'v1'
  })
  expect(latest?.acceptance).toBeNull()
  expect(latest?.acceptanceError).toContain('较早计划')
  expect(readPlan).not.toHaveBeenCalled()
  expect(latest?.planDocument).toEqual(newerPlan)
  expect(latest?.plan?.text).toContain('后来调整的目标')
})

it('reports no acceptance column when the live material is invalid', async () => {
  fixture.acceptanceRead = async () => ({ document: { schema_version: 3 }, revision })
  await render({
    baseScope,
    baseWorktreeId: 'tree',
    planWorktreeId: 'plan-tree',
    acceptanceWorktreeId: 'accept-tree',
    history: { records: [], problems: [] },
    currentVersion: 'v1',
    version: 'v1'
  })
  expect(latest?.acceptance).toBeNull()
})

it('does not pair an older acceptance with a newer live plan', async () => {
  fixture.planRead = async () => ({ document: planDocument, revision: `sha256:${'c'.repeat(64)}` })
  fixture.acceptanceRead = async () => ({ document: acceptanceDocument, revision })
  await render({
    baseScope,
    baseWorktreeId: 'tree',
    planWorktreeId: 'plan-tree',
    acceptanceWorktreeId: 'accept-tree',
    history: null,
    currentVersion: 'v1',
    version: 'v1'
  })
  expect(latest?.plan).not.toBeNull()
  expect(latest?.acceptance).toBeNull()
  expect(latest?.acceptanceError).toContain('较早计划')
})
it('reports the exact plan-reference read failure rather than pairing unrelated archives', async () => {
  fixture.readPlan = async () => {
    throw new Error('reference missing')
  }
  fixture.historyRead = async () => ({ document: acceptanceDocument, revision })
  await render({
    baseScope,
    baseWorktreeId: 'tree',
    planWorktreeId: null,
    acceptanceWorktreeId: null,
    history: {
      records: [
        {
          version: 'v1',
          cycleId: 'cycle',
          workflow: 'acceptance',
          revision,
          sourceCommit: 'd'.repeat(40),
          committedAt: '2026-09-25T00:00:00Z'
        }
      ],
      problems: []
    },
    currentVersion: null,
    version: 'v1'
  })
  expect(latest?.acceptanceError).toBe('reference missing')
  expect(latest?.plan).toBeNull()
})
