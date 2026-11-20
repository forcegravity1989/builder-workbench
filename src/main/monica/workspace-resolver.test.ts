import { describe, expect, it, vi } from 'vitest'
import {
  createMonicaWorkspaceResolver,
  nativeMonicaWorkspaceHost,
  type MonicaWorkspaceHost
} from './workspace-resolver'

function fixture() {
  const repos: ReturnType<MonicaWorkspaceHost['listRepos']> = [
    { id: 'repo', path: '/local/project', kind: 'git' },
    { id: 'repo', path: '/remote/project', kind: 'git', executionHostId: 'ssh:builder' }
  ]
  const trees: Awaited<ReturnType<MonicaWorkspaceHost['listWorktrees']>> = [
    {
      id: 'tree',
      repoId: 'repo',
      path: '/local/tree',
      hostId: 'local',
      isArchived: false,
      isMainWorktree: false
    },
    {
      id: 'tree',
      repoId: 'repo',
      path: '/remote/tree',
      hostId: 'ssh:builder',
      isArchived: false,
      isMainWorktree: false
    }
  ]
  const listWorktrees = vi.fn(async () => trees)
  const host: MonicaWorkspaceHost = { listRepos: () => repos, listWorktrees }
  return { repos, trees, host, listWorktrees, resolver: createMonicaWorkspaceResolver(host) }
}

describe('registered workbench workspace identity', () => {
  it('isolates duplicate IDs by host and rechecks captured identity and paths', async () => {
    const { resolver, trees } = fixture()
    const scope = { repoId: 'repo', worktreeId: 'tree', hostId: 'ssh:builder' }
    const resolved = await resolver.resolve(scope)
    expect(resolved.target).toEqual({
      hostId: 'ssh:builder',
      repoPath: '/remote/project',
      worktreePath: '/remote/tree',
      isMainWorktree: false
    })
    scope.hostId = 'local'
    await resolved.reauthorize()
    trees[1].path = '/remote/moved'
    await expect(resolved.reauthorize()).rejects.toMatchObject({ code: 'invalid-scope' })
    expect(resolved.target.worktreePath).toBe('/remote/tree')
  })

  it('does not reinterpret malformed or contradictory repository ownership as local', async () => {
    const { repos, resolver, listWorktrees } = fixture()
    const scope = { repoId: 'repo', worktreeId: 'tree', hostId: 'local' }
    repos[0].executionHostId = 'bad-host' as never
    await expect(resolver.resolve(scope)).rejects.toMatchObject({ code: 'invalid-scope' })
    repos[0].executionHostId = 'local'
    repos[0].connectionId = 'builder'
    await expect(resolver.resolve(scope)).rejects.toMatchObject({ code: 'invalid-scope' })
    expect(listWorktrees).not.toHaveBeenCalled()
  })

  it('rejects archived, projected and malformed worktrees without selecting another host', async () => {
    const { trees, resolver } = fixture()
    const scope = { repoId: 'repo', worktreeId: 'tree', hostId: 'ssh:builder' }
    trees[1].isArchived = true
    await expect(resolver.resolve(scope)).rejects.toMatchObject({ code: 'invalid-scope' })
    trees[1].isArchived = false
    trees[1].runtimeOwnerEnvironmentId = 'hub'
    await expect(resolver.resolve(scope)).rejects.toMatchObject({ code: 'invalid-scope' })
    trees[1].runtimeOwnerEnvironmentId = undefined
    trees[1].hostId = 'invalid' as never
    await expect(resolver.resolve(scope)).rejects.toMatchObject({ code: 'invalid-scope' })
    await expect(resolver.resolve({ ...scope, hostId: 'runtime:hub' })).rejects.toMatchObject({
      code: 'invalid-scope'
    })
  })

  it('passes the explicit host and preserves UNKNOWN selector misses', async () => {
    const { host, trees } = fixture()
    const showManagedWorktree = vi.fn(async () => trees[1])
    const native = nativeMonicaWorkspaceHost({ listRepos: host.listRepos, showManagedWorktree })
    const resolver = createMonicaWorkspaceResolver(native)
    const scope = { repoId: 'repo', worktreeId: 'tree', hostId: 'ssh:builder' }
    const { reauthorize } = await resolver.resolve(scope)
    await reauthorize()
    expect(showManagedWorktree).toHaveBeenCalledTimes(2)
    expect(showManagedWorktree).toHaveBeenCalledWith('id:tree', 'ssh:builder')
    showManagedWorktree.mockRejectedValueOnce(new Error('selector_not_found'))
    await expect(resolver.resolve(scope)).rejects.toThrow('selector_not_found')
    // Only the runtime's explicit local disappearance verdict is actionable; a generic miss may
    // be a temporary scan gap and must keep the retry path.
    showManagedWorktree.mockRejectedValueOnce(
      Object.assign(new Error('selector_not_found'), { worktreeGoneEvidence: true })
    )
    await expect(resolver.resolve(scope)).rejects.toMatchObject({ code: 'workspace-gone' })
  })
})
