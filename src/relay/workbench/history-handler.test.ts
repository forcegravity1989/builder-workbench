import { beforeEach, describe, expect, it, vi } from 'vitest'

const runReadOnlyHistoryGit = vi.hoisted(() => vi.fn())
const runTrunkBaseline = vi.hoisted(() => vi.fn())
vi.mock('../../main/workbench/history-git-core', () => ({
  runReadOnlyHistoryGit
}))
vi.mock('../../main/workbench/trunk-baseline', () => ({
  runTrunkBaseline
}))

import { registerVersionHistoryRelay } from './history-handler'
import type { RelayDispatcher } from '../dispatcher'
import type { MethodHandler, RequestContext } from '../dispatcher-contract'
import { HistorySourceError } from '../../main/workbench/version-history-snapshot'

let handler: MethodHandler
const context: RequestContext = { clientId: 1, isStale: () => false }
const call = (params: Record<string, unknown>) => handler(params, context)

function mount() {
  const dispatcher: Pick<RelayDispatcher, 'onRequest'> = {
    onRequest: (name, next) => {
      expect(name).toBe('workbench.history.execute')
      handler = next
    }
  }
  registerVersionHistoryRelay(dispatcher)
}

beforeEach(() => {
  runReadOnlyHistoryGit.mockReset()
  runTrunkBaseline.mockReset()
  mount()
})

const target = { repoPath: '/srv/project' }

describe('workbench.history.execute relay executor', () => {
  it('runs allowlisted git reads through the shared core and returns raw bytes', async () => {
    runReadOnlyHistoryGit.mockResolvedValue({ ok: true, stdout: Buffer.from('log-output') })
    const args = ['merge-base', '--is-ancestor', 'a'.repeat(40), 'b'.repeat(40)]
    const result = await call({ target, operation: 'git', args })
    expect(runReadOnlyHistoryGit).toHaveBeenCalledWith('/srv/project', args)
    expect(result).toEqual({
      ok: true,
      value: { stdout: Buffer.from('log-output').toString('base64') }
    })
  })

  it('propagates the git failure envelope with its exit code', async () => {
    runReadOnlyHistoryGit.mockResolvedValue({
      ok: false,
      code: 'git-failed',
      message: 'fatal: bad object',
      exitCode: 128
    })
    const result = await call({
      target,
      operation: 'git',
      args: ['show', `${'a'.repeat(40)}:.bw/planning/v1/data.json`]
    })
    expect(result).toEqual({
      ok: false,
      error: { code: 'git-failed', message: 'fatal: bad object', exitCode: 128 }
    })
  })

  it('resolves the trunk baseline on the host that owns the filesystem', async () => {
    const baseline = {
      ref: 'origin/main',
      commit: 'c'.repeat(40),
      sync: { remoteName: 'origin', branchName: 'main' }
    }
    runTrunkBaseline.mockResolvedValue(baseline)
    const result = await call({ target, operation: 'baseline', adoptedRef: 'origin/main' })
    expect(runTrunkBaseline).toHaveBeenCalledWith('/srv/project', 'origin/main')
    expect(result).toEqual({ ok: true, value: baseline })
  })

  it('rejects unknown operations, extra fields and baseline failures honestly', async () => {
    await expect(call({ target, operation: 'exec', args: ['push'] })).rejects.toThrow()
    await expect(call({ target, operation: 'git', args: [], extra: 1 })).rejects.toThrow()
    runTrunkBaseline.mockRejectedValue(
      new HistorySourceError(
        'baseline-unresolved',
        '主检出不在任何分支上，无法确定主干基线；请在项目设置钉定基线分支'
      )
    )
    expect(await call({ target, operation: 'baseline', adoptedRef: null })).toEqual({
      ok: false,
      error: {
        code: 'baseline-unresolved',
        message: '主检出不在任何分支上，无法确定主干基线；请在项目设置钉定基线分支'
      }
    })
    runTrunkBaseline.mockRejectedValue(new Error('relay exploded'))
    expect(await call({ target, operation: 'baseline', adoptedRef: null })).toEqual({
      ok: false,
      error: { code: 'history-failed', message: 'relay exploded' }
    })
  })
})
