import { describe, expect, it } from 'vitest'
import type { Repo } from '../../../../../../shared/repo-types'
import type { Worktree } from '../../../../../../shared/worktree/types'
import { getWorktreeHostIdentity } from '../../../../../../shared/worktree/host-qualified-identity'
import { scopeWorktreesForVersionSidebar } from './use-version-scoped-worktrees'

function repo(id: string, hostId: 'local' | 'ssh:box'): Repo {
  return {
    id,
    path: `/${id}`,
    displayName: id,
    badgeColor: '#000000',
    addedAt: 0,
    executionHostId: hostId
  }
}

function worktree(
  id: string,
  repoId: string,
  hostId: 'local' | 'ssh:box',
  isPinned = false
): Worktree {
  return {
    id,
    repoId,
    hostId,
    path: `/${repoId}/${id}`,
    branch: `refs/heads/${id}`,
    head: 'abc123',
    isBare: false,
    isMainWorktree: false,
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    isArchived: false,
    comment: '',
    isUnread: false,
    isPinned,
    displayName: id,
    sortOrder: 0,
    lastActivityAt: 0
  }
}

describe('scopeWorktreesForVersionSidebar', () => {
  const localRepo = repo('project-local', 'local')
  const remoteRepo = repo('project-remote', 'ssh:box')
  const otherRepo = repo('other-project', 'local')

  const projectLocalPinned = worktree('project-local-pinned', localRepo.id, 'local', true)
  const projectRemotePinned = worktree('project-remote-pinned', remoteRepo.id, 'ssh:box', true)
  const projectLoose = worktree('project-loose', localRepo.id, 'local')
  const otherProjectPinned = worktree('other-pinned', otherRepo.id, 'local', true)

  const worktrees = [
    projectLocalPinned,
    projectRemotePinned,
    projectLoose,
    otherProjectPinned
  ] as const

  function scope(worktreeIdentities: ReadonlySet<string> = new Set()) {
    return scopeWorktreesForVersionSidebar({
      workbenchProject: {
        rows: [localRepo, remoteRepo],
        worktreeIdentities
      },
      filteredWorktrees: worktrees,
      worktreeLineageById: {},
      worktreeMap: new Map(worktrees.map((tree) => [tree.id, tree]))
    })
  }

  it('keeps pinned rows of the current project across hosts and drops other projects', () => {
    const { visibleWorktrees } = scope()
    const visibleIds = new Set(visibleWorktrees.map((tree) => tree.id))

    expect(visibleIds).toEqual(
      new Set([projectLocalPinned.id, projectRemotePinned.id, projectLoose.id])
    )
  })

  it('marks only pinned, version-bound project rows as pinned-only', () => {
    const { pinnedOnlyIdentities } = scope(
      new Set([projectLocalPinned, projectLoose].map(getWorktreeHostIdentity))
    )

    expect(pinnedOnlyIdentities).toEqual(new Set([getWorktreeHostIdentity(projectLocalPinned)]))
  })
})
