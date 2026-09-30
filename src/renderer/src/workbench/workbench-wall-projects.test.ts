import { describe, expect, it } from 'vitest'
import type { ProjectGroup } from '../../../shared/project-group-types'
import type { Repo } from '../../../shared/repo-types'
import { buildWallProjects } from './workbench-wall-projects'

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

describe('buildWallProjects', () => {
  it('keeps ungrouped repos as solo cards', () => {
    const projects = buildWallProjects([repo({ id: 'a', path: '/a', displayName: 'Alpha' })], [])
    expect(projects).toHaveLength(1)
    expect(projects[0].key).toBe('solo:a')
    expect(projects[0].repoIds).toEqual(['a'])
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
    expect(projects.find((p) => p.key === 'solo:c')?.name).toBe('Solo')
  })
})
