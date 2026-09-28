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
  ghList: null as null | ((args: { query: string; page: number }) => Promise<unknown>),
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
import { readSdlcCommits, readSdlcRemote } from './overview-sdlc-readings'
import { zoneChartRange } from './overview-zone-series'
const range = zoneChartRange('week', 'UTC')

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
  items: [{ id: 'a', timestamp: 1, committedAt: 1_700_000_000_000 }],
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
  fixture.ghList = async () => ({
    items: [],
    sources: { prs: { owner: 'o', repo: 'r' }, issues: { owner: 'o', repo: 'r' } }
  })
  fixture.rpc = async () => fixture.ghList!({ query: '', page: 1 })
  fixture.rpcCalls = []
  fixture.target = { kind: 'local' }
  ;(window as unknown as { api: unknown }).api = {
    gh: { listWorkItems: (args: { query: string; page: number }) => fixture.ghList!(args) }
  }
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function Probe({ repo }: { repo: Repo | null }): null {
  api = useOverviewSdlc({
    repo,
    baseScope,
    baseWorktreeId: 'tree',
    baseWorktreePath: '/repo',
    range
  })
  return null
}
async function renderHook(repo: Repo | null): Promise<void> {
  await act(async () => root.render(<Probe repo={repo} />))
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

it('reads committer time and follows the native pinned revision beyond 200 commits', async () => {
  const requests: Record<string, unknown>[] = []
  fixture.history = async (_context, options) => {
    const opts = options as Record<string, unknown>
    requests.push(opts)
    return {
      items:
        opts.skip === 0
          ? Array.from({ length: 200 }, (_, id) => ({
              id: String(id),
              timestamp: 1,
              committedAt: 2
            }))
          : [{ id: 'last', committedAt: 3 }],
      currentRef: { revision: 'a'.repeat(40), name: 'bw-orca' },
      hasMore: opts.skip === 0
    }
  }
  const result = await readSdlcCommits({
    worktreeId: 'tree',
    worktreePath: '/repo',
    range,
    current: () => true
  })
  expect(result).toMatchObject({ kind: 'ready', value: { hasMore: false } })
  if (result.kind === 'ready') {
    expect(result.value.items).toHaveLength(201)
    expect(result.value.items[0].timestamp).toBe(2)
  }
  expect(requests[1]).toMatchObject({ skip: 200, revision: 'a'.repeat(40) })
})
it('GitHub uses the owning runtime and reports merge timestamps, not update timestamps', async () => {
  fixture.target = { kind: 'environment', environmentId: 'env-1' }
  fixture.rpc = async () => ({
    items: [{ id: 'pr:1', mergedAt: '2026-09-24T10:00:00Z', updatedAt: '2026-09-28T10:00:00Z' }],
    sources: { prs: { owner: 'o', repo: 'r', host: 'ghe.example' } }
  })
  const result = await readSdlcRemote(githubRepo, 'github', 'pr', range, () => true)
  expect(result).toMatchObject({
    kind: 'ready',
    value: { items: [{ timestamp: Date.parse('2026-09-24T10:00:00Z') }], source: 'ghe.example/o/r' }
  })
  expect(fixture.rpcCalls[0]).toMatchObject({
    method: 'github.listWorkItems',
    params: { repo: 'gh-repo', noCache: true }
  })
})
it('GitHub follows pages and refuses missing timestamps or a per-source permission error', async () => {
  const source = { owner: 'o', repo: 'r' }
  fixture.ghList = async ({ page }) => ({
    sources: { prs: source },
    items:
      page === 1
        ? Array.from({ length: 100 }, (_, id) => ({
            id: String(id),
            mergedAt: '2026-09-24T10:00:00Z'
          }))
        : []
  })
  const result = await readSdlcRemote(githubRepo, 'github', 'pr', range, () => true)
  if (result.kind !== 'ready') {
    throw new Error('expected ready')
  }
  expect(result.value.items).toHaveLength(100)
  fixture.ghList = async () => ({
    sources: { prs: source },
    items: [{ id: 'pr:1', updatedAt: '2026-09-24T10:00:00Z' }]
  })
  expect(await readSdlcRemote(githubRepo, 'github', 'pr', range, () => true)).toMatchObject({
    kind: 'error',
    message: '合入时间缺失，无法统计趋势'
  })
  fixture.ghList = async () => ({
    sources: { prs: source },
    items: [],
    errors: { prs: { message: 'forbidden' } }
  })
  expect(await readSdlcRemote(githubRepo, 'github', 'pr', range, () => true)).toEqual({
    kind: 'error',
    message: 'forbidden'
  })
})
it('CodeHub complete results preserve merge time; the query cap stays unknown', async () => {
  fixture.listTasks = async () => ({
    remote: { host: 'codehub.example', project: 'g/p' },
    items: [{ iid: 1, mergedAt: '2026-09-24T10:00:00Z' }],
    hasMore: false
  })
  expect(await readSdlcRemote(codehubRepo, 'codehub', 'pr', range, () => true)).toMatchObject({
    kind: 'ready',
    value: { items: [{ timestamp: Date.parse('2026-09-24T10:00:00Z') }] }
  })
  fixture.listTasks = async () => ({ remote: {}, items: [], hasMore: true })
  expect(await readSdlcRemote(codehubRepo, 'codehub', 'issue', range, () => true)).toMatchObject({
    kind: 'error'
  })
})
it('one failed channel does not hide the other sources, and refresh re-reads them', async () => {
  fixture.history = async () => {
    throw new Error('git unavailable')
  }
  await renderHook(codehubRepo)
  expect(api.commits).toEqual({ kind: 'error', message: 'git unavailable' })
  expect(api.issues).toMatchObject({ kind: 'ready', value: { count: 0 } })
  fixture.history = historyOk
  await act(async () => {
    await api.refresh()
  })
  expect(api.commits?.kind).toBe('ready')
})
it('unrecognized provider leaves remote metrics unknown while preserving git', async () => {
  await renderHook(plainRepo)
  expect(api.provider).toBeNull()
  expect(api.merges).toBeNull()
  expect(api.issues).toBeNull()
  expect(api.commits?.kind).toBe('ready')
})

it('does not publish a previous project response after the workspace disappears', async () => {
  let finish!: (value: unknown) => void
  fixture.history = () =>
    new Promise((resolve) => {
      finish = resolve
    })
  await renderHook(plainRepo)
  await renderHook(null)
  await act(async () => {
    finish(await historyOk())
  })
  expect(api.commits).toBeNull()
  expect(api.issues).toBeNull()
})
