import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { getCanonicalUserDataPath } from '../persistence/loading-store/user-data-path'
import { writePluginFileAtomically } from '../plugins/installation/plugin-atomic-file-write'
import {
  ReviewIncomingSchema,
  migrateStoredReviewRequest,
  reviewRepositoryKey,
  type ReviewIncomingRequest,
  type ReviewRepoIdentity
} from '../../shared/workbench/pr-review-request'

const InboxSchema = z.array(z.preprocess(migrateStoredReviewRequest, ReviewIncomingSchema))
let writes: Promise<unknown> = Promise.resolve()
const inboxPath = () => join(getCanonicalUserDataPath(), 'workbench-review-inbox.json')

async function readStoredInbox(): Promise<ReviewIncomingRequest[]> {
  try {
    return InboxSchema.parse(JSON.parse(await readFile(inboxPath(), 'utf8')))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return []
    }
    throw error
  }
}

export async function readReviewInbox(): Promise<ReviewIncomingRequest[]> {
  const latest = new Map<string, ReviewIncomingRequest>()
  for (const item of await readStoredInbox()) {
    const key = `${reviewRepositoryKey(item.repo)}#${item.prNumber}`
    const previous = latest.get(key)
    if (!previous || previous.receivedAt < item.receivedAt) {
      latest.set(key, item)
    }
  }
  return [...latest.values()]
}

export function dismissReviewRequest(
  repo: ReviewRepoIdentity,
  prNumber: number,
  seenReceivedAt: string
): Promise<boolean> {
  // The inbox UI groups by project and PR, so a dismissal clears every entry the user
  // could have seen (receivedAt <= the displayed one); otherwise an older hidden
  // sender/round resurfaces. Entries received after that snapshot were never shown;
  // dropping an acknowledged delivery would lose it silently, so they stay and
  // reappear through the next reconciliation.
  const write = writes
    .catch(() => undefined)
    .then(async () => {
      const items = await readStoredInbox()
      const key = reviewRepositoryKey(repo)
      const remaining = items.filter(
        (item) =>
          reviewRepositoryKey(item.repo) !== key ||
          item.prNumber !== prNumber ||
          item.receivedAt > seenReceivedAt
      )
      if (remaining.length === items.length) {
        return false
      }
      await mkdir(getCanonicalUserDataPath(), { recursive: true })
      await writePluginFileAtomically(inboxPath(), JSON.stringify(remaining), { mode: 0o600 })
      return true
    })
  writes = write
  return write
}

export function receiveReviewRequest(request: ReviewIncomingRequest): Promise<boolean> {
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
        if (previous.cycleId === request.cycleId && previous.round === request.round) {
          if (
            previous.sentAt !== request.sentAt ||
            previous.cycleStartedAt !== request.cycleStartedAt ||
            previous.title !== request.title ||
            previous.sourceBranch !== request.sourceBranch ||
            previous.targetBranch !== request.targetBranch ||
            previous.sender !== request.sender
          ) {
            throw new Error('同一轮评审请求内容不一致，请刷新后重试')
          }
          return true
        }
        if (previous.cycleId === request.cycleId && previous.round > request.round) {
          return false
        }
        if (
          previous.cycleId !== request.cycleId &&
          previous.cycleStartedAt >= request.cycleStartedAt
        ) {
          return false
        }
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
      if (index === -1) {
        items.push(accepted)
      } else {
        items[index] = accepted
      }
      await mkdir(getCanonicalUserDataPath(), { recursive: true })
      await writePluginFileAtomically(inboxPath(), JSON.stringify(items), { mode: 0o600 })
      return true
    })
  writes = write
  return write
}
