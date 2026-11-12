import { describe, expect, it, vi } from 'vitest'
import {
  resolveTrunkBaseline,
  trunkDisplayRef,
  trunkSyncTargetFromSymbolic
} from './trunk-baseline'

const sha = 'a'.repeat(40)

describe('trunk baseline resolution', () => {
  it('pins the registered base ref: a dead pin refuses to swap, a live pin maps to its sync target without name probes', async () => {
    const deadExec = vi.fn(async (argv: string[]) => {
      if (argv[0] === 'rev-parse' && argv[2] === 'release^{commit}') {
        throw new Error('unknown revision')
      }
      return { stdout: `${sha}\n` }
    })
    await expect(resolveTrunkBaseline(deadExec, 'release')).rejects.toMatchObject({
      code: 'baseline-invalid'
    })
    // The failed pinned ref must not fall back to any branch-name guessing.
    expect(deadExec).toHaveBeenCalledTimes(1)

    const exec = vi.fn(async (argv: string[]) => {
      if (argv.join(' ') === 'rev-parse --verify origin/main^{commit}') {
        return { stdout: `${sha}\n` }
      }
      if (argv.join(' ') === 'rev-parse --symbolic-full-name origin/main') {
        return { stdout: 'refs/remotes/origin/main\n' }
      }
      if (argv[0] === 'config') {
        return { stdout: 'remote.origin.fetch\n+refs/heads/*:refs/remotes/origin/*\0' }
      }
      throw new Error(`unexpected argv: ${argv.join(' ')}`)
    })
    await expect(resolveTrunkBaseline(exec, 'origin/main')).resolves.toEqual({
      ref: 'origin/main',
      commit: sha,
      sync: { remoteName: 'origin', branchName: 'main', trackingRef: 'refs/remotes/origin/main' }
    })
    expect(trunkSyncTargetFromSymbolic('refs/heads/release')).toEqual({
      remoteName: 'origin',
      branchName: 'release'
    })
    const pin = 'refs/remotes/team/mirror/trunk'
    const fetchMapping = `remote.team/mirror.fetch\n+refs/heads/main:${pin}\0`
    expect(trunkSyncTargetFromSymbolic(pin, fetchMapping)).toEqual({
      remoteName: 'team/mirror',
      branchName: 'main',
      trackingRef: pin
    })
    expect(
      trunkSyncTargetFromSymbolic(
        pin,
        `${fetchMapping}remote.team.fetch\n+refs/heads/*:refs/remotes/team/*\0`
      )
    ).toBeNull()
    expect(
      trunkSyncTargetFromSymbolic(
        'refs/remotes/origin/release/$&',
        'remote.origin.fetch\n+refs/heads/*:refs/remotes/origin/*\0'
      )?.branchName
    ).toBe('release/$&')
    expect(trunkSyncTargetFromSymbolic('refs/tags/v1')).toBeNull()
    expect(trunkSyncTargetFromSymbolic('')).toBeNull()
    expect(trunkDisplayRef('refs/remotes/upstream/dev', 'upstream/dev')).toBe('upstream/dev')
    expect(trunkDisplayRef('', sha)).toBe(sha)
  })

  it('follows the main checkout branch when nothing is pinned, and refuses a detached one', async () => {
    const onBranch = vi.fn(async (argv: string[]) => {
      if (argv.join(' ') === 'rev-parse --abbrev-ref HEAD') {
        return { stdout: 'main\n' }
      }
      if (argv.join(' ') === 'rev-parse HEAD') {
        return { stdout: `${sha}\n` }
      }
      throw new Error(`unexpected argv: ${argv.join(' ')}`)
    })
    await expect(resolveTrunkBaseline(onBranch, null)).resolves.toEqual({
      ref: 'main',
      commit: sha,
      sync: { remoteName: 'origin', branchName: 'main' }
    })
    const detached = vi.fn(async (argv: string[]) =>
      argv.join(' ') === 'rev-parse --abbrev-ref HEAD' ? { stdout: 'HEAD\n' } : { stdout: '' }
    )
    await expect(resolveTrunkBaseline(detached, null)).rejects.toMatchObject({
      code: 'baseline-unresolved'
    })
  })
})
