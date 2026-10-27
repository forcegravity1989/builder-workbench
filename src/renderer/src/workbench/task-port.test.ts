import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Repo } from '../../../shared/repo-types'
import type { CodeHubTaskDetail } from '../../../shared/codehub-tasks'
import type { GitHubWorkItem } from '../../../shared/github/work-item-types'
import type { CycleTaskReference } from './version-cycle/ports'
import type { TaskPortDeps } from './task-port'

const mocks = vi.hoisted(() => ({
  storeState: {
    repos: [] as Repo[],
    openTaskPage: vi.fn()
  },
  lookupGitHub: vi.fn(),
  viewTask: vi.fn()
}))
vi.mock('@/store', () => ({ useAppStore: { getState: () => mocks.storeState } }))
vi.mock('@/lib/github-work-item-source-lookup', () => ({
  lookupGitHubWorkItemForSource: mocks.lookupGitHub
}))
vi.mock('@/lib/codehub-api', () => ({ codehubApi: { viewTask: mocks.viewTask } }))

import { createTaskPort } from './task-port'

const githubRepo = {
  id: 'repo-gh',
  path: '/repos/bw',
  displayName: 'bw',
  badgeColor: '',
  addedAt: 0,
  gitRemoteIdentity: {
    canonicalKey: 'github.com/acme/repo',
    remoteUrl: 'https://github.com/acme/repo.git'
  }
} as unknown as Repo
const codehubRepo = {
  id: 'repo-ch',
  path: '/repos/ch',
  displayName: 'ch',
  badgeColor: '',
  addedAt: 0,
  gitRemoteIdentity: {
    canonicalKey: 'codehub.example.com/team/project',
    remoteUrl: 'https://codehub.example.com/team/project.git'
  }
} as unknown as Repo

const scope = { projectId: 'p1', repoId: 'repo-gh', hostId: 'local', workflow: 'plan' } as const
const ghReference: CycleTaskReference = {
  provider: 'github',
  repository: 'github.com/acme/repo',
  number: 95
}
const chReference: CycleTaskReference = {
  provider: 'codehub',
  repository: 'https://codehub.example.com/team/project.git',
  number: 7
}
const ghItem = {
  id: 'i95',
  type: 'issue',
  number: 95,
  title: '真实标题',
  state: 'open',
  url: 'https://github.com/acme/repo/issues/95',
  labels: [],
  updatedAt: '2026-09-20T00:00:00.000Z',
  author: 'octocat'
} as Omit<GitHubWorkItem, 'repoId'>
const chDetail: CodeHubTaskDetail = {
  iid: 7,
  title: 'CodeHub 任务',
  description: '正文不落地',
  state: 'opened',
  url: null,
  author: 'ada',
  assignees: [],
  reviewers: [],
  labels: [],
  sourceBranch: null,
  targetBranch: null
}

function makeDeps(overrides: Partial<TaskPortDeps> = {}): TaskPortDeps {
  return {
    repos: () => [githubRepo, codehubRepo],
    lookupGitHubWorkItem: mocks.lookupGitHub,
    viewCodeHubTask: mocks.viewTask,
    openTaskPage: mocks.storeState.openTaskPage,
    now: () => '2026-09-26T00:00:00.000Z',
    ...overrides
  }
}

beforeEach(() => {
  mocks.lookupGitHub.mockReset()
  mocks.viewTask.mockReset()
  mocks.storeState.openTaskPage.mockReset()
  mocks.storeState.repos = [githubRepo, codehubRepo]
})

