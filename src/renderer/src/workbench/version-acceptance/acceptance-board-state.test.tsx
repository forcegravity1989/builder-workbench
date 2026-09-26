// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AcceptanceMaterial,
  PlanningMaterial
} from '../../../../shared/workbench/version-material'
import type { VersionCycleContext } from '../version-cycle/cycle-context'
import type {
  VersionHistoryPort,
  VersionHistoryPlan
} from '../../../../shared/workbench/version-history'
import type { VersionDocumentSnapshot } from '../../../../shared/workbench/version-document'
import type { ArchiveStatus } from '../../../../shared/workbench/version-archive'
import { useAcceptanceBoard } from './use-acceptance-board'

const revision = `sha256:${'a'.repeat(64)}`
const plan: PlanningMaterial = {
  schema_version: 3,
  version: 'v0.5',
  cycleId: 'planning',
  summary: { progress: '', risks: '' },
  goals: [{ goalId: 'g1', title: '交付', metricTargets: [] }],
  tasks: []
}
function material(version = 'v0.5'): AcceptanceMaterial {
  return {
    schema_version: 3,
    version,
    cycleId: 'acceptance',
    planRef: {
      kind: 'committed',
      version,
      cycleId: plan.cycleId,
      revision,
      sourceCommit: '1'.repeat(40)
    },
    preparedArtifacts: [],
    candidateRef: { repository: 'github.com/team/repo', version, commit: '2'.repeat(40) },
    results: [{ goalId: 'g1', deliveries: [], readings: [], note: '', nextStep: '' }]
  }
}
let container: HTMLDivElement
let root: Root
let board: ReturnType<typeof useAcceptanceBoard>
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  sessionStorage.clear()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
async function renderBoard(
  pending: Promise<VersionDocumentSnapshot<AcceptanceMaterial> | null>,
  readPlan?: VersionHistoryPort['readPlan'],
  readStatus?: () => Promise<ArchiveStatus>
) {
  const scope = {
    projectId: 'project',
    repoId: 'repo',
    hostId: 'local' as const,
    workflow: 'acceptance' as const
  }
  const read = vi.fn(async (version: string) =>
    version === 'v0.5' ? { document: material(), revision } : pending
  )
  const associateVersion = vi.fn(async () => {})
  const context: VersionCycleContext = {
    scope,
    worktreeId: 'tree',
    error: null,
    session: {
      ...scope,
      worktreeId: 'tree',
      sessionId: 'session',
      tabId: 'tab',
      kind: 'structured',
      title: '验收'
    },
    version: 'v0.5',
    selectVersion: associateVersion,
    materialPort: {
      context: vi.fn(),
      select: vi.fn(),
      read,
      list: vi.fn(async () => []),
      save: vi.fn(),
      previewMigration: vi.fn(),
      migrate: vi.fn()
    },
    sessionPort: {
      prepareRequest: vi.fn()
    },
    taskPort: { listVersion: vi.fn(), refresh: vi.fn(), openDetail: vi.fn() },
    archivePort: {
      readStatus:
        readStatus ??
        vi.fn(async () => ({
          kind: 'not-created' as const,
          checkedAt: '2026-09-25T01:00:00Z'
        })),
      prepareRequest: vi.fn()
    }
  }
  const history: VersionHistoryPort = {
    list: vi.fn(async () => ({ records: [], problems: [] })),
    read: vi.fn(),
    readPlan: vi.fn(
      readPlan ??
        (async () => ({
          document: plan,
          revision,
          planRef: material().planRef,
          source: {
            kind: 'committed' as const,
            sourceCommit: '1'.repeat(40),
            baselineCommit: '1'.repeat(40),
            baselineRef: 'project-baseline'
          }
        }))
    )
  }
  function Harness() {
    board = useAcceptanceBoard({ context, history, recoveryKey: 'test:acceptance' })
    return null
  }
  await act(async () => root.render(<Harness />))
  if (!readPlan) {
    expect(board.plan?.document).toEqual(plan)
  }
  return { history, associateVersion }
}

