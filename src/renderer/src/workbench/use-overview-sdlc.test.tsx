// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Repo } from '../../../shared/repo-types'
import type { NativeWorkspaceScope } from './version-cycle/native-workspace'
import type { OverviewSdlcState } from './use-overview-sdlc'

const fixture = vi.hoisted(() => ({
  history: null as null | ((args: unknown, opts: unknown) => Promise<unknown>),
  listTasks: null as null | ((args: unknown) => Promise<unknown>),
  ghListIssues: null as null | ((args: unknown) => Promise<unknown[]>),
  rpc: null as null | ((target: unknown, method: string, params: unknown) => Promise<unknown>),
  rpcCalls: [] as { method: string; params: unknown }[],
  target: { kind: 'local' } as { kind: 'local' } | { kind: 'environment'; environmentId: string }
}))

vi.mock('@/store', () => ({ useAppStore: { getState: () => ({ settings: {} }) } }))
vi.mock('@/lib/connection-owner-resolution', () => ({
  getConnectionIdFromState: () => undefined
}))
vi.mock('@/runtime/runtime-git-status-client', () => ({
  getRuntimeGitHistory: (args: unknown, opts: unknown) => {
    if (!fixture.history) {
      throw new Error('history not configured')
    }
    return fixture.history(args, opts)
  }
}))
vi.mock('@/runtime/runtime-rpc-client', () => ({
  callRuntimeRpc: (target: unknown, method: string, params: unknown) => {
    fixture.rpcCalls.push({ method, params })
    if (!fixture.rpc) {
      throw new Error('rpc not configured')
    }
    return fixture.rpc(target, method, params)
  }
}))
vi.mock('@/lib/codehub-api', () => ({
  codehubApi: {
    listTasks: (args: unknown) => {
      if (!fixture.listTasks) {
        throw new Error('listTasks not configured')
      }
      return fixture.listTasks(args)
    }
  }
}))
vi.mock('@/components/task-page-source-context', () => ({
  getTaskPageRepoSourceContext: () => ({ provider: 'github', repoId: 'repo', hostId: 'local' })
}))
vi.mock('@/lib/github-source-runtime-context', () => ({
  getGitHubSourceRuntimeTarget: () => fixture.target,
  getGitHubRuntimeRepoId: () => 'gh-repo'
}))

import { useOverviewSdlc } from './use-overview-sdlc'

const baseScope = { projectId: 'p', repoId: 'repo', hostId: 'local' } as NativeWorkspaceScope
const codehubRepo = {
  id: 'repo',
  path: '/repo',
  gitRemoteIdentity: {
    remoteUrl: 'git@codehub.example.com:g/p.git',
    canonicalKey: 'codehub.example.com/g/p',
    remoteName: 'origin'
  }
} as Repo
const githubRepo = { id: 'repo', path: '/repo', upstream: { owner: 'o', repo: 'r' } } as Repo
const plainRepo = {
  id: 'repo',
  path: '/repo',
  gitRemoteIdentity: {
    remoteUrl: 'https://gitlab.com/g/p.git',
    canonicalKey: 'gitlab.com/g/p',
    remoteName: 'origin'
  }
} as Repo

const historyOk = async () => ({
  items: [{ timestamp: 1_700_000_000_000 }, { id: 'x', timestamp: undefined }],
  hasMore: false,
  hasIncomingChanges: false,
  hasOutgoingChanges: false,
  limit: 200
})

let root: Root
let container: HTMLDivElement
let api: OverviewSdlcState

beforeEach(() => {
  fixture.history = historyOk
  fixture.listTasks = async () => ({ remote: {}, items: [], hasMore: false })
  fixture.ghListIssues = async () => []
  fixture.rpc = async () => []
  fixture.rpcCalls = []
  fixture.target = { kind: 'local' }
  ;(window as unknown as { api: unknown }).api = {
    gh: { listIssues: (args: unknown) => fixture.ghListIssues?.(args) ?? [] }
  }
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

async function renderHook(repo: Repo | null): Promise<void> {
  function Probe(): null {
    api = useOverviewSdlc({ repo, baseScope, baseWorktreeId: 'tree', baseWorktreePath: '/repo' })
    return null
  }
  await act(async () => root.render(<Probe />))
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

it('CodeHub 项目：提交走原生历史，开放 Issue 走 listTasks 并如实标截断', async () => {
  fixture.listTasks = async () => ({
    remote: {},
    items: [{ iid: 1 }, { iid: 2 }, { iid: 3 }],
    hasMore: true
  })
  await renderHook(codehubRepo)
  expect(api.provider).toBe('codehub')
  expect(api.commits?.kind).toBe('ready')
  if (api.commits?.kind === 'ready') {
    expect(api.commits.value.items).toEqual([
      { timestamp: 1_700_000_000_000 },
      { timestamp: undefined }
    ])
    expect(api.commits.value.hasMore).toBe(false)
    expect(api.commits.value.readAt).toBeTruthy()
  }
  expect(api.issues).toMatchObject({ kind: 'ready', value: { count: 3, truncated: true } })
})

it('GitHub 项目本地目标走 window.api；environment 目标走 github.listIssues RPC', async () => {
  fixture.ghListIssues = async () => [{ number: 1 }, { number: 2 }]
  await renderHook(githubRepo)
  expect(api.issues).toMatchObject({ kind: 'ready', value: { count: 2, truncated: false } })
  expect(fixture.rpcCalls).toHaveLength(0)

  fixture.target = { kind: 'environment', environmentId: 'env-1' }
  fixture.rpc = async () => [{ number: 5 }]
  await act(async () => root.unmount())
  container.remove()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await renderHook(githubRepo)
  expect(fixture.rpcCalls).toEqual([
    { method: 'github.listIssues', params: { repo: 'gh-repo', limit: 100 } }
  ])
  expect(api.issues).toMatchObject({ kind: 'ready', value: { count: 1, truncated: false } })
})

it('提交通道失败只影响提交系列，Issue 存量照常呈现', async () => {
  fixture.history = async () => {
    throw new Error('git 不可用')
  }
  fixture.listTasks = async () => ({ remote: {}, items: [{ iid: 9 }], hasMore: false })
  await renderHook(codehubRepo)
  expect(api.commits).toEqual({ kind: 'error', message: 'git 不可用' })
  expect(api.issues).toMatchObject({ kind: 'ready', value: { count: 1, truncated: false } })
})

it('未识别任务来源时 Issue 保持空，提交序列不受影响', async () => {
  await renderHook(plainRepo)
  expect(api.provider).toBeNull()
  expect(api.issues).toBeNull()
  expect(api.commits?.kind).toBe('ready')
})

it('refresh 重新读取两个系列；无仓库或无主工作树时保持未读取', async () => {
  const calls: number[] = []
  fixture.history = async () => {
    calls.push(1)
    return historyOk()
  }
  await renderHook(codehubRepo)
  expect(calls).toHaveLength(1)
  await act(async () => {
    await api.refresh()
  })
  expect(calls).toHaveLength(2)

  await act(async () => root.unmount())
  container.remove()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await renderHook(null)
  expect(api.commits).toBeNull()
  expect(api.issues).toBeNull()
  expect(calls).toHaveLength(2)
})
