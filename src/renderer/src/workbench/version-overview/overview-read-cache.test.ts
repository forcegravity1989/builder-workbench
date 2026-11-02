import { expect, it } from 'vitest'
import { createOverviewReadCache } from './overview-read-cache'
import { retainMaterialRead } from './material-cache'
import type { VersionOverviewMaterials } from '../version-overview-materials'

it('shares concurrent reads, notifies both screens and retains only same-source values on failure', async () => {
  const cache = createOverviewReadCache<number>((value) => value)
  let finish!: (n: number) => void
  let calls = 0
  const first = () => {
    calls++
    return new Promise<number>((resolve) => {
      finish = resolve
    })
  }
  let left = 0,
    right = 0
  const offLeft = cache.subscribe('repo:A:revision:1', () => left++)
  const offRight = cache.subscribe('repo:A:revision:1', () => right++)
  const a = cache.read('repo:A:revision:1', first)
  const b = cache.read('repo:A:revision:1', first)
  await Promise.resolve()
  expect(calls).toBe(1)
  expect(cache.get('repo:A:revision:1').loading).toBe(true)
  finish(12)
  await Promise.all([a, b])
  expect(left).toBe(2)
  expect(right).toBe(2)
  expect(cache.get('repo:A:revision:1').value).toBe(12)
  await cache.read(
    'repo:A:revision:1',
    async () => {
      throw new Error('offline')
    },
    true
  )
  expect(cache.get('repo:A:revision:1')).toEqual({ value: 12, loading: false, error: 'offline' })
  await cache.read('repo:B:revision:1', async () => {
    throw new Error('unavailable')
  })
  expect(cache.get('repo:B:revision:1').value).toBeUndefined()
  expect(cache.get('repo:A:revision:2').value).toBeUndefined()
  await cache.read('repo:A:revision:1', async () => 20, true)
  expect(cache.get('repo:A:revision:1')).toEqual({ value: 20, loading: false })
  offLeft()
  offRight()

  const materials = (revision: string, number: number): VersionOverviewMaterials => {
    const plan = {
      schema_version: 3 as const,
      version: 'v0.8',
      cycleId: 'plan-cycle',
      summary: { progress: '', risks: '' },
      goals: [],
      tasks: [],
      workflow: {
        stage: 'archive' as const,
        updatedAt: '2026-10-29T00:00:00Z',
        archivePr: { provider: 'github', repository: 'acme/app', number }
      }
    }
    return {
      plan: { kind: 'ready', document: plan, source: 'committed', revision },
      acceptance: {
        kind: 'ready',
        source: 'draft',
        document: {
          schema_version: 3,
          version: plan.version,
          cycleId: 'acceptance-cycle',
          planRef: {
            kind: 'committed',
            version: plan.version,
            cycleId: plan.cycleId,
            revision,
            sourceCommit: 'a'.repeat(40)
          },
          preparedArtifacts: [],
          results: []
        }
      },
      prStatuses: {
        plan: {
          state: 'merged',
          mergedAt: '2026-10-29T00:00:00Z',
          checkedAt: '2026-10-30T00:00:00Z'
        },
        acceptance: null
      }
    }
  }
  const original = retainMaterialRead(materials(`sha256:${'a'.repeat(64)}`, 446))
  const changed = materials(`sha256:${'b'.repeat(64)}`, 447)
  const failedPlan = {
    ...changed,
    plan: { kind: 'error' as const, message: 'fixed source unavailable' }
  }
  const retained = retainMaterialRead(failedPlan, original)
  expect(retained.plan).toEqual(original.plan)
  expect(retained.acceptance).toEqual(original.acceptance)
  expect(retained.readAt).toBe(original.readAt)
  expect(retained.stale).toBe(true)
  expect(retained.problems).toContain('fixed source unavailable')
  expect(retainMaterialRead(failedPlan).plan.kind).toBe('error')

  const unknown = { state: 'unknown' as const, reason: 'offline' }
  const refreshed = { ...changed, prStatuses: { plan: unknown, acceptance: null } }
  const changedReference = retainMaterialRead(refreshed, original)
  expect(changedReference.prStatuses.plan).toEqual(unknown)
  expect(changedReference.stale).toBe(false)
  const partial = retainMaterialRead(refreshed)
  expect(retainMaterialRead(failedPlan, partial).stale).toBe(false)
  expect(retainMaterialRead(failedPlan, partial).plan.kind).toBe('error')

  const sameReference = retainMaterialRead(
    { ...original, prStatuses: refreshed.prStatuses },
    original
  )
  expect(sameReference.prStatuses.plan).toEqual(original.prStatuses.plan)
  expect(sameReference.stale).toBe(true)
  if (changed.plan.kind !== 'ready') {
    throw new Error('Expected a ready fixed-plan fixture')
  }
  const removed = retainMaterialRead(
    {
      ...changed,
      plan: { ...changed.plan, document: { ...changed.plan.document, workflow: undefined } },
      prStatuses: { plan: null, acceptance: null }
    },
    original
  )
  expect(removed.prStatuses.plan).toBeNull()
  expect(removed.stale).toBe(false)
})
