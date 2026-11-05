import { describe, expect, it } from 'vitest'
import type { Repo } from '../../../shared/repo-types'
import type { ProjectHostSetup } from '../../../shared/project-types'
import {
  buildTaskProjectGroups,
  taskRepoSelectionId,
  normalizeProjectTaskSelection
} from './task-projects'
function repo(id: string, host = 'local', remote = id): Repo {
  return {
    id,
    path: `/repos/${id}`,
    displayName: id,
    kind: 'git',
    badgeColor: '#737373',
    addedAt: 1,
    executionHostId: host as Repo['executionHostId'],
    gitRemoteIdentity: {
      canonicalKey: `codehub.example.com/team/${remote}`,
      remoteName: 'origin',
      remoteUrl: `https://codehub.example.com/team/${remote}.git`
    }
  }
}
describe('task project deduplication', () => {
  it('counts each project once across hosts and worktrees while preserving different projects on one host', () => {
    const remotes = ['benchmark', 'data-studio', 'builder-workbench', 'journey', 'alpha', 'beta']
    const repos = [
      repo('shunfenger'),
      ...remotes.flatMap((name) => [
        repo(name, 'runtime:a'),
        repo(`${name}-week-plan`, 'runtime:a', name),
        repo(name, 'runtime:b')
      ])
    ]
    const groups = buildTaskProjectGroups(repos)
    expect(groups).toHaveLength(7)
    expect(groups.filter((g) => g.repo.executionHostId === 'runtime:a')).toHaveLength(6)
    expect(groups.find((g) => g.repo.displayName === 'benchmark')?.sources).toHaveLength(3)
    const first = repo('same', 'runtime:a', 'first'),
      second = repo('same', 'runtime:b', 'second')
    expect(buildTaskProjectGroups([first, second])).toHaveLength(2)
    const unknown = { ...first, gitRemoteIdentity: undefined }
    const unknownSecond = { ...second, gitRemoteIdentity: undefined }
    expect(buildTaskProjectGroups([unknown, unknownSecond])).toHaveLength(2)
    const setups = [unknown, unknownSecond].map((r) => ({
      repoId: r.id,
      path: r.path,
      hostId: r.executionHostId,
      projectId: 'project:registered'
    })) as ProjectHostSetup[]
    expect(buildTaskProjectGroups([unknown, unknownSecond], new Set(), setups)).toHaveLength(1)
    expect(buildTaskProjectGroups([first, unknownSecond], new Set(), setups)).toHaveLength(1)
    const staleSetups = setups.map((setup) => ({ ...setup, path: '/stale/path' }))
    expect(buildTaskProjectGroups([first, unknownSecond], new Set(), staleSetups)).toHaveLength(2)
    const pending = { ...repo('pending', 'runtime:c'), gitRemoteIdentity: undefined }
    const conflicting = [
      ...setups,
      {
        repoId: pending.id,
        hostId: pending.executionHostId,
        path: pending.path,
        projectId: 'project:registered'
      }
    ] as ProjectHostSetup[]
    expect(buildTaskProjectGroups([first, second, pending], new Set(), conflicting)).toHaveLength(3)
  })
  it('selects one actual source per project, restores its owner, and does not select all projects on that host', () => {
    const first = repo('same', 'runtime:a', 'benchmark'),
      duplicate = repo('same', 'runtime:b', 'benchmark'),
      other = repo('other', 'runtime:a')
    const local = repo('local-copy', 'local', 'benchmark')
    const groups = buildTaskProjectGroups([first, duplicate, other, local])
    expect(normalizeProjectTaskSelection(groups, null)).toEqual(
      new Set([taskRepoSelectionId(local), taskRepoSelectionId(other)])
    )
    const saved = new Set([taskRepoSelectionId(duplicate)])
    expect(normalizeProjectTaskSelection(groups, saved)).toEqual(saved)
    expect(buildTaskProjectGroups([first, duplicate, other, local], saved)[0]?.repo).toBe(duplicate)
    expect(normalizeProjectTaskSelection(groups, new Set(['same']))).toEqual(
      normalizeProjectTaskSelection(groups, null)
    )
    const cold = buildTaskProjectGroups([local])
    expect(normalizeProjectTaskSelection(cold, saved, false)).toEqual(saved)
    expect(normalizeProjectTaskSelection(cold, saved, true, new Set(['runtime:b']))).toEqual(saved)
    const restored = new Set<string>(JSON.parse(JSON.stringify([...saved])))
    expect(normalizeProjectTaskSelection(groups, restored)).toEqual(saved)
    expect(normalizeProjectTaskSelection([], null)).toEqual(new Set())
  })
})
