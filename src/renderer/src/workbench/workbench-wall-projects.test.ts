import { describe, expect, it } from 'vitest'
import type { ProjectGroup } from '../../../shared/project-group-types'
import type { Repo } from '../../../shared/repo-types'
import type { Worktree } from '../../../shared/worktree/types'
import { buildWallProjects, countWallProjectWorktrees } from './workbench-wall-projects'

function repo(partial: Partial<Repo> & Pick<Repo, 'id' | 'path' | 'displayName'>): Repo {
  return {
    badgeColor: '#000',
    addedAt: 0,
    ...partial
  }
}

function group(partial: Partial<ProjectGroup> & Pick<ProjectGroup, 'id' | 'name'>): ProjectGroup {
  return {
    parentPath: null,
    parentGroupId: null,
    createdFrom: 'manual',
    tabOrder: 0,
    isCollapsed: false,
    color: null,
    createdAt: 0,
    updatedAt: 0,
    ...partial
  }
}

/** 同一远端仓身份(G3 跨主机归并的稳定判据)。 */
function appIdentity(): Repo['gitRemoteIdentity'] {
  return {
    canonicalKey: 'github.com/acme/app',
    remoteName: 'origin',
    remoteUrl: 'https://github.com/acme/app.git'
  }
}

function worktree(partial: { id: string; repoId: string; hostId?: string }): Worktree {
  return { ...(partial as object), isMainWorktree: false } as unknown as Worktree
}

describe('buildWallProjects', () => {
  it('keeps ungrouped repos as solo cards', () => {
    const projects = buildWallProjects([repo({ id: 'a', path: '/a', displayName: 'Alpha' })], [])
    expect(projects).toHaveLength(1)
    expect(projects[0].key).toBe('solo:row:local::a')
    expect(projects[0].repoIds).toEqual(['a'])
    expect(projects[0].hostIds).toEqual(['local'])
    expect(projects[0].slots[0].localRepoId).toBe('a')
  })

  it('aggregates group members into one wall project', () => {
    const g = group({ id: 'g1', name: 'Platform', tabOrder: 1 })
    const projects = buildWallProjects(
      [
        repo({
          id: 'a',
          path: '/a',
          displayName: 'Core',
          projectGroupId: 'g1',
          projectGroupOrder: 0,
          gitRemoteIdentity: {
            canonicalKey: 'github.com/acme/core',
            remoteName: 'origin',
            remoteUrl: 'git@github.com:acme/core.git'
          }
        }),
        repo({
          id: 'b',
          path: '/b',
          displayName: 'Docs',
          projectGroupId: 'g1',
          projectGroupOrder: 1,
          upstream: { owner: 'acme', repo: 'docs' }
        }),
        repo({ id: 'c', path: '/c', displayName: 'Solo' })
      ],
      [g]
    )
    expect(projects).toHaveLength(2)
    const platform = projects.find((p) => p.key === 'group:g1')
    expect(platform?.name).toBe('Platform')
    expect(platform?.repoIds).toEqual(['a', 'b'])
    expect(platform?.slots).toHaveLength(2)
    expect(projects.find((p) => p.key === 'solo:row:local::c')?.name).toBe('Solo')
  })

  it('merges the same remote identity across paired hosts into one card', () => {
    const projects = buildWallProjects(
      [
        repo({ id: 'a', path: '/a', displayName: 'app', gitRemoteIdentity: appIdentity() }),
        repo({
          id: 'r1',
          path: '/remote/a',
          displayName: 'app',
          executionHostId: 'runtime:env1',
          gitRemoteIdentity: appIdentity()
        })
      ],
      [],
      { environmentIds: new Set(['env1']) }
    )
    expect(projects).toHaveLength(1)
    expect(projects[0].hostIds).toEqual(['local', 'runtime:env1'])
    expect(projects[0].repoIds).toEqual(['a', 'r1'])
    // 同一代码仓跨主机只一槽,展示与删除都落在本机注册行。
    expect(projects[0].slots).toHaveLength(1)
    expect(projects[0].slots[0].localRepoId).toBe('a')
    expect(projects[0].primaryRepoId).toBe('a')
  })

  it('drops rows whose runtime host is no longer paired', () => {
    const stale = repo({
      id: 'r9',
      path: '/remote/gone',
      displayName: 'ghost',
      executionHostId: 'runtime:env-gone',
      gitRemoteIdentity: appIdentity()
    })
    // 只有已删主机的注册:整卡不上墙。
    expect(buildWallProjects([stale], [], { environmentIds: new Set(['env1']) })).toHaveLength(0)
    // 与本机注册同仓:卡在,但来源主机不含已删主机。
    const projects = buildWallProjects(
      [repo({ id: 'a', path: '/a', displayName: 'app', gitRemoteIdentity: appIdentity() }), stale],
      [],
      { environmentIds: new Set(['env1']) }
    )
    expect(projects).toHaveLength(1)
    expect(projects[0].hostIds).toEqual(['local'])
    expect(projects[0].repoIds).toEqual(['a'])
  })

  it('counts one registration per host+path when the same host re-registers a repo', () => {
    const projects = buildWallProjects(
      [
        repo({ id: 'a', path: '/a', displayName: 'app', gitRemoteIdentity: appIdentity() }),
        repo({ id: 'a-dup', path: '/a', displayName: 'app', gitRemoteIdentity: appIdentity() })
      ],
      [],
      { environmentIds: new Set() }
    )
    expect(projects).toHaveLength(1)
    expect(projects[0].repoIds).toEqual(['a'])
    expect(projects[0].slots).toHaveLength(1)
  })

  it('counts worktrees once per host-qualified identity across the project rows', () => {
    const local = repo({ id: 'a', path: '/a', displayName: 'app' })
    const remote = repo({
      id: 'r1',
      path: '/remote/a',
      displayName: 'app',
      executionHostId: 'runtime:env1'
    })
    const worktreesByRepo: Record<string, Worktree[]> = {
      a: [
        worktree({ id: 'a::/a', repoId: 'a', hostId: 'local' }),
        worktree({ id: 'a::/a/.bw/worktrees/project', repoId: 'a', hostId: 'local' })
      ],
      r1: [
        worktree({ id: 'r1::/remote/a', repoId: 'r1', hostId: 'runtime:env1' }),
        // 同一工作树重复返回不重复计数。
        worktree({ id: 'r1::/remote/a', repoId: 'r1', hostId: 'runtime:env1' })
      ]
    }
    expect(countWallProjectWorktrees([local, remote], worktreesByRepo)).toBe(3)
    expect(countWallProjectWorktrees([local], worktreesByRepo)).toBe(2)
  })
})