describe('acceptance draft transitions', () => {
  it.each(['mismatch', 'unavailable'] as const)(
    'shows a failed fixed plan in red and clears that error for a new reference: %s',
    async (failure) => {
      const later = Promise.withResolvers<VersionHistoryPlan>()
      let reads = 0
      await renderBoard(Promise.resolve(null), async () => {
        if (reads++) {
          return later.promise
        }
        if (failure === 'unavailable') {
          throw new Error('宿主读取失败')
        }
        return {
          document: plan,
          revision: `sha256:${'b'.repeat(64)}`,
          planRef: material().planRef,
          source: {
            kind: 'committed',
            sourceCommit: '1'.repeat(40),
            baselineCommit: '1'.repeat(40),
            baselineRef: 'project-baseline'
          }
        }
      })
      expect(board.plan).toBeNull()
      expect(board.error).toContain(failure === 'mismatch' ? '计划来源已改变' : '宿主读取失败')
      expect(board.journey.preparation.kind).toBe('failed')
      await act(async () => {
        const document = board.controller.value!.document
        board.controller.edit({
          ...document,
          planRef: { ...document.planRef, revision: `sha256:${'c'.repeat(64)}` }
        })
      })
      expect(board.plan).toBeNull()
      expect(board.error).toBeNull()
      expect(board.journey.preparation.kind).toBe('pending')
    }
  )
  it.each([false, true])(
    'preserves an intervening input when another version read returns; missing=%s',
    async (missing) => {
      const next = Promise.withResolvers<VersionDocumentSnapshot<AcceptanceMaterial> | null>()
      const { associateVersion } = await renderBoard(next.promise)
      let loading: Promise<void>
      act(() => {
        loading = board.loadVersion('v0.6')
      })
      expect(board.readOnly).toBe(true)
      await act(async () => {
        const document = board.controller.value!.document
        board.controller.edit({
          ...document,
          results: [{ ...document.results[0], note: '切换期间收到的新输入' }]
        })
        next.resolve(missing ? null : { document: material('v0.6'), revision })
        await loading
      })
      expect(board.document!.version).toBe('v0.5')
      expect(board.document!.results[0].note).toBe('切换期间收到的新输入')
      expect(board.error).toContain('已保留当前输入')
      expect(associateVersion).not.toHaveBeenCalled()
    }
  )

  it('keeps the actual plan read time when a later report uses that cached plan', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-25T01:00:00Z'))
    const { history } = await renderBoard(Promise.resolve(null))
    vi.setSystemTime(new Date('2026-09-25T02:00:00Z'))
    await act(async () => {
      await board.buildReport()
    })
    expect(history.readPlan).toHaveBeenCalledOnce()
    expect(board.report).toContain('计划来源核对：已核对（2026-09-25T01:00:00.000Z）')
    expect(board.report).not.toContain('2026-09-25T02:00:00.000Z')
  })

  it('blocks editing during the first archive read and never lets a dirty draft bypass a confirmed archive', async () => {
    const gate = Promise.withResolvers<ArchiveStatus>()
    await renderBoard(Promise.resolve(null), undefined, () => gate.promise)
    expect(board.document!.version).toBe('v0.5')
    expect(board.archivePending).toBe(true)
    expect(board.readOnly).toBe(true)
    const reference = {
      provider: 'github',
      repository: 'github.com/team/repo',
      number: 7,
      materialRevision: revision
    }
    const merged: ArchiveStatus = {
      kind: 'merged',
      reference,
      url: 'https://github.com/team/repo/pull/7',
      checkedAt: '2026-09-25T01:00:00Z',
      checks: 'passed',
      review: 'approved',
      mergeCommit: '4'.repeat(40),
      proof: {
        kind: 'verified',
        value: {
          reference,
          mergeCommit: '4'.repeat(40),
          material: { workflow: 'acceptance', version: 'v0.5', cycleId: 'acceptance', revision },
          checkedAt: '2026-09-25T01:00:00Z'
        }
      }
    }
    await act(async () => {
      gate.resolve(merged)
    })
    expect(board.archivePending).toBe(false)
    expect(board.archived).toBe(true)
    expect(board.readOnly).toBe(true)
    expect(board.journey.archive.kind).toBe('complete')
    await act(async () => {
      const document = board.controller.value!.document
      board.controller.edit({
        ...document,
        results: [{ ...document.results[0], note: '陈旧本机草稿' }]
      })
    })
    expect(board.draft!.dirty).toBe(true)
    expect(board.archived).toBe(true)
    expect(board.readOnly).toBe(true)
    await act(async () => {
      await board.discardLocal()
    })
    expect(board.draft!.dirty).toBe(false)
    expect(board.document!.results[0].note).toBe('')
    expect(board.archived).toBe(true)
  })

  it('reopens editing when the first archive read fails, without claiming any archive state', async () => {
    await renderBoard(Promise.resolve(null), undefined, async () => {
      throw new Error('CodeHub 不可用')
    })
    expect(board.archivePending).toBe(false)
    expect(board.archived).toBe(false)
    expect(board.archive.kind).toBe('unknown')
    expect(board.readOnly).toBe(false)
  })
})
