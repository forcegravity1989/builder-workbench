import { describe, expect, it } from 'vitest'
import type { Repo } from '../../../../shared/repo-types'
import { resolveTaskEntryRepoId } from './task-entry-project'

const WORKBENCH_REMOTE = {
  canonicalKey: 'github.com/acme/workbench',
  remoteName: 'origin',
  remoteUrl: 'https://github.com/acme/workbench.git'
}

function makeRepo(
  id: string,
  executionHostId: Repo['executionHostId'],
  overrides: Partial<Repo> = {}
): Repo {
  return {
    id,
    path: `/tmp/${id}`,
    displayName: id,
    badgeColor: '#000000',
    addedAt: 0,
    kind: 'git',
    executionHostId,
    gitRemoteIdentity: WORKBENCH_REMOTE,
    ...overrides
  }
}

describe('resolveTaskEntryRepoId', () => {
  it('prefers the local copy when the active worktree belongs to a remote copy of the same project', () => {
    const local = makeRepo('local-copy', 'local')
    const remote = makeRepo('remote-copy', 'ssh:shared', { addedAt: -1 })
    expect(resolveTaskEntryRepoId(remote.id, [local, remote])).toBe(local.id)
  })

  it('keeps the active local copy', () => {
    const local = makeRepo('local-copy', 'local')
    const remote = makeRepo('remote-copy', 'ssh:shared')
    expect(resolveTaskEntryRepoId(local.id, [local, remote])).toBe(local.id)
  })

  it('keeps the active copy when this machine has no copy of the project', () => {
    const remoteA = makeRepo('remote-a', 'ssh:shared-a')
    const remoteB = makeRepo('remote-b', 'ssh:shared-b', { addedAt: -1 })
    expect(resolveTaskEntryRepoId(remoteB.id, [remoteA, remoteB])).toBe(remoteB.id)
  })

  it('does not borrow an unrelated local project', () => {
    const remote = makeRepo('workbench-remote', 'ssh:shared')
    const other = makeRepo('other-local', 'local', {
      gitRemoteIdentity: {
        canonicalKey: 'github.com/acme/other',
        remoteName: 'origin',
        remoteUrl: 'https://github.com/acme/other.git'
      }
    })
    expect(resolveTaskEntryRepoId(remote.id, [other, remote])).toBe(remote.id)
  })

  it('returns null when the active repo is not task eligible', () => {
    const ineligible = makeRepo('plain-git', 'local', { gitRemoteIdentity: null })
    expect(resolveTaskEntryRepoId(ineligible.id, [ineligible])).toBeNull()
  })

  it('returns null without an active repo', () => {
    expect(resolveTaskEntryRepoId(null, [makeRepo('local-copy', 'local')])).toBeNull()
  })
})
