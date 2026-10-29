import { describe, expect, it } from 'vitest'
import type { Repo } from '../../../shared/repo-types'
import {
  buildBuilderTaskProjects,
  builderTaskRepoSelectionId,
  normalizeBuilderTaskSelection
} from './task-builder-projects'

const hosts = [
  'Builder 01',
  'Builder 02',
  'Builder 03',
  'Builder 04',
  'Builder 05',
  'Builder 06'
].map((name, index) => ({
  id: `host-${index}`,
  name
}))
function repo(id: string, host?: string, remote = id): Repo {
  return {
    id,
    path: `/repos/${id}`,
    displayName: id,
    kind: 'git',
    badgeColor: '#737373',
    addedAt: 1,
    executionHostId: host ? `runtime:${host}` : 'local',
    gitRemoteIdentity: {
      canonicalKey: `codehub.example.com/team/${remote}`,
      remoteName: 'origin',
      remoteUrl: `https://codehub.example.com/team/${remote}.git`
    }
  }
}

describe('Builder task project selection', () => {
  it('lists six Builders plus a local project, retaining empty Builders without promoting their directories', () => {
    const repos = [
      repo('shunfenger'),
      repo('benchmark', 'host-0'),
      repo('week-plan', 'host-0', 'benchmark'),
      repo('data-studio', 'host-0'),
      repo('benchmark', 'host-1'),
      repo('stale', 'removed')
    ]
    const groups = buildBuilderTaskProjects(repos, hosts)
    expect(groups.map((group) => group.displayName)).toEqual([
      'shunfenger',
      ...hosts.map((host) => host.name)
    ])
    expect(groups).toHaveLength(7)
    expect(groups[1]?.sources.map((row) => row.id)).toEqual([
      'benchmark',
      'week-plan',
      'data-studio'
    ])
    expect(groups[3]?.repo).toBeNull()
    expect(groups[3]?.sources).toEqual([])
    expect(buildBuilderTaskProjects(repos, hosts.slice(0, 1))).toHaveLength(2)
  })

  it('expands a selected Builder, deduplicates its worktrees, and fences same ids and remotes on other Builders', () => {
    const first = repo('benchmark', 'host-0')
    const sibling = repo('week-plan', 'host-0', 'benchmark')
    const other = repo('data-studio', 'host-0')
    const second = repo('benchmark', 'host-1')
    const repos = [repo('shunfenger'), first, sibling, other, second]
    const groups = buildBuilderTaskProjects(repos, hosts)
    const firstSelection = normalizeBuilderTaskSelection(
      groups,
      new Set([builderTaskRepoSelectionId(first)])
    )
    expect([...firstSelection]).toEqual([
      builderTaskRepoSelectionId(first),
      builderTaskRepoSelectionId(other)
    ])
    expect(firstSelection.has(builderTaskRepoSelectionId(second))).toBe(false)
    const unhydratedGroups = buildBuilderTaskProjects([repos[0]], [])
    expect(normalizeBuilderTaskSelection(unhydratedGroups, firstSelection, false)).toEqual(
      firstSelection
    )
    const coldGroups = buildBuilderTaskProjects([repos[0]], hosts)
    const coldSelection = normalizeBuilderTaskSelection(coldGroups, firstSelection)
    expect(coldSelection).toEqual(firstSelection)
    expect(normalizeBuilderTaskSelection(groups, coldSelection)).toEqual(firstSelection)
    expect(
      normalizeBuilderTaskSelection(
        groups,
        new Set(JSON.parse(JSON.stringify([...firstSelection])))
      )
    ).toEqual(firstSelection)
    expect(normalizeBuilderTaskSelection(groups, new Set(['data-studio']))).toEqual(firstSelection)
    const all = normalizeBuilderTaskSelection(groups, null)
    expect(all.size).toBe(4)
    expect(all.has(builderTaskRepoSelectionId(second))).toBe(true)
    expect(normalizeBuilderTaskSelection(groups, new Set(['benchmark']))).toEqual(all)
    expect(normalizeBuilderTaskSelection(buildBuilderTaskProjects([], hosts), null).size).toBe(0)
  })
})
