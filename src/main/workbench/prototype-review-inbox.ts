import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { getCanonicalUserDataPath } from '../persistence/loading-store/user-data-path'
import { writePluginFileAtomically } from '../plugins/plugin-atomic-file-write'
import {
  PrototypeReviewIncomingSchema,
  prototypeReviewEventId,
  type PrototypeReviewIncomingRequest
} from '../../shared/workbench/prototype-review-request'

const InboxSchema = z.array(PrototypeReviewIncomingSchema)
let writes: Promise<unknown> = Promise.resolve()
const inboxPath = () => join(getCanonicalUserDataPath(), 'workbench-prototype-review-inbox-v2.json')

async function readStoredInbox(): Promise<PrototypeReviewIncomingRequest[]> {
  try {
    return InboxSchema.parse(JSON.parse(await readFile(inboxPath(), 'utf8')))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return []
    }
    throw error
  }
}

export async function readPrototypeReviewInbox(): Promise<PrototypeReviewIncomingRequest[]> {
  const latest = new Map<string, PrototypeReviewIncomingRequest>()
  for (const item of await readStoredInbox()) {
    const key = prototypeReviewEventId(item)
    const previous = latest.get(key)
    if (!previous || previous.receivedAt < item.receivedAt) {
      latest.set(key, item)
    }
  }
  return [...latest.values()]
}

export function dismissPrototypeReviewRequest(
  eventId: string,
  seenReceivedAt: string
): Promise<boolean> {
  const write = writes
    .catch(() => undefined)
    .then(async () => {
      const items = await readStoredInbox()
      const remaining = items.filter(
        (item) => prototypeReviewEventId(item) !== eventId || item.receivedAt > seenReceivedAt
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

export function receivePrototypeReviewRequest(
  request: PrototypeReviewIncomingRequest
): Promise<boolean> {
  const write = writes
    .catch(() => undefined)
    .then(async () => {
      const items = await readStoredInbox()
      const key = prototypeReviewEventId(request)
      const index = items.findIndex(
        (item) => prototypeReviewEventId(item) === key && item.senderId === request.senderId
      )
      const previous = items[index]
      if (previous?.senderId === request.senderId) {
        if (previous.round === request.round) {
          return true
        }
        if (previous.round > request.round) {
          return false
        }
      }
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
