import { describe, expect, it } from 'vitest'
import type { ProjectGroup } from '../../../../shared/project-group-types'
import type { Repo } from '../../../../shared/repo-types'
import { selectProjectGroupRemovalTargets } from './project-group-removal-targets'
import { applyInheritedProjectGroups } from '../repos/repo-catalog-identity'

const rootGroup: ProjectGroup = {
  id: 'root',
  name: 'Root',
  parentPath: null,
  parentGroupId: null,
  createdFrom: 'manual',
  tabOrder: 0,
  isCollapsed: false,
  color: null,
  createdAt: 1,
  updatedAt: 1
}

const childGroup: ProjectGroup = {
  ...rootGroup,
  id: 'child',
  name: 'Child',
  parentGroupId: rootGroup.id,
  tabOrder: 1
}

const siblingGroup: ProjectGroup = {
  ...rootGroup,
  id: 'sibling',
  name: 'Sibling',
  tabOrder: 2
}

function makeRepo(id: string, projectGroupId: string | null): Repo {
  return {
    id,
    path: `/${id}`,
    displayName: id,
    badgeColor: '#000',
    addedAt: 1,
    projectGroupId
  }
}

describe('selectProjectGroupRemovalTargets', () => {
  it('selects direct and nested child projects in repo order', () => {
    const result = selectProjectGroupRemovalTargets(
      [rootGroup, childGroup, siblingGroup],
      [
        makeRepo('direct', rootGroup.id),
        makeRepo('nested', childGroup.id),
        makeRepo('sibling', siblingGroup.id),
        makeRepo('ungrouped', null)
      ],
      rootGroup.id
    )

    expect(result.ownerHostId).toBe('local')
    expect([...result.deletedGroupIds].sort()).toEqual([childGroup.id, rootGroup.id])
    expect(result.projects.map((repo) => repo.id)).toEqual(['direct', 'nested'])
  })

  it('keeps projects grouped only for display out of the paired removal list', () => {
    const hostId = 'runtime:peer'
    const remote = {
      canonicalKey: 'github.com/acme/app',
      remoteName: 'origin',
      remoteUrl: 'https://github.com/acme/app'
    }
    const local = { ...makeRepo('local', rootGroup.id), gitRemoteIdentity: remote }
    const paired: Repo = {
      ...makeRepo('paired', null),
      executionHostId: hostId,
      gitRemoteIdentity: remote,
      projectGroupId: undefined
    }
    const fetched = applyInheritedProjectGroups([local], [paired])
    expect(fetched[0].projectGroupId).toBe(rootGroup.id)
    expect(
      selectProjectGroupRemovalTargets(
        [rootGroup, { ...rootGroup, executionHostId: hostId }],
        [local, ...fetched],
        rootGroup.id,
        hostId
      ).projects
    ).toEqual([])
  })

  it('returns an empty project list for empty groups', () => {
    const result = selectProjectGroupRemovalTargets([rootGroup], [], rootGroup.id)

    expect(result.ownerHostId).toBe('local')
    expect([...result.deletedGroupIds]).toEqual([rootGroup.id])
    expect(result.projects).toEqual([])
  })

  it('does not synthesize targets for a missing group', () => {
    const result = selectProjectGroupRemovalTargets(
      [rootGroup],
      [makeRepo('direct', rootGroup.id)],
      'missing'
    )

    expect(result.ownerHostId).toBeNull()
    expect([...result.deletedGroupIds]).toEqual([])
    expect(result.projects).toEqual([])
  })
})
