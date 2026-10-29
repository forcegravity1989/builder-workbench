import { describe, expect, it } from 'vitest'
import { projectWorkbenchRows } from './workbench-project-rows'
import {
  repo,
  remoteRepo,
  worktree,
  remoteWorktree
} from '../../worktree-list-groups-test-fixtures'
import type { WorktreeRow, GroupHeaderRow } from '../grouping/row-types'

describe('merged project sidebar projection', () => {
  it('counts a cross-host project once and keeps all repositories in the current project group', () => {
    const identity = {
      canonicalKey: 'github.com/acme/other',
      remoteName: 'origin',
      remoteUrl: 'https://github.com/acme/other.git'
    }
    const current = { ...repo, projectGroupId: 'current' }
    const companion = { ...repo, id: 'companion', path: '/companion', projectGroupId: 'current' }
    const other = { ...repo, id: 'other', path: '/other', gitRemoteIdentity: identity }
    const otherRemote = { ...remoteRepo, id: 'other-remote', gitRemoteIdentity: identity }
    const group = {
      id: 'current',
      name: 'Current',
      parentPath: null,
      parentGroupId: null,
      createdFrom: 'manual' as const,
      tabOrder: 0,
      isCollapsed: false,
      color: null,
      createdAt: 0,
      updatedAt: 0
    }
    const headers: GroupHeaderRow[] = [current, companion, other, otherRemote].map((owner) => ({
      type: 'header',
      key: owner.id,
      label: owner.displayName,
      repo: owner,
      count: 0,
      tone: ''
    }))
    const result = projectWorkbenchRows({
      rows: headers,
      repoId: current.id,
      currentRepoIds: [current.id],
      repos: [current, companion, other, otherRemote],
      projectGroups: [group],
      worktrees: [],
      expanded: true,
      onToggle: () => {}
    })
    const foldIndex = result.findIndex((row) => row.type === 'header' && !!row.displaySection)
    expect(result.slice(0, foldIndex).map((row) => (row.type === 'header' ? row.key : ''))).toEqual(
      [current.id, companion.id]
    )
    expect((result[foldIndex] as GroupHeaderRow).count).toBe(1)
    expect(
      result.slice(foldIndex + 1).map((row) => (row.type === 'header' ? row.key : ''))
    ).toEqual([other.id, otherRemote.id])
  })
  it('retains both hosts and the original order while folding only other projects in every grouping', () => {
    const privateRepo = { ...repo, id: 'private' }
    const privateTree = { ...worktree, id: 'private-tree', repoId: privateRepo.id }
    const item = (tree: typeof worktree, owner: typeof repo): WorktreeRow => ({
      type: 'item',
      rowKey: `${owner.id}:${tree.id}`,
      sectionKey: 'none',
      worktree: tree,
      repo: owner,
      depth: 0,
      groupDepth: 0,
      lineageTrail: [],
      isLastLineageChild: true,
      lineageChildCount: 0
    })
    const rows = [
      item(privateTree, privateRepo),
      item(remoteWorktree, remoteRepo),
      item(worktree, repo)
    ]
    const options = {
      repoId: repo.id,
      currentRepoIds: [repo.id, remoteRepo.id],
      repos: [repo, remoteRepo, privateRepo],
      projectGroups: [],
      worktrees: [worktree, remoteWorktree, privateTree],
      onToggle: () => {}
    }
    const closed = projectWorkbenchRows({ ...options, rows, expanded: false })
    expect(closed.filter((row) => row.type === 'item').map((row) => row.worktree.repoId)).toEqual([
      remoteRepo.id,
      repo.id
    ])
    expect(
      closed.find((row): row is GroupHeaderRow => row.type === 'header' && !!row.displaySection)
        ?.count
    ).toBe(1)
    const open = projectWorkbenchRows({ ...options, rows, expanded: true })
    expect(open.filter((row) => row.type === 'item').map((row) => row.worktree.repoId)).toEqual([
      remoteRepo.id,
      repo.id,
      privateRepo.id
    ])
    expect(rows.map((row) => row.worktree.repoId)).toEqual([privateRepo.id, remoteRepo.id, repo.id])
    const headers: GroupHeaderRow[] = [privateRepo, remoteRepo, repo].map((owner) => ({
      type: 'header',
      key: owner.id,
      label: owner.displayName,
      repo: owner,
      count: 1,
      tone: ''
    }))
    const collapsedGroups = projectWorkbenchRows({ ...options, rows: headers, expanded: true })
    expect(
      collapsedGroups.find(
        (row): row is GroupHeaderRow => row.type === 'header' && !!row.displaySection
      )?.count
    ).toBe(1)
    expect(
      collapsedGroups
        .filter((row): row is GroupHeaderRow => row.type === 'header' && !!row.repo)
        .map((row) => row.key)
    ).toEqual([remoteRepo.id, repo.id, privateRepo.id])
  })
})
