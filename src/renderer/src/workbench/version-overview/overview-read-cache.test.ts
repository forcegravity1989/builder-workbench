import { expect, it } from 'vitest'
import { createOverviewReadCache } from './overview-read-cache'

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
})
