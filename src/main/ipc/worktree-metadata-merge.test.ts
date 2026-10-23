import { describe, expect, it } from 'vitest'
import { canonicalWorktreeIdentity } from '../../shared/worktree/identity'
import type { GitWorktreeInfo } from '../../shared/worktree/types'
import { mergeWorktree } from './worktree-metadata-merge'

const git: GitWorktreeInfo = {
  path: '/workspace/feature',
  head: 'abc123',
  branch: 'refs/heads/feature',
  isBare: false,
  isMainWorktree: false
}

describe('mergeWorktree identity projection', () => {
  it('re-derives an automatic display name from the current branch', () => {
    const worktree = mergeWorktree(
      'repo-1',
      { ...git, branch: 'refs/heads/main' },
      {
        displayName: 'feature',
        displayNameIsPinned: false,
        comment: '',
        linkedIssue: null,
        linkedPR: null,
        linkedLinearIssue: null,
        isArchived: false,
        isUnread: false,
        isPinned: false,
        sortOrder: 0,
        lastActivityAt: 0
      }
    )

    expect(worktree.displayName).toBe('main')
    expect(worktree.displayNameMode).toBe('automatic')
  })

  it('treats legacy CLI labels as fixed display names', () => {
    const worktree = mergeWorktree('repo-1', git, {
      displayName: 'feature',
      cliProvenance: { kind: 'created-by-cli', createdAt: 1 },
      comment: '',
      linkedIssue: null,
      linkedPR: null,
      linkedLinearIssue: null,
      isArchived: false,
      isUnread: false,
      isPinned: false,
      sortOrder: 0,
      lastActivityAt: 0
    })

    expect(worktree.displayNameMode).toBe('fixed')
  })

  it('publishes canonical identity when host and instance metadata are known', () => {
    const worktree = mergeWorktree('repo-1', git, {
      instanceId: '11111111-1111-4111-8111-111111111111',
      hostId: 'ssh:build-box',
      displayName: 'Feature',
      comment: '',
      linkedIssue: null,
      linkedPR: null,
      linkedLinearIssue: null,
      isArchived: false,
      isUnread: false,
      isPinned: false,
      sortOrder: 0,
      lastActivityAt: 0
    })

    expect(worktree.identity).toEqual({
      key: canonicalWorktreeIdentity({
        worktreeId: worktree.id,
        executionHostId: 'ssh:build-box',
        instanceId: '11111111-1111-4111-8111-111111111111'
      }),
      executionHostId: 'ssh:build-box',
      instanceId: '11111111-1111-4111-8111-111111111111'
    })
  })

  it('omits canonical identity for legacy metadata without a proven host', () => {
    const worktree = mergeWorktree('repo-1', git, undefined)

    expect(worktree.identity).toBeUndefined()
  })

  it('projects optional GitHub PR suppression metadata', () => {
    const worktree = mergeWorktree('repo-1', git, {
      displayName: 'Feature',
      comment: '',
      linkedIssue: null,
      linkedPR: null,
      suppressedGitHubPR: 42,
      linkedLinearIssue: null,
      isArchived: false,
      isUnread: false,
      isPinned: false,
      sortOrder: 0,
      lastActivityAt: 0
    })

    expect(worktree.suppressedGitHubPR).toBe(42)
  })

  it('projects BW version bindings without losing legacy metadata', () => {
    const legacyMeta = {
      displayName: 'Feature',
      comment: 'note',
      linkedIssue: null,
      linkedPR: null,
      linkedLinearIssue: null,
      isArchived: false,
      isUnread: false,
      isPinned: false,
      sortOrder: 3,
      lastActivityAt: 9
    }
    const binding = { schema: 1 as const, version: 'v0.7', workflow: 'plan' as const }

    const withBinding = mergeWorktree('repo-1', git, {
      ...legacyMeta,
      workbenchVersionBinding: binding
    })
    expect(withBinding.workbenchVersionBinding).toEqual(binding)
    // 旧 metadata 不丢：无关字段原样投影。
    expect(withBinding.comment).toBe('note')
    expect(withBinding.sortOrder).toBe(3)
    expect(withBinding.lastActivityAt).toBe(9)

    // null（显式清除）与缺失（旧数据）都不投影绑定。
    expect(
      mergeWorktree('repo-1', git, { ...legacyMeta, workbenchVersionBinding: null })
        .workbenchVersionBinding
    ).toBeUndefined()
    expect(mergeWorktree('repo-1', git, legacyMeta).workbenchVersionBinding).toBeUndefined()
    // 脏数据不部分采纳：plan 用途带 goalId 违反一致性规则，读回为未绑定。
    expect(
      mergeWorktree('repo-1', git, {
        ...legacyMeta,
        workbenchVersionBinding: { ...binding, goalId: 'G1' }
      }).workbenchVersionBinding
    ).toBeUndefined()
  })
})
