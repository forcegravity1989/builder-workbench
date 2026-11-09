import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { getCanonicalUserDataPath } from '../persistence/loading-store/user-data-path'
import { writePluginFileAtomically } from '../plugins/plugin-atomic-file-write'
import {
  ReviewIncomingSchema,
  reviewRepositoryKey,
  type ReviewIncomingRequest
} from '../../shared/workbench/pr-review-request'

const InboxSchema = z.array(ReviewIncomingSchema)
let writes: Promise<unknown> = Promise.resolve()
const inboxPath = () => join(getCanonicalUserDataPath(), 'workbench-review-inbox.json')

async function readStoredInbox(): Promise<ReviewIncomingRequest[]> {
  try {
    return InboxSchema.parse(JSON.parse(await readFile(inboxPath(), 'utf8')))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

export async function readReviewInbox(): Promise<ReviewIncomingRequest[]> {
  const latest = new Map<string, ReviewIncomingRequest>()
  for (const item of await readStoredInbox()) {
    const key = `${reviewRepositoryKey(item.repo)}#${item.prNumber}`
    const previous = latest.get(key)
    if (!previous || previous.receivedAt < item.receivedAt) latest.set(key, item)
  }
  return [...latest.values()]
}

export function receiveReviewRequest(request: ReviewIncomingRequest): Promise<void> {
  // A renderer reload must not lose a request already acknowledged by the runtime.
  const write = writes
    .catch(() => undefined)
    .then(async () => {
      const items = await readStoredInbox()
      const key = reviewRepositoryKey(request.repo)
      const index = items.findIndex(
        (item) =>
          reviewRepositoryKey(item.repo) === key &&
          item.prNumber === request.prNumber &&
          item.senderId === request.senderId
      )
      const previous = items[index]
      if (previous?.senderId === request.senderId) {
        if (previous.cycleId === request.cycleId && previous.round >= request.round) return
        if (
          previous.cycleId !== request.cycleId &&
          previous.cycleStartedAt >= request.cycleStartedAt
        )
          return
      }
      // Persist arrival order independently of clock rollback and millisecond ties.
      const newestArrival = items.reduce(
        (latest, item) => Math.max(latest, Date.parse(item.receivedAt)),
        0
      )
      const accepted = {
        ...request,
        receivedAt: new Date(Math.max(Date.now(), newestArrival + 1)).toISOString()
      }
      if (index < 0) items.push(accepted)
      else items[index] = accepted
      await mkdir(getCanonicalUserDataPath(), { recursive: true })
      await writePluginFileAtomically(inboxPath(), JSON.stringify(items), { mode: 0o600 })
    })
  writes = write
  return write
}
