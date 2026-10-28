import { beforeEach, expect, it, vi } from 'vitest'
import type { CodeHubTaskDetail } from '../../../../../shared/codehub-tasks'

const { api } = vi.hoisted(() => ({
  api: {
    viewTask: vi.fn(),
    listComments: vi.fn(),
    mrChecks: vi.fn(),
    mrChanges: vi.fn()
  }
}))
vi.mock('@/lib/codehub-api', () => ({ codehubApi: api }))

import {
  CODEHUB_DETAIL_CACHE_MAX,
  codehubDetailCache,
  ensureCodehubDetailFresh,
  getCodehubDetailCacheKey,
  prefillCodehubDetailCache
} from './codehub-detail-cache'

const detail: CodeHubTaskDetail = {
  iid: 8,
  title: 'Merge me',
  description: '',
  state: 'opened',
  url: null,
  author: 'Ada',
  assignees: [],
  reviewers: [],
  labels: [],
  sourceBranch: 'feat/x',
  targetBranch: 'main'
}

const mrArgs = { repoPath: '/repo', repoId: 'r1', kind: 'mr' as const, iid: 8 }

beforeEach(() => {
  codehubDetailCache.clear()
  api.viewTask.mockReset().mockResolvedValue(detail)
  api.listComments.mockReset().mockResolvedValue([])
  api.mrChecks.mockReset().mockResolvedValue([])
  api.mrChanges.mockReset().mockResolvedValue([])
})

it('builds collision-free keys from repoId, kind and iid', () => {
  // `\0` separator: a repoId containing ':' or '/' must not collide with
  // another field split.
  expect(getCodehubDetailCacheKey({ repoId: 'a/b', kind: 'mr', iid: 8 })).not.toBe(
    getCodehubDetailCacheKey({ repoId: 'a', kind: 'mr', iid: 8 })
  )
  expect(getCodehubDetailCacheKey({ repoId: 'r1', kind: 'issue', iid: 8 })).not.toBe(
    getCodehubDetailCacheKey({ repoId: 'r1', kind: 'mr', iid: 8 })
  )
})

it('dedupes concurrent full reads and skips refetch inside the fresh window', async () => {
  let releaseView: ((value: CodeHubTaskDetail) => void) | undefined
  api.viewTask.mockImplementation(
    () =>
      new Promise((resolve) => {
        releaseView = resolve
      })
  )
  const first = ensureCodehubDetailFresh(mrArgs)
  const second = ensureCodehubDetailFresh(mrArgs)
  expect(api.viewTask).toHaveBeenCalledTimes(1)
  expect(api.mrChecks).toHaveBeenCalledTimes(1)
  releaseView?.(detail)
  await Promise.all([first, second])
  // Fresh window: a third ensure resolves without another CLI round.
  await ensureCodehubDetailFresh(mrArgs)
  expect(api.viewTask).toHaveBeenCalledTimes(1)
  expect(codehubDetailCache.get(getCodehubDetailCacheKey(mrArgs))?.detail).toEqual(detail)
})

it('keeps stale lanes and stays retryable when a full read fails (stale-on-error)', async () => {
  prefillCodehubDetailCache(mrArgs, detail)
  api.viewTask.mockRejectedValue(new Error('cli down'))
  await ensureCodehubDetailFresh(mrArgs)
  const entry = codehubDetailCache.get(getCodehubDetailCacheKey(mrArgs))
  // The prefilled detail lane keeps painting; fetchedAt stays 0 so the next
  // open retries instead of caching the failure as fresh.
  expect(entry?.detail).toEqual(detail)
  expect(entry?.detailError).toBe('cli down')
  expect(entry?.fetchedAt).toBe(0)
  api.viewTask.mockResolvedValue(detail)
  await ensureCodehubDetailFresh(mrArgs)
  expect(codehubDetailCache.get(getCodehubDetailCacheKey(mrArgs))?.fetchedAt).toBeGreaterThan(0)
})

it('evicts the oldest entry beyond the MRU cap', () => {
  for (let index = 0; index <= CODEHUB_DETAIL_CACHE_MAX; index += 1) {
    prefillCodehubDetailCache({ repoId: `r${index}`, kind: 'mr', iid: 1 }, detail)
  }
  expect(codehubDetailCache.size).toBe(CODEHUB_DETAIL_CACHE_MAX)
  expect(
    codehubDetailCache.has(getCodehubDetailCacheKey({ repoId: 'r0', kind: 'mr', iid: 1 }))
  ).toBe(false)
  expect(
    codehubDetailCache.has(
      getCodehubDetailCacheKey({ repoId: `r${CODEHUB_DETAIL_CACHE_MAX}`, kind: 'mr', iid: 1 })
    )
  ).toBe(true)
})

it('never regresses a completed full read with an older archive-jump prefill', async () => {
  await ensureCodehubDetailFresh(mrArgs)
  const before = codehubDetailCache.get(getCodehubDetailCacheKey(mrArgs))
  prefillCodehubDetailCache(mrArgs, { ...detail, title: 'stale jump snapshot' })
  expect(codehubDetailCache.get(getCodehubDetailCacheKey(mrArgs))).toBe(before)
})
