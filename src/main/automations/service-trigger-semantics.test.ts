import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { Repo } from '../../shared/repo-types'
import { AutomationService } from './service'
import { installFakeAppEnvironment } from '../../../config/scripts/vitest-host-ports-setup'

// Why split from service.test.ts: the one-shot / overlap / webhook trigger
// semantics grew past the max-lines budget; they share the same store fixture.

const testState = { dir: '' }

vi.mock('electron', () => ({
  app: {
    getPath: () => testState.dir
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (plaintext: string) => Buffer.from(`encrypted:${plaintext}`, 'utf-8'),
    decryptString: (ciphertext: Buffer) => ciphertext.toString('utf-8').slice('encrypted:'.length)
  }
}))

async function createStore() {
  vi.resetModules()
  // Why: userData resolves through AppEnvironment; point it at this file's temp dir.
  installFakeAppEnvironment({ getPath: () => testState.dir })
  const { Store, initDataPath } = await import('../persistence')
  initDataPath()
  return new Store()
}

const makeRepo = (overrides: Partial<Repo> = {}): Repo => ({
  id: 'r1',
  path: '/repo',
  displayName: 'test',
  badgeColor: '#fff',
  addedAt: 1,
  ...overrides
})

describe('AutomationService trigger semantics', () => {
  beforeEach(() => {
    testState.dir = mkdtempSync(join(tmpdir(), 'orca-automations-test-'))
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    rmSync(testState.dir, { recursive: true, force: true })
  })

  it('records webhook runs without consuming a one-shot chance, and skips while a run is active', async () => {
    vi.setSystemTime(new Date('2026-05-13T08:00:00Z'))
    const store = await createStore()
    store.addRepo(makeRepo())
    const onceAt = new Date('2026-05-13T09:00:00Z').getTime()
    const automation = store.createAutomation({
      name: 'Webhook one-shot',
      prompt: 'Check the repo',
      agentId: 'claude',
      projectId: 'r1',
      workspaceMode: 'existing',
      workspaceId: 'wt1',
      timezone: 'UTC',
      rrule: '',
      dtstart: Date.now(),
      onceAt
    })
    const send = vi.fn()
    const service = new AutomationService(store, { tickMs: 60_000 })
    service.setWebContents({
      isDestroyed: () => false,
      send
    } as never)
    service.setRendererReady()

    const dispatched = await service.runWebhook(automation.id)

    // webhook 是外部手动等价物：trigger 记 'webhook'，但不递增调度计数、不消耗一次性机会。
    expect(dispatched).toMatchObject({ outcome: 'dispatched', run: { trigger: 'webhook' } })
    const afterWebhook = store.listAutomations().find((entry) => entry.id === automation.id)
    expect(afterWebhook?.scheduledRunCount).toBeUndefined()
    expect(afterWebhook?.onceAt).toBe(onceAt)

    // 上次仍在运行（dispatching 非终态）→ 受固定并发约束：跳过并记录 skipped_overlap。
    const second = await service.runWebhook(automation.id)
    expect(second.outcome).toBe('skipped_overlap')
    expect(
      store.listAutomationRuns(automation.id).some((run) => run.status === 'skipped_overlap')
    ).toBe(true)
  })

  it('dispatches a one-shot automation once and never again', async () => {
    vi.setSystemTime(new Date('2026-05-13T08:59:00'))
    const store = await createStore()
    store.addRepo(makeRepo())
    const onceAt = new Date('2026-05-13T09:00:00').getTime()
    store.createAutomation({
      name: 'One-shot',
      prompt: 'Do it once',
      agentId: 'claude',
      projectId: 'r1',
      workspaceMode: 'existing',
      workspaceId: 'wt1',
      timezone: 'UTC',
      rrule: '',
      dtstart: Date.now(),
      onceAt,
      enabled: true
    })
    vi.setSystemTime(new Date('2026-05-13T09:01:00'))
    const send = vi.fn()
    const service = new AutomationService(store, { tickMs: 60_000 })
    service.setWebContents({
      isDestroyed: () => false,
      send
    } as never)
    service.start()
    service.setRendererReady()
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    // 后续 tick 不再派发：已派发即终结（scheduledRunCount ≥ 1）。
    vi.advanceTimersByTime(60_000)
    vi.advanceTimersByTime(60_000)
    expect(send).toHaveBeenCalledTimes(1)
    service.stop()
    const stored = store.listAutomations().find((entry) => entry.name === 'One-shot')
    expect(stored?.scheduledRunCount).toBe(1)
    expect(stored?.nextRunAt).toBe(onceAt)
  })

  it('skips overlapping occurrences without consuming the count, while manual runs are unrestricted', async () => {
    vi.setSystemTime(new Date('2026-05-13T08:59:00'))
    const store = await createStore()
    store.addRepo(makeRepo())
    const automation = store.createAutomation({
      name: 'Every minute',
      prompt: 'Work',
      agentId: 'claude',
      projectId: 'r1',
      workspaceMode: 'existing',
      workspaceId: 'wt1',
      timezone: 'UTC',
      rrule: 'FREQ=MINUTELY;INTERVAL=1',
      dtstart: Date.now(),
      enabled: true
    })
    // 种一个非终态运行：上次仍在跑。
    store.createAutomationRun(automation, new Date('2026-05-13T08:59:30').getTime())
    const seeded = store.listAutomationRuns(automation.id)[0]!
    store.updateAutomationRun({ runId: seeded.id, status: 'dispatched' })

    vi.setSystemTime(new Date('2026-05-13T09:01:00'))
    const send = vi.fn()
    const service = new AutomationService(store, { tickMs: 60_000 })
    service.setWebContents({
      isDestroyed: () => false,
      send
    } as never)
    service.start()
    service.setRendererReady()
    await vi.waitFor(() =>
      expect(
        store.listAutomationRuns(automation.id).some((run) => run.status === 'skipped_overlap')
      ).toBe(true)
    )
    // 同因折叠：第二个到期出现并进同一条，不新增行。
    vi.advanceTimersByTime(60_000)
    const overlapRows = store
      .listAutomationRuns(automation.id)
      .filter((run) => run.status === 'skipped_overlap')
    expect(overlapRows).toHaveLength(1)
    expect(overlapRows[0]!.occurrenceCount).toBe(2)
    // 跳过不消耗次数额度。
    expect(
      store.listAutomations().find((entry) => entry.id === automation.id)?.scheduledRunCount
    ).toBeUndefined()
    // 手动「立即运行」不受并发策略限制：人明确要跑就跑。
    await service.runNow(automation.id)
    expect(send).toHaveBeenCalledTimes(1)
    service.stop()
  })
})
