import { describe, expect, it } from 'vitest'
import { assertReadOnlyHistoryGitArgs } from './history-git-core'

const sha = 'a'.repeat(40)
const logTemplate = [
  'log',
  '-z',
  '--full-history',
  '--diff-merges=first-parent',
  '--format=%H%x00%cI',
  '--name-only',
  '--diff-filter=AM',
  '--no-renames',
  sha,
  '--',
  '.bw/planning'
]

describe('read-only history git allowlist', () => {
  it.each([
    ['the fixed history log', logTemplate],
    ['a material blob read', ['show', `${sha}:.bw/planning/v1/data.json`]],
    ['an acceptance blob read', ['show', `${sha}:.bw/planning/v0.5/acceptance.json`]],
    ['an ancestry proof', ['merge-base', '--is-ancestor', sha, 'b'.repeat(40)]],
    ['the cycle worktree head pin', ['rev-parse', 'HEAD']],
    ['a planning folder listing', ['ls-tree', '-z', '--name-only', `${sha}:.bw/planning`]]
  ])('accepts %s', (_name, args) => {
    expect(() => assertReadOnlyHistoryGitArgs(args)).not.toThrow()
  })

  it.each([
    ['writes', ['push', 'origin', 'main']],
    ['config mutations', ['config', 'core.sshCommand', 'evil']],
    ['generic rev-parse targets', ['rev-parse', 'main']],
    ['rev-parse with extra args', ['rev-parse', 'HEAD', '--extra']],
    ['ls-tree outside planning', ['ls-tree', '-z', '--name-only', `${sha}:.bw`]],
    ['ls-tree with recursion flags', ['ls-tree', '-r', '-z', '--name-only', `${sha}:.bw/planning`]],
    ['symbolic-ref moves', ['symbolic-ref', 'HEAD', 'refs/heads/x']],
    ['external diff hooks', ['log', '--ext-diff', sha]],
    ['arbitrary show targets', ['show', `${sha}:../../etc/passwd`]],
    ['show with flags', ['show', '--output=/tmp/x', `${sha}:.bw/planning/v1/data.json`]],
    ['log path escapes', [...logTemplate.slice(0, -1), '.bw']],
    ['log with extra args', [...logTemplate, '--all']],
    ['merge-base writes', ['merge-base', '--fork-point', sha, sha]],
    ['short shas in show', ['show', `abc123:.bw/planning/v1/data.json`]],
    ['empty argv', [] as string[]]
  ])('rejects %s', (_name, args) => {
    expect(() => assertReadOnlyHistoryGitArgs(args)).toThrowError(
      expect.objectContaining({ code: 'invalid-git-request' })
    )
  })
})
