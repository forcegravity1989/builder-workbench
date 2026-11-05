import { describe, expect, it } from 'vitest'

import { findCrossHostIssueWorktrees } from './cross-host-task-workspace'
import type { Repo } from '../../../shared/repo-types'
import type { Worktree } from '../../../shared/worktree/types'

const CODEHUB_REMOTE = {
  canonicalKey: 'codehub.example.com/group/project',
  remoteName: 'origin',
  remoteUrl: 'git@codehub.example.com:group/project.git'
}

function repo(overrides: Partial<Repo> = {}): Repo {
  return {
    id: 'repo-local',
    path: '/work/project',
    displayName: 'project',
    badgeColor: '#000',
    addedAt: 0,
    executionHostId: 'local',
    gitRemoteIdentity: CODEHUB_REMOTE,
    ...overrides
  } as Repo
}

function worktree(overrides: Partial<Worktree> = {}): Worktree {
  return {
    id: overrides.id ?? 'wt-1',
    repoId: overrides.repoId ?? 'repo-local',
    path: overrides.path ?? '/work/project/wt-1',
    head: 'abc123',
    branch: 'refs/heads/issue-512',
    isBare: false,
    isMainWorktree: false,
    displayName: 'workspace',
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 0,
    ...overrides
  }
}

const repos = [
  repo(),
  repo({
    id: 'repo-remote',
    path: '/remote/project',
    executionHostId: 'runtime:env-h'
  })
]

describe('cross-host issue workspace matching', () => {
  it('matches a worktree linked to the issue on a sibling repo of another host', () => {
    const remote = worktree({
      id: 'wt-remote',
      repoId: 'repo-remote',
      linkedIssue: 512
    })

    expect(
      findCrossHostIssueWorktrees({
        worktrees: [remote],
        repos,
        provider: 'github',
        issue: { repoId: 'repo-local', number: 512 },
        versionScope: null
      })
    ).toEqual([remote])
  })

  it('does not match the same issue number from another project', () => {
    const otherProject = worktree({
      id: 'wt-other',
      repoId: 'repo-other',
      linkedIssue: 512
    })

    expect(
      findCrossHostIssueWorktrees({
        worktrees: [otherProject],
        repos: [
          ...repos,
          repo({
            id: 'repo-other',
            gitRemoteIdentity: {
              canonicalKey: 'codehub.example.com/group/other',
              remoteName: 'origin',
              remoteUrl: 'git@codehub.example.com:group/other.git'
            }
          })
        ],
        provider: 'github',
        issue: { repoId: 'repo-local', number: 512 },
        versionScope: null
      })
    ).toEqual([])
  })

  it('gives up on host-local project identities', () => {
    const localOnly = repo({ id: 'folder-repo', gitRemoteIdentity: null })
    const linked = worktree({ repoId: 'folder-repo', linkedIssue: 512 })

    expect(
      findCrossHostIssueWorktrees({
        worktrees: [linked],
        repos: [localOnly],
        provider: 'github',
        issue: { repoId: 'folder-repo', number: 512 },
        versionScope: null
      })
    ).toEqual([])
  })

  it('honors the version scope binding', () => {
    const unbound = worktree({ id: 'wt-unbound', linkedIssue: 512 })
    const otherVersion = worktree({
      id: 'wt-other-version',
      linkedIssue: 512,
      workbenchVersionBinding: {
        schema: 1,
        version: 'v0.1',
        workflow: 'issue',
        taskSource: {
          kind: 'task-source',
          provider: 'github',
          projectId: 'github:group/project',
          hostId: 'local'
        }
      }
    })
    const bound = worktree({
      id: 'wt-bound',
      linkedIssue: 512,
      workbenchVersionBinding: {
        schema: 1,
        version: 'v0.2',
        workflow: 'issue',
        taskSource: {
          kind: 'task-source',
          provider: 'github',
          projectId: 'github:group/project',
          hostId: 'local'
        }
      }
    })

    expect(
      findCrossHostIssueWorktrees({
        worktrees: [unbound, otherVersion, bound],
        repos,
        provider: 'github',
        issue: { repoId: 'repo-local', number: 512 },
        versionScope: { version: 'v0.2' }
      })
    ).toEqual([bound])
  })

  it('excludes a version binding written for another task source', () => {
    const otherSource = worktree({
      id: 'wt-other-source',
      repoId: 'repo-remote',
      linkedIssue: 512,
      workbenchVersionBinding: {
        schema: 1,
        version: 'v0.2',
        workflow: 'issue',
        taskSource: {
          kind: 'task-source',
          provider: 'codehub',
          projectId: 'git:codehub.example.com/group/project',
          hostId: 'runtime:env-h'
        }
      }
    })

    expect(
      findCrossHostIssueWorktrees({
        worktrees: [otherSource],
        repos,
        provider: 'github',
        issue: { repoId: 'repo-local', number: 512 },
        versionScope: { version: 'v0.2' }
      })
    ).toEqual([])
  })

  it('falls back to the recorded task source project for unknown repo ids', () => {
    const unregistered = worktree({
      id: 'wt-unregistered',
      repoId: 'repo-not-registered-here',
      linkedIssue: 512,
      linkedTaskSourceContext: {
        kind: 'task-source',
        provider: 'github',
        projectId: 'git:codehub.example.com/group/project',
        hostId: 'runtime:env-h'
      }
    })

    expect(
      findCrossHostIssueWorktrees({
        worktrees: [unregistered],
        repos,
        provider: 'github',
        issue: { repoId: 'repo-local', number: 512 },
        versionScope: null
      })
    ).toEqual([unregistered])
  })

  it('matches CodeHub issues through linkedWorkItem', () => {
    const codehub = worktree({
      id: 'wt-codehub',
      repoId: 'repo-remote',
      linkedWorkItem: {
        provider: 'codehub',
        type: 'issue',
        number: 7,
        title: '任务',
        url: 'https://codehub.example.com/group/project/issues/7'
      }
    })

    expect(
      findCrossHostIssueWorktrees({
        worktrees: [codehub],
        repos,
        provider: 'codehub',
        issue: { repoId: 'repo-local', number: 7 },
        versionScope: null
      })
    ).toEqual([codehub])
  })

  it('skips archived worktrees', () => {
    const archived = worktree({ id: 'wt-archived', linkedIssue: 512, isArchived: true })

    expect(
      findCrossHostIssueWorktrees({
        worktrees: [archived],
        repos,
        provider: 'github',
        issue: { repoId: 'repo-local', number: 512 },
        versionScope: null
      })
    ).toEqual([])
  })
})