describe('createTaskPort reads', () => {
  it('reads real github facts through the native lookup', async () => {
    mocks.lookupGitHub.mockResolvedValue(ghItem)
    const [read] = await createTaskPort(makeDeps()).listVersion(scope, [ghReference])
    expect(read?.kind).toBe('ready')
    if (read?.kind !== 'ready') {
      return
    }
    expect(read.task).toEqual({
      reference: ghReference,
      source: expect.objectContaining({ provider: 'github', repoId: 'repo-gh' }),
      iid: 95,
      title: '真实标题',
      state: 'open',
      url: 'https://github.com/acme/repo/issues/95',
      labels: [],
      assignee: undefined,
      readAt: '2026-09-26T00:00:00.000Z'
    })
    expect(mocks.lookupGitHub).toHaveBeenCalledWith(
      expect.objectContaining({ repoPath: '/repos/bw', repoId: 'repo-gh', number: 95 })
    )
  })

  it('coalesces overlapping goals, maps cached references, and force-refreshes after an inflight read', async () => {
    let resolveFirst!: (item: typeof ghItem) => void
    mocks.lookupGitHub
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirst = resolve
        })
      )
      .mockResolvedValueOnce({ ...ghItem, state: 'closed' })
    const port = createTaskPort(makeDeps())
    const goalRef = { ...ghReference, goalId: 'g2' }
    const first = port.listVersion(scope, [ghReference, ghReference])
    const overlap = port.listVersion(scope, [goalRef])
    const forced = port.refresh(scope, [goalRef])
    expect(mocks.lookupGitHub).toHaveBeenCalledTimes(1)
    resolveFirst(ghItem)
    expect((await first).map((read) => read.kind)).toEqual(['ready', 'ready'])
    expect((await overlap)[0]?.reference).toEqual(goalRef)
    const [fresh] = await forced
    expect(fresh?.kind === 'ready' && fresh.task.state).toBe('closed')
    expect(mocks.lookupGitHub).toHaveBeenCalledTimes(2)
    expect(port.cached?.(scope, [goalRef])?.[0]?.reference).toEqual(goalRef)
  })

  it('splits more than 200 references and only supplements a failed native query', async () => {
    const batch = vi.fn(async ({ numbers }: { numbers: number[] }) =>
      numbers.includes(41)
        ? { items: [], error: 'query failed' }
        : { items: numbers.map((number) => ({ ...ghItem, number })) }
    )
    mocks.lookupGitHub.mockImplementation(async ({ number }) => ({ ...ghItem, number }))
    const refs = Array.from({ length: 201 }, (_, index) => ({ ...ghReference, number: index + 1 }))
    const reads = await createTaskPort(makeDeps({ lookupGitHubWorkItems: batch })).listVersion(
      scope,
      refs
    )
    expect(batch).toHaveBeenCalledTimes(11)
    expect(batch.mock.calls.every(([args]) => args.numbers.length <= 20)).toBe(true)
    expect(
      mocks.lookupGitHub.mock.calls.map(([args]) => args.number).sort((a, b) => a - b)
    ).toEqual(Array.from({ length: 20 }, (_, index) => 41 + index))
    expect(reads.every((read) => read.kind === 'ready')).toBe(true)
  })

  it('isolates runtime sources and keeps environment reads off local GitHub batching', async () => {
    const other = { ...githubRepo, id: 'repo-remote', executionHostId: 'runtime:builder' } as Repo
    const batch = vi.fn()
    mocks.lookupGitHub.mockResolvedValue(ghItem)
    const port = createTaskPort(
      makeDeps({ repos: () => [githubRepo, other], lookupGitHubWorkItems: batch })
    )
    const remote = { ...scope, repoId: other.id, hostId: 'runtime:builder' as const }
    await port.listVersion(remote, [ghReference])
    expect(batch).not.toHaveBeenCalled()
    expect(mocks.lookupGitHub).toHaveBeenCalledWith(
      expect.objectContaining({
        repoId: other.id,
        sourceContext: expect.objectContaining({ hostId: 'runtime:builder' })
      })
    )
    expect(port.cached?.(scope, [ghReference])).toBeNull()
    const enterprise = {
      ...githubRepo,
      id: 'repo-ghes',
      gitRemoteIdentity: {
        canonicalKey: 'github.company.example/acme/repo',
        remoteUrl: 'https://github.company.example:8443/acme/repo.git'
      }
    } as Repo
    const enterprisePort = createTaskPort(
      makeDeps({
        repos: () => [enterprise],
        lookupGitHubWorkItems: batch
      })
    )
    await enterprisePort.listVersion({ ...scope, repoId: enterprise.id }, [
      { ...ghReference, repository: enterprise.id }
    ])
    expect(batch).not.toHaveBeenCalled()
    expect(mocks.lookupGitHub).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sourceContext: expect.objectContaining({
          providerIdentity: expect.objectContaining({ host: 'github.company.example:8443' })
        })
      })
    )
    let fork = {
      ...githubRepo,
      upstream: { owner: 'parent', repo: 'repo' },
      issueSourcePreference: 'origin' as const
    } as Repo
    const forkPort = createTaskPort(
      makeDeps({
        repos: () => [fork],
        lookupGitHubWorkItems: batch
      })
    )
    await forkPort.listVersion(scope, [ghReference])
    expect(batch).not.toHaveBeenCalled()
    const upstreamRemote = {
      ...githubRepo,
      issueSourcePreference: 'origin',
      gitRemoteIdentity: { ...githubRepo.gitRemoteIdentity!, remoteName: 'upstream' }
    } as Repo
    await createTaskPort(
      makeDeps({
        repos: () => [upstreamRemote],
        lookupGitHubWorkItems: batch
      })
    ).listVersion(scope, [ghReference])
    expect(batch).not.toHaveBeenCalled()
    fork = { ...fork, issueSourcePreference: 'upstream' }
    expect(forkPort.cached?.(scope, [ghReference])).toBeNull()
    await forkPort.listVersion(scope, [ghReference])
    expect(batch).not.toHaveBeenCalled()
  })

  it('reads CodeHub project references and keeps unknown provider state unavailable', async () => {
    mocks.viewTask.mockResolvedValueOnce({ ...chDetail, iid: 12, url: null })
    const [read] = await createTaskPort(makeDeps()).listVersion(scope, [
      { provider: 'codehub', repository: 'team/project', number: 12 }
    ])
    expect(read?.kind).toBe('ready')
    expect(mocks.viewTask).toHaveBeenCalledWith(expect.objectContaining({ kind: 'issue', iid: 12 }))
    mocks.viewTask.mockResolvedValueOnce({ ...chDetail, state: 'unrecognized' })
    const [unknown] = await createTaskPort(makeDeps()).listVersion(scope, [chReference])
    expect(unknown?.kind).toBe('unavailable')
  })

  it('reads codehub as issue first, then mr, and derives the web url when the CLI omits it', async () => {
    mocks.viewTask
      .mockRejectedValueOnce(new Error('issue not found'))
      .mockResolvedValueOnce(chDetail)
    const [read] = await createTaskPort(makeDeps()).listVersion(scope, [chReference])
    expect(read?.kind).toBe('ready')
    if (read?.kind !== 'ready') {
      return
    }
    expect(read.task.url).toBe('https://codehub.example.com/team/project/-/merge_requests/7')
    expect(read.task.source).toEqual(
      expect.objectContaining({
        provider: 'codehub',
        providerIdentity: expect.objectContaining({ host: 'codehub.example.com' })
      })
    )
    expect(mocks.viewTask).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ kind: 'issue', iid: 7 })
    )
    expect(mocks.viewTask).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'mr' }))
  })

  it('reports both codehub read failures when issue and mr both fail', async () => {
    mocks.viewTask
      .mockRejectedValueOnce(new Error('issue boom'))
      .mockRejectedValueOnce(new Error('mr boom'))
    const [read] = await createTaskPort(makeDeps()).listVersion(scope, [chReference])
    expect(read?.kind).toBe('unavailable')
    if (read?.kind === 'unavailable') {
      expect(read.error).toContain('issue boom')
      expect(read.error).toContain('mr boom')
    }
  })

  it('reports an unwired provider honestly instead of guessing', async () => {
    const [read] = await createTaskPort(makeDeps()).listVersion(scope, [
      { provider: 'gitlab', repository: 'github.com/acme/repo', number: 1 }
    ])
    expect(read).toEqual({
      kind: 'unavailable',
      reference: { provider: 'gitlab', repository: 'github.com/acme/repo', number: 1 },
      error: 'provider gitlab 尚未接入 Workbench 任务读取',
      readAt: '2026-09-26T00:00:00.000Z'
    })
    const [missing] = await createTaskPort(makeDeps({ repos: () => [] })).listVersion(scope, [
      ghReference
    ])
    expect(missing?.kind === 'unavailable' && missing.error).toContain('github.com/acme/repo')
  })
})
