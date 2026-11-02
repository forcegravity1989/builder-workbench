import { expect, it, vi } from 'vitest'
import { ensureFixedBranchTracking } from './fixed-workspace-tracking'
import {
  ensureFixedBranch,
  readFixedBranch,
  type FixedWorkspaceGit
} from './fixed-workspace-branch'

function fixture(
  options: { local?: boolean; remotes?: string[]; present?: string[]; failed?: string } = {}
) {
  const branch = 'bw/v0.8/acceptance'
  const oid = 'a'.repeat(40)
  const refs = new Map<string, string>(options.local ? [[`refs/heads/${branch}`, oid]] : [])
  const config = new Map<string, string>()
  const upstreams = new Map<string, string>()
  const exec = vi.fn(async (args: string[]) => {
    if (args[0] === 'remote') {
      return { stdout: (options.remotes ?? ['origin']).join('\n') }
    }
    if (args[0] === 'ls-remote') {
      if (args[2] === options.failed) {
        throw new Error('host unavailable')
      }
      return {
        stdout: (options.present ?? []).includes(args[2]) ? `${oid}\trefs/heads/${branch}\n` : ''
      }
    }
    if (args[0] === 'for-each-ref') {
      return { stdout: [...refs].map(([ref, commit]) => `${ref} ${commit}`).join('\n') }
    }
    if (args[0] === 'rev-parse') {
      const ref = args.at(-1)!.replace(/\^\{commit\}$/, '')
      if (upstreams.has(ref)) {
        return { stdout: upstreams.get(ref)! }
      }
      const commit = refs.get(ref) ?? [...refs.values()].find((oid) => oid === ref)
      if (!commit) {
        throw new Error('ref not found')
      }
      return { stdout: commit }
    }
    if (args[0] === 'config') {
      const value = config.get(args.at(-1)!)
      if (!value) {
        throw Object.assign(new Error('unset'), { code: 1 })
      }
      return { stdout: value }
    }
    if (args[0] === 'branch') {
      refs.set(`refs/heads/${args[2]}`, refs.get(args[3]) ?? args[3])
      if (args[1] === '--track') {
        upstreams.set(`${args[2]}@{upstream}`, args[3])
      }
    }
    return { stdout: '' }
  })
  const fetch = vi.fn(async (_remote: string, _branch: string, ref: string) => {
    refs.set(ref, oid)
  })
  const recordCreation = vi.fn(async (branch: string, source: string) => {
    config.set(`branch.${branch}.base`, source)
  })
  const ensureTracking = vi.fn(async () => undefined)
  return {
    branch,
    oid,
    refs,
    exec,
    fetch,
    recordCreation,
    git: { exec, fetch, recordCreation, ensureTracking } satisfies FixedWorkspaceGit
  }
}

function trackingFixture(entries: string[], readError?: unknown) {
  const branch = 'bw/project'
  const oid = 'a'.repeat(40)
  const exec = vi.fn(async (args: string[]) => {
    if (args[0] === 'remote') {
      return { stdout: 'origin' }
    }
    if (args[0] === 'rev-parse') {
      return { stdout: oid }
    }
    if (args[0] === 'config' && args[1] === '--get-all') {
      if (readError) {
        throw readError
      }
      return { stdout: entries.join('\n') }
    }
    return { stdout: '' }
  })
  return { branch, oid, exec }
}

it('preserves an exact local branch and ignores prefix matches without contacting remotes', async () => {
  const env = fixture({ local: true })
  env.refs.set(`refs/heads/${env.branch}-2`, 'b'.repeat(40))
  await ensureFixedBranch(env.git, env.branch)
  expect(await readFixedBranch(env.git, env.branch)).toBe(env.oid)
  expect(
    env.exec.mock.calls.some(([args]) => args[0] === 'ls-remote' || args[0] === 'branch')
  ).toBe(false)
  env.refs.delete(`refs/heads/${env.branch}`)
  expect(await readFixedBranch(env.git, env.branch)).toBeNull()
})

it('restores an uncached remote head with a targeted fetch and never consults PR state', async () => {
  const env = fixture({ present: ['origin'] })
  const restored = await ensureFixedBranch(env.git, env.branch)
  expect(restored.compareBaseRef).toBe(`refs/remotes/origin/${env.branch}`)
  expect(env.fetch).toHaveBeenCalledWith('origin', env.branch, `refs/remotes/origin/${env.branch}`)
  expect(env.exec).toHaveBeenCalledWith([
    'branch',
    '--track',
    env.branch,
    `refs/remotes/origin/${env.branch}`
  ])
  expect(await readFixedBranch(env.git, env.branch)).toBe(env.oid)
  expect((await ensureFixedBranch(env.git, env.branch)).compareBaseRef).toBe(
    restored.compareBaseRef
  )
  expect(env.fetch).toHaveBeenCalledTimes(1)
  expect(env.recordCreation).not.toHaveBeenCalled()
  for (const entries of [
    ['+refs/heads/main:refs/remotes/origin/main'],
    ['+refs/heads/*:refs/remotes/origin/*'],
    ['+refs/heads/bw/*:refs/remotes/origin/bw/*']
  ]) {
    const tracking = trackingFixture(entries)
    await ensureFixedBranchTracking(tracking.exec, 'origin', tracking.branch, tracking.oid)
    const writes = tracking.exec.mock.calls.filter(([args]) => args.includes('--replace-all'))
    expect(writes.length).toBe(entries[0].includes('main') ? 1 : 0)
    if (writes.length) {
      expect(writes[0][0].slice(0, 5)).toEqual([
        'config',
        '--local',
        '--replace-all',
        'remote.origin.fetch',
        '+refs/heads/bw/project*:refs/remotes/origin/bw/project*'
      ])
    }
  }
  for (const base of ['refs/tags/baseline', 'b'.repeat(40)]) {
    const pinned = fixture({ remotes: [] })
    pinned.refs.set('refs/tags/baseline', 'b'.repeat(40))
    await ensureFixedBranch(pinned.git, pinned.branch, base)
    expect(await readFixedBranch(pinned.git, pinned.branch)).toBe('b'.repeat(40))
    expect(pinned.fetch).not.toHaveBeenCalled()
  }
})

it('rejects ambiguous or unverifiable remote sources without creating or fetching a branch', async () => {
  for (const input of [
    { entries: ['^refs/heads/bw/*'] },
    { entries: ['+refs/heads/*:refs/remotes/custom/*'] },
    { entries: ['+refs/heads/*:refs/remotes/origin/main'] },
    { entries: [], readError: Object.assign(new Error('config unreadable'), { code: 128 }) }
  ]) {
    const tracking = trackingFixture(
      input.entries,
      'readError' in input ? input.readError : undefined
    )
    await expect(
      ensureFixedBranchTracking(tracking.exec, 'origin', tracking.branch, tracking.oid)
    ).rejects.toThrow()
    expect(tracking.exec.mock.calls.some(([args]) => args.includes('--replace-all'))).toBe(false)
  }
  for (const options of [
    { remotes: ['origin', 'upstream'], present: ['origin', 'upstream'] },
    { remotes: ['origin', 'upstream'], present: ['origin'], failed: 'upstream' }
  ]) {
    const env = fixture(options)
    await expect(ensureFixedBranch(env.git, env.branch)).rejects.toMatchObject({
      code: options.failed ? 'branch-source-unavailable' : 'branch-ambiguous'
    })
    expect(env.fetch).not.toHaveBeenCalled()
    expect(env.exec.mock.calls.some(([args]) => args[0] === 'branch')).toBe(false)
  }
})
