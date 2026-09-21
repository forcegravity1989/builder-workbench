import { describe, expect, it } from 'vitest'
import type { ProjectGroup } from '../../../shared/project-group-types'
import type { Repo } from '../../../shared/repo-types'
import {
  getDefaultTaskRepoSelection,
  getTaskEligibleRepos
} from '@/components/task-page-default-repo-selection'
import {
  filterProjectGroupsByWorkbenchScope,
  filterReposByWorkbenchScope,
  mergeWorkbenchFilterRepoIds,
  resolveWallProjectRepoIds
} from './workbench-sidebar-repo-scope'

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

describe('resolveWallProjectRepoIds', () => {
  it('returns null without activeRepoId', () => {
    expect(
      resolveWallProjectRepoIds([repo({ id: 'a', path: '/a', displayName: 'A' })], [], null)
    ).toBe(null)
  })

  it('scopes solo wall project to one repo', () => {
    const repos = [
      repo({ id: 'a', path: '/a', displayName: 'orca' }),
      repo({ id: 'b', path: '/b', displayName: 'workbench' })
    ]
    expect(resolveWallProjectRepoIds(repos, [], 'b')).toEqual(['b'])
  })

  it('scopes grouped wall project to all member repos', () => {
    const g = group({ id: 'g1', name: 'Platform' })
    const repos = [
      repo({
        id: 'a',
        path: '/a',
        displayName: 'Core',
        projectGroupId: 'g1',
        projectGroupOrder: 0
      }),
      repo({
        id: 'b',
        path: '/b',
        displayName: 'Docs',
        projectGroupId: 'g1',
        projectGroupOrder: 1
      }),
      repo({ id: 'c', path: '/c', displayName: 'Solo' })
    ]
    expect(resolveWallProjectRepoIds(repos, [g], 'b')).toEqual(['a', 'b'])
  })

  it('falls back to activeRepoId when not on the wall', () => {
    expect(
      resolveWallProjectRepoIds([repo({ id: 'a', path: '/a', displayName: 'A' })], [], 'missing')
    ).toEqual(['missing'])
  })
})

describe('mergeWorkbenchFilterRepoIds', () => {
  it('uses wall scope when store filter is empty', () => {
    expect(mergeWorkbenchFilterRepoIds([], ['a', 'b'])).toEqual(['a', 'b'])
  })

  it('intersects store filter with wall scope', () => {
    expect(mergeWorkbenchFilterRepoIds(['a', 'c'], ['a', 'b'])).toEqual(['a'])
  })
})

describe('TaskPage wall scope', () => {
  it('does not fan out GitHub sync to other wall projects', () => {
    const orca = repo({
      id: 'orca',
      path: '/orca',
      displayName: 'orca',
      kind: 'git',
      gitRemoteIdentity: {
        canonicalKey: 'github.com/stablyai/orca',
        remoteName: 'origin',
        remoteUrl: 'https://github.com/stablyai/orca.git'
      }
    })
    const workbench = repo({
      id: 'workbench',
      path: '/workbench',
      displayName: 'workbench',
      kind: 'git',
      gitRemoteIdentity: {
        canonicalKey: 'github.com/forcegravity1989/builder-workbench',
        remoteName: 'origin',
        remoteUrl: 'git@github.com:forcegravity1989/builder-workbench.git'
      }
    })
    const wallRepoIds = resolveWallProjectRepoIds([orca, workbench], [], 'workbench')
    const scoped = filterReposByWorkbenchScope([orca, workbench], wallRepoIds)
    const eligible = getTaskEligibleRepos(scoped)
    expect(eligible.map((item) => item.id)).toEqual(['workbench'])
    expect([...getDefaultTaskRepoSelection(eligible)]).toEqual(['workbench'])
  })
})

describe('filterReposByWorkbenchScope / groups', () => {
  it('passes through when scope is null', () => {
    const repos = [repo({ id: 'a', path: '/a', displayName: 'A' })]
    expect(filterReposByWorkbenchScope(repos, null)).toBe(repos)
  })

  it('keeps only scoped repos and their groups', () => {
    const g1 = group({ id: 'g1', name: 'One' })
    const g2 = group({ id: 'g2', name: 'Two' })
    const repos = [
      repo({ id: 'a', path: '/a', displayName: 'A', projectGroupId: 'g1' }),
      repo({ id: 'b', path: '/b', displayName: 'B', projectGroupId: 'g2' })
    ]
    const scoped = filterReposByWorkbenchScope(repos, ['a'])
    expect(scoped.map((r) => r.id)).toEqual(['a'])
    expect(filterProjectGroupsByWorkbenchScope([g1, g2], scoped, ['a'])).toEqual([g1])
  })
})
