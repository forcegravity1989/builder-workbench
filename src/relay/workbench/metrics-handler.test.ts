import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as metricsExecutionCore from '../../main/workbench/metrics/metrics-execution-core'

const readMetricConfiguration = vi.hoisted(() => vi.fn())
const fingerprintMetricCollector = vi.hoisted(() => vi.fn())
const executeMetricCollection = vi.hoisted(() => vi.fn())
vi.mock('../../main/workbench/metrics/metrics-execution-core', async (importOriginal) => {
  const actual = await importOriginal<typeof metricsExecutionCore>()
  return {
    ...actual,
    readMetricConfiguration,
    fingerprintMetricCollector,
    executeMetricCollection
  }
})

import { registerMetricsRelay } from './metrics-handler'
import type { RelayDispatcher } from '../dispatcher'
import type { MethodHandler, RequestContext } from '../dispatcher-contract'

let handler: MethodHandler
const context: RequestContext = { clientId: 1, isStale: () => false }
const call = (params: Record<string, unknown>) => handler(params, context)

function mount() {
  const dispatcher: Pick<RelayDispatcher, 'onRequest'> = {
    onRequest: (name, next) => {
      expect(name).toBe('workbench.metrics.execute')
      handler = next
    }
  }
  registerMetricsRelay(dispatcher)
}

beforeEach(() => {
  readMetricConfiguration.mockReset()
  fingerprintMetricCollector.mockReset()
  executeMetricCollection.mockReset()
  mount()
})

const target = { repoPath: '/srv/project' }
const sha = 'a'.repeat(40)

describe('workbench.metrics.execute relay executor', () => {
  it('routes fixed operations to the shared execution core', async () => {
    readMetricConfiguration.mockResolvedValue({ configurationCommit: sha, toml: null })
    expect(
      await call({
        target,
        operation: 'configuration',
        request: { adoptedRef: null }
      })
    ).toEqual({ ok: true, value: { configurationCommit: sha, toml: null } })
    expect(readMetricConfiguration).toHaveBeenCalledWith({
      repoPath: '/srv/project',
      adoptedRef: null
    })

    fingerprintMetricCollector.mockResolvedValue('sha256:fingerprint')
    expect(
      await call({
        target,
        operation: 'fingerprint',
        request: { configurationCommit: sha, run: ['node', '.bw/scripts/x.js'] }
      })
    ).toEqual({ ok: true, value: 'sha256:fingerprint' })
  })

  it('runs a collection with validated argv, window args and BW_METRICS_* env only', async () => {
    executeMetricCollection.mockResolvedValue({ stdout: '{"points":[]}', code: 0 })
    const request = {
      checkoutRoot: '/srv/workspaces',
      configurationCommit: sha,
      run: ['node', '.bw/scripts/x.js'],
      args: ['--since', '2026-09-21', '--until', '2026-09-28', '--granularity', 'week'],
      env: { BW_METRICS_TIMEZONE: 'UTC', BW_METRICS_DATA_COMMIT: sha },
      timeoutMs: 900_000
    }
    const result = await call({ target, operation: 'collect', request })
    expect(result).toEqual({ ok: true, value: { stdout: '{"points":[]}', code: 0 } })
    expect(executeMetricCollection).toHaveBeenCalledWith({
      repoPath: '/srv/project',
      ...request
    })
  })

  it('rejects malformed argv, foreign env keys and unbounded timeouts', async () => {
    const base = {
      checkoutRoot: '/srv/workspaces',
      configurationCommit: sha,
      run: ['node', '.bw/scripts/x.js'],
      args: ['--since', '2026-09-21', '--until', '2026-09-28', '--granularity', 'week'],
      env: {},
      timeoutMs: 60_000
    }
    const send = (request: unknown) => call({ target, operation: 'collect', request })
    await expect(send({ ...base, run: ['node', 'x\u0000.js'] })).rejects.toThrow()
    await expect(send({ ...base, env: { PATH: '/evil' } })).rejects.toThrow()
    await expect(send({ ...base, timeoutMs: 900_001 })).rejects.toThrow()
    await expect(send({ ...base, args: ['--since', '2026-09-21'] })).rejects.toThrow()
    await expect(send({ ...base, args: [...base.args, 'extra'] })).rejects.toThrow()
    await expect(send({ ...base, args: [...base.args.slice(0, 5), 'month'] })).rejects.toThrow()
    await expect(call({ target, operation: 'collect', request: base, extra: 1 })).rejects.toThrow()
    expect(executeMetricCollection).not.toHaveBeenCalled()
  })

  it('surfaces core failures as typed error envelopes', async () => {
    const { MetricCollectorError } = await import('../../main/workbench/metrics/collector-output')
    readMetricConfiguration.mockRejectedValue(
      new MetricCollectorError('configuration-not-adopted', '试采草稿不能作为正式读数来源')
    )
    expect(
      await call({ target, operation: 'configuration', request: { adoptedRef: null } })
    ).toEqual({
      ok: false,
      error: { code: 'configuration-not-adopted', message: '试采草稿不能作为正式读数来源' }
    })
  })
})
