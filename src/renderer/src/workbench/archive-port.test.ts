import { beforeEach, expect, it, vi } from 'vitest'

const call = vi.hoisted(() => vi.fn())
const prepare = vi.hoisted(() => vi.fn())
vi.mock('../runtime/runtime-rpc-client', () => ({ callRuntimeRpc: call }))
vi.mock('./version-cycle/native-session', () => ({ prepareCycleRequest: prepare }))

import { nativeArchivePort } from './archive-port'
import { isArchivedMaterial } from '../../../shared/workbench/version-archive'
import type { ArchiveInput, CycleSession } from './version-cycle/ports'

const revision = `sha256:${'a'.repeat(64)}`
const mergeCommit = 'b'.repeat(40)
const input: ArchiveInput = {
  projectId: 'project',
  repoId: 'repo',
  hostId: 'local',
  workflow: 'plan',
  worktreeId: 'tree',
  version: 'v0.5',
  cycleId: 'cycle-1',
  revision
}
const githubRepo = { owner: 'forcegravity1989', repo: 'builder-workbench' }
const review = (overrides: Record<string, unknown> = {}) => ({
  provider: 'github',
  number: 269,
  title: 'archive',
  state: 'merged',
  url: 'https://github.com/f/pull/269',
  status: 'success',
  updatedAt: '2026-09-26T00:00:00Z',
  mergeable: 'MERGEABLE',
  reviewDecision: 'APPROVED',
  githubRepository: githubRepo,
  ...overrides
})
const proofValue = {
  reference: {
    provider: 'github',
    repository: 'forcegravity1989/builder-workbench',
    number: 269,
    materialRevision: revision
  },
  mergeCommit,
  material: { workflow: 'plan' as const, version: 'v0.5', cycleId: 'cycle-1', revision },
  checkedAt: '2026-09-26T01:00:00Z'
}

function route(byMethod: Record<string, unknown>) {
  byMethod = {
    'workbench.archive.proof': {
      ok: true,
      value: {
        mergeCommit: null,
        changed: true,
        proof: { kind: 'unknown', reason: '当前材料有改动待归档' }
      }
    },
    ...byMethod
  }
  call.mockImplementation(async (_target: unknown, requested: string) => {
    if (!(requested in byMethod)) {
      throw new Error(`unexpected method ${requested}`)
    }
    return byMethod[requested]
  })
}

beforeEach(() => {
  call.mockReset()
  prepare.mockReset()
})

it('proves a merged GitHub review only with matching material bytes', async () => {
  route({
    'hostedReview.forBranch': review(),
    'workbench.archive.proof': {
      ok: true,
      value: { mergeCommit, proof: { kind: 'verified', value: proofValue } }
    }
  })
  const status = await nativeArchivePort().readStatus(input)
  expect(status.kind).toBe('merged')
  expect(status).toMatchObject({ checks: 'unknown', review: 'unknown', mergeCommit })
  expect(isArchivedMaterial(status, proofValue.material)).toBe(true)
  expect(call).toHaveBeenCalledWith(
    { kind: 'local' },
    'workbench.archive.proof',
    {
      repoId: 'repo',
      worktreeId: 'tree',
      hostId: 'local',
      workflow: 'plan',
      version: 'v0.5',
      cycleId: 'cycle-1',
      revision
    },
    { timeoutMs: 60_000 }
  )
})

it('keeps an open review yellow without inventing a merge commit', async () => {
  route({
    'hostedReview.forBranch': review({ state: 'open', status: 'pending', reviewDecision: null })
  })
  const status = await nativeArchivePort().readStatus(input)
  expect(status).toMatchObject({
    kind: 'open',
    checks: 'pending',
    review: 'unknown',
    mergeCommit: null,
    proof: { kind: 'unknown' }
  })
  expect(isArchivedMaterial(status, proofValue.material)).toBe(false)
})

it('keeps changed material pending and stays Unknown for CodeHub', async () => {
  route({
    'hostedReview.forBranch': null,
    'repo.show': {
      repo: { id: 'repo', gitRemoteIdentity: { remoteUrl: 'https://github.com/o/r.git' } }
    }
  })
  expect(await nativeArchivePort().readStatus(input)).toMatchObject({ kind: 'changed' })
  route({
    'hostedReview.forBranch': null,
    'repo.show': {
      repo: {
        id: 'repo',
        gitRemoteIdentity: { remoteUrl: 'https://codehub.internal/group/project.git' }
      }
    }
  })
  const codehub = await nativeArchivePort().readStatus(input)
  expect(codehub).toMatchObject({ kind: 'unknown' })
  expect(codehub.kind === 'unknown' && codehub.reason).toContain('CodeHub')
})

it('reports unsupported forges honestly instead of guessing a reference', async () => {
  route({ 'hostedReview.forBranch': review({ provider: 'gitlab', githubRepository: undefined }) })
  const status = await nativeArchivePort().readStatus(input)
  expect(status).toMatchObject({ kind: 'unknown' })
})

it('routes through the owning runtime and forwards a recorded GitHub reference', async () => {
  route({ 'hostedReview.forBranch': review({ state: 'open' }) })
  await nativeArchivePort('paired').readStatus({
    ...input,
    hostId: 'ssh:server',
    reference: {
      provider: 'github',
      repository: 'owner/project',
      number: 269,
      materialRevision: revision
    }
  })
  expect(call).toHaveBeenCalledWith(
    { kind: 'environment', environmentId: 'paired' },
    'hostedReview.forBranch',
    { repo: 'repo', branch: 'bw/week-plan', linkedGitHubPR: 269 },
    { timeoutMs: 30_000 }
  )
})

it('prepares an editable archive request into the native session composer', async () => {
  const session: CycleSession = {
    projectId: 'project',
    repoId: 'repo',
    hostId: 'local',
    workflow: 'plan',
    worktreeId: 'tree',
    sessionId: 'session',
    tabId: 'tab',
    paneKey: 'pane',
    kind: 'terminal',
    title: '计划会话'
  }
  prepare.mockResolvedValue(undefined)
  await nativeArchivePort().prepareRequest(input, session)
  expect(prepare).toHaveBeenCalledOnce()
  const [preparedSession, text] = prepare.mock.calls[0] as [CycleSession, string]
  expect(preparedSession).toBe(session)
  expect(text).toContain('v0.5')
  expect(text).toContain('.bw/planning/v0.5/data.json')
  expect(text).toContain('在当前 bw/week-plan 固定工作树内提交')
  expect(text).toContain('创建由 bw/week-plan 到主分支的 PR/MR')
  expect(text).toContain('不要另建工作树或分支')
})
