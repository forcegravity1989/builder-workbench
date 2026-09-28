import { describe, expect, it, vi } from 'vitest'
import { assertReadOnlyHistoryGitArgs, resolveAdoptedBaseline } from './history-git-core'

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
    ['an ancestry proof', ['merge-base', '--is-ancestor', sha, 'b'.repeat(40)]]
  ])('accepts %s', (_name, args) => {
    expect(() => assertReadOnlyHistoryGitArgs(args)).not.toThrow()
  })

  it.each([
    ['writes', ['push', 'origin', 'main']],
    ['config mutations', ['config', 'core.sshCommand', 'evil']],
    ['generic rev-parse', ['rev-parse', 'HEAD']],
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

describe('adopted baseline resolution', () => {
  it('pins the registered adopted ref and refuses to swap it when it dies', async () => {
    const exec = vi.fn(async (argv: string[]) => {
      if (argv[0] === 'rev-parse' && argv[2] === 'refs/heads/release^{commit}') {
        throw new Error('unknown revision')
      }
      return { stdout: `${sha}\n` }
    })
    await expect(resolveAdoptedBaseline(exec, 'refs/heads/release')).rejects.toMatchObject({
      code: 'baseline-invalid'
    })
    // The failed registered ref must not fall back to default-branch probes.
    expect(exec).toHaveBeenCalledTimes(1)
  })

  it('resolves and pins the native default branch when no ref is registered', async () => {
    const exec = vi.fn(async (argv: string[]) => {
      if (argv[0] === 'symbolic-ref') {
        return { stdout: 'refs/remotes/origin/main\n' }
      }
      if (argv.join(' ') === `rev-parse --verify refs/remotes/origin/main`) {
        return { stdout: '' }
      }
      if (argv[0] === 'rev-parse' && argv[2] === 'origin/main^{commit}') {
        return { stdout: `${sha}\n` }
      }
      return { stdout: '' }
    })
    const baseline = await resolveAdoptedBaseline(exec, null)
    expect(baseline).toEqual({ ref: 'origin/main', commit: sha })
  })

  it('reports an unresolved source instead of inventing a branch', async () => {
    const exec = vi.fn(async () => {
      throw new Error('no such ref')
    })
    await expect(resolveAdoptedBaseline(exec, null)).rejects.toMatchObject({
      code: 'baseline-unresolved'
    })
  })
})
