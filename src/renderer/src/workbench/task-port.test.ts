import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Repo } from '../../../shared/repository/repo-types'
import type { CodeHubTaskDetail } from '../../../shared/codehub-tasks'
import type { GitHubWorkItem } from '../../../shared/github/work-items/work-item-types'
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
vi.mock('@/workbench/is-workbench-shell', () => ({ isWorkbenchShell: () => true }))

import { createTaskPort } from './task-port'
import { createTaskReferenceReader } from './task-reference-reader'
import { linkedIssueRepository } from '../../../shared/workbench/version-membership'
import { gitHubIdentityForTaskReference, resolveReferenceRepo } from './task-reference-repo'
import { treeBindMode } from './version-tree-bind-mode'
import type { Worktree } from '../../../shared/worktree/types'

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

    // gh 原生裸 owner/repo 记录（无 host）同样解析到已登记仓库。
    const [bare] = await createTaskPort(makeDeps()).listVersion(scope, [
      { ...ghReference, repository: 'acme/repo' }
    ])
    expect(bare?.kind).toBe('ready')
    expect(bare?.kind === 'ready' && bare.task.source.repoId).toBe('repo-gh')
    const mixedRemote = {
      ...githubRepo,
      gitRemoteIdentity: {
        ...githubRepo.gitRemoteIdentity!,
        canonicalKey: 'github.com/Acme/Repo',
        remoteUrl: 'https://github.com/Acme/Repo.git'
      }
    }
    const mixedRef = {
      ...ghReference,
      repository: linkedIssueRepository('https://github.com/Acme/Repo/issues/95', 'github', 95)!
    }
    expect(resolveReferenceRepo(makeDeps({ repos: () => [mixedRemote] }), scope, mixedRef)).toBe(
      mixedRemote
    )
    expect(gitHubIdentityForTaskReference(mixedRemote, mixedRef.repository)).toMatchObject({
      owner: 'Acme',
      repo: 'Repo'
    })
    expect(gitHubIdentityForTaskReference(githubRepo, 'acme/repo')).toEqual(
      expect.objectContaining({ provider: 'github', owner: 'acme', repo: 'repo' })
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

    const releases: (() => void)[] = []
    const lookup = vi.fn(({ number }: { number: number }) =>
      number === 108
        ? Promise.resolve({ ...ghItem, number })
        : new Promise<typeof ghItem>((resolve) => {
            releases.push(() => resolve({ ...ghItem, number }))
          })
    )
    const reader = createTaskReferenceReader(makeDeps({ lookupGitHubWorkItem: lookup }))
    const references = Array.from({ length: 8 }, (_, index) => ({
      ...ghReference,
      number: 101 + index
    }))
    const controller = new AbortController()
    const optional = reader
      .read(scope, references, false, controller.signal)
      .catch((error) => error.name)
    const shared = reader.read(scope, [references[7]!])
    const queuedRefresh = reader
      .read(scope, [references[0]!], true, controller.signal)
      .catch((error) => error.name)
    expect(lookup).toHaveBeenCalledTimes(6)
    controller.abort()
    releases.forEach((release) => release())
    expect(await optional).toBe('AbortError')
    expect(await queuedRefresh).toBe('AbortError')
    expect((await shared)[0]?.kind).toBe('github')
    expect(lookup.mock.calls.map(([args]) => args.number)).toEqual([
      101, 102, 103, 104, 105, 106, 108
    ])
    expect(reader.cached(scope, [references[6]!])).toBeNull()
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

  it('reads version tasks locally by remote identity, including remote plan sources', async () => {
    const other = { ...githubRepo, id: 'repo-remote', executionHostId: 'runtime:builder' } as Repo
    const remoteBatch = vi.fn().mockResolvedValue({ items: [ghItem] })
    const port = createTaskPort(
      makeDeps({ repos: () => [githubRepo, other], lookupGitHubWorkItems: remoteBatch })
    )
    const remote = { ...scope, repoId: other.id, hostId: 'runtime:builder' as const }
    const [read] = await port.listVersion(remote, [ghReference])
    expect(read?.kind).toBe('ready')
    expect(remoteBatch).toHaveBeenCalledWith({
      host: null,
      owner: 'acme',
      repo: 'repo',
      numbers: [95]
    })
    expect(mocks.lookupGitHub).not.toHaveBeenCalled()
    // 同一远端项目的本机行与远端行共用一份任务缓存，不因来源拆分。
    expect(port.cached?.(scope, [ghReference])?.[0]?.kind).toBe('ready')

    const batch = vi.fn()
    const enterprise = {
      ...githubRepo,
      id: 'repo-ghes',
      gitRemoteIdentity: {
        canonicalKey: 'github.company.example/acme/repo',
        remoteUrl: 'https://github.company.example:8443/acme/repo.git'
      }
    } as Repo
    const defaultPort = {
      ...enterprise,
      id: 'repo-ghes-default',
      gitRemoteIdentity: {
        ...enterprise.gitRemoteIdentity!,
        remoteUrl: 'https://github.company.example/acme/repo.git'
      }
    }
    const defaultRef = { ...ghReference, repository: 'https://github.company.example/acme/repo' }
    expect(
      resolveReferenceRepo(
        makeDeps({ repos: () => [enterprise, defaultPort] }),
        { ...scope, repoId: enterprise.id },
        defaultRef
      )
    ).toBe(defaultPort)
    expect(gitHubIdentityForTaskReference(enterprise, defaultRef.repository)).toBeUndefined()
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
    // 裸 owner/repo 默认 github.com（与归档状态探针的默认一致），不按 tail 配到企业 host。
    expect(
      resolveReferenceRepo(
        makeDeps({ repos: () => [enterprise] }),
        { ...scope, repoId: enterprise.id },
        { ...ghReference, repository: 'acme/repo' }
      )
    ).toBeNull()
    const fork = {
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
    const mixed = {
      ...codehubRepo,
      id: 'repo-mixed',
      gitRemoteIdentity: {
        canonicalKey: 'codehub-g.huawei.com/Org/Group/repo',
        remoteUrl: 'https://codehub-g.huawei.com/Org/Group/repo.git'
      }
    } as Repo
    const mixedKey = linkedIssueRepository(
      'https://codehub-g.huawei.com/Org/Group/repo/issues/12',
      'codehub',
      12
    )
    expect(mixedKey).toBe('codehub-g.huawei.com/org/group/repo')
    expect(
      resolveReferenceRepo(
        makeDeps({ repos: () => [mixed] }),
        { ...scope, repoId: mixed.id },
        { provider: 'codehub', repository: mixedKey ?? '', number: 12 }
      )?.id
    ).toBe('repo-mixed')
    const selected = {
      branch: 'feature',
      linkedIssue: null,
      linkedWorkItem: {
        provider: 'github',
        type: 'issue',
        number: 22,
        title: 'current',
        url: 'https://github.com/acme/repo/issues/22'
      },
      linkedItems: [
        {
          provider: 'github',
          type: 'issue',
          number: 11,
          title: 'first',
          url: 'https://github.com/acme/repo/issues/11'
        },
        {
          provider: 'github',
          type: 'issue',
          number: 22,
          title: 'current',
          url: 'https://github.com/acme/repo/issues/22'
        }
      ]
    } as Worktree
    expect(treeBindMode(selected)).toMatchObject({ kind: 'linked-issue', item: { number: 22 } })
    expect(treeBindMode({ ...selected, linkedWorkItem: undefined } as Worktree).kind).toBe(
      'choose-issue'
    )
    expect(
      treeBindMode({
        branch: 'feature',
        linkedIssue: 12,
        linkedWorkItem: null,
        linkedItems: []
      } as unknown as Worktree)
    ).toMatchObject({ kind: 'linked-issue', item: { number: 12, provider: 'github' } })
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

  it('reports both codehub read failures and unwired providers honestly instead of guessing', async () => {
    mocks.viewTask
      .mockRejectedValueOnce(new Error('issue boom'))
      .mockRejectedValueOnce(new Error('mr boom'))
    const [read] = await createTaskPort(makeDeps()).listVersion(scope, [chReference])
    expect(read?.kind).toBe('unavailable')
    if (read?.kind === 'unavailable') {
      expect(read.error).toContain('issue boom')
      expect(read.error).toContain('mr boom')
    }

    const [unwired] = await createTaskPort(makeDeps()).listVersion(scope, [
      { provider: 'gitlab', repository: 'github.com/acme/repo', number: 1 }
    ])
    expect(unwired).toEqual({
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
