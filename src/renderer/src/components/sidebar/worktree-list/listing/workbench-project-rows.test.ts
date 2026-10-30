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
