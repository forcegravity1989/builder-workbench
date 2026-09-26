import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Repo } from '../../../shared/repo-types'
import type { CodeHubTaskDetail } from '../../../shared/codehub-tasks'
import type { GitHubWorkItem } from '../../../shared/github/work-item-types'
import type { CycleTaskReference, TaskOrigin } from './version-cycle/ports'
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

import { createTaskPort, nativeTaskPort } from './task-port'

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
const origin: TaskOrigin = {
  ...scope,
  page: 'plan',
  version: 'v0.5',
  cycleId: 'c1',
  worktreeId: 'wt-1',
  scrollTop: 120,
  draftKey: 'bw:plan:draft:x'
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
  reviewers: []
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
      readAt: '2026-09-26T00:00:00.000Z'
    })
    expect(mocks.lookupGitHub).toHaveBeenCalledWith(
      expect.objectContaining({ repoPath: '/repos/bw', repoId: 'repo-gh', number: 95 })
    )
  })

  it('returns unavailable with error and readAt when github finds nothing, without failing the batch', async () => {
    mocks.lookupGitHub.mockResolvedValueOnce(null).mockResolvedValueOnce(ghItem)
    const reads = await createTaskPort(makeDeps()).listVersion(scope, [ghReference, ghReference])
    expect(reads[0]).toEqual({
      kind: 'unavailable',
      reference: ghReference,
      error: 'GitHub 未返回编号 95 的工作项',
      readAt: '2026-09-26T00:00:00.000Z'
    })
    expect(reads[1]?.kind).toBe('ready')
  })

  it('refresh surfaces a rejected provider read as unavailable, not a failed batch', async () => {
    mocks.lookupGitHub.mockRejectedValue(new Error('gh: auth required'))
    const [read] = await createTaskPort(makeDeps()).refresh(scope, [ghReference])
    expect(read).toEqual({
      kind: 'unavailable',
      reference: ghReference,
      error: 'gh: auth required',
      readAt: '2026-09-26T00:00:00.000Z'
    })
  })

  it('reports a missing registered repo as unavailable', async () => {
    const [read] = await createTaskPort(makeDeps({ repos: () => [] })).listVersion(scope, [
      ghReference
    ])
    expect(read?.kind).toBe('unavailable')
    if (read?.kind === 'unavailable') {
      expect(read.error).toContain('github.com/acme/repo')
    }
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
  })
})

describe('createTaskPort openDetail', () => {
  it('opens github detail through the native page with the BW return origin', async () => {
    mocks.lookupGitHub.mockResolvedValue(ghItem)
    const task = {
      reference: ghReference,
      source: { kind: 'task-source', provider: 'github', projectId: 'p', hostId: 'local' },
      iid: 95,
      title: '真实标题',
      state: 'open',
      url: 'https://github.com/acme/repo/issues/95',
      readAt: '2026-09-26T00:00:00.000Z'
    } as const
    await createTaskPort(makeDeps()).openDetail(task, origin)
    expect(mocks.storeState.openTaskPage).toHaveBeenCalledWith(
      expect.objectContaining({
        taskSource: 'github',
        preselectedRepoId: 'repo-gh',
        openGitHubWorkItem: expect.objectContaining({ number: 95, repoId: 'repo-gh' })
      }),
      {
        recordTasksInteraction: false,
        returnToPreviousView: true
      }
    )
  })

  it('opens codehub detail with repo identity for the native detail actions', async () => {
    mocks.viewTask.mockResolvedValue(chDetail)
    const task = {
      reference: chReference,
      source: { kind: 'task-source', provider: 'codehub', projectId: 'p', hostId: 'local' },
      iid: 7,
      title: 'CodeHub 任务',
      state: 'opened',
      url: 'https://codehub.example.com/team/project/-/issues/7',
      readAt: '2026-09-26T00:00:00.000Z'
    } as const
    await createTaskPort(makeDeps()).openDetail(task, { ...origin, page: 'acceptance' })
    expect(mocks.storeState.openTaskPage).toHaveBeenCalledWith(
      expect.objectContaining({
        taskSource: 'codehub',
        openCodeHubTask: expect.objectContaining({
          type: 'issue',
          iid: 7,
          url: task.url,
          repoId: 'repo-ch',
          repoPath: '/repos/ch',
          host: 'codehub.example.com',
          project: 'team/project'
        })
      }),
      expect.objectContaining({ returnToPreviousView: true })
    )
  })

  it('fails with a readable error when the detail re-read finds nothing', async () => {
    mocks.lookupGitHub.mockResolvedValue(null)
    const task = {
      reference: ghReference,
      source: { kind: 'task-source', provider: 'github', projectId: 'p', hostId: 'local' },
      iid: 95,
      title: 't',
      state: 'open',
      url: 'u',
      readAt: '2026-09-26T00:00:00.000Z'
    } as const
    await expect(createTaskPort(makeDeps()).openDetail(task, origin)).rejects.toThrow(
      '无法打开详情'
    )
    expect(mocks.storeState.openTaskPage).not.toHaveBeenCalled()
  })
})

describe('nativeTaskPort', () => {
  it('wires the store repos and native provider wrappers', async () => {
    mocks.lookupGitHub.mockResolvedValue(ghItem)
    const [read] = await nativeTaskPort().listVersion(scope, [ghReference])
    expect(read?.kind).toBe('ready')
    expect(mocks.lookupGitHub).toHaveBeenCalledWith(
      expect.objectContaining({ repoId: 'repo-gh', repoPath: '/repos/bw' })
    )
  })
})
