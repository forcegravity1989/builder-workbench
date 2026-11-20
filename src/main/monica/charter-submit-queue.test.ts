import { expect, it } from 'vitest'
import { serializeCharterSubmission } from './charter-submit-queue'

it('serializes one owning repository and releases the queue after a failed submission', async () => {
  let release!: () => void
  const barrier = new Promise<void>((resolve) => {
    release = resolve
  })
  const order: number[] = []
  const first = serializeCharterSubmission('local:repo', async () => {
    order.push(1)
    await barrier
    throw new Error('push failed')
  })
  const result = first.catch((error) => error.message)
  const second = serializeCharterSubmission('local:repo', async () => {
    order.push(2)
    return { mode: 'noop', filled: [] }
  })
  await Promise.resolve()
  expect(order).toEqual([1])
  release()
  expect(await result).toBe('push failed')
  expect(await second).toEqual({ mode: 'noop', filled: [] })
  expect(order).toEqual([1, 2])
})
