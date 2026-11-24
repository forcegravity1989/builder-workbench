import {
  isOrcaSessionId,
  type OrcaSessionId
} from '../../../shared/agent-session/identity/orca-session-address'
import type { AgentSessionRecord } from '../../../shared/agent-session-record'

type LineageRecord = Pick<AgentSessionRecord, 'sessionId' | 'location' | 'conversationCommand'>

function clearedInto(record: LineageRecord): string | undefined {
  const command = record.conversationCommand
  return command?.command === 'clear' && command.phase === 'committed'
    ? (command.replacementSessionId ?? undefined)
    : undefined
}

/** Uses the conversation's root for durable Runs and the latest session for live delivery. */
export function canonicalOrchestrationSessionId(
  id: OrcaSessionId,
  records: readonly LineageRecord[],
  workspaceId: string
): OrcaSessionId {
  const previousIds = new Map<string, string>()
  for (const record of records) {
    const next = clearedInto(record)
    if (next && record.location.workspaceId === workspaceId) {
      previousIds.set(next, record.sessionId)
    }
  }
  let root = id
  const visited = new Set<string>([id])
  for (let previous = previousIds.get(root); previous; previous = previousIds.get(root)) {
    if (visited.has(previous) || !isOrcaSessionId(previous)) {
      return id
    }
    visited.add(previous)
    root = previous
  }
  return root
}

export function latestOrchestrationSession<Record extends LineageRecord>(
  root: Record,
  read: (id: string) => Record | null | undefined
): Record {
  let current = root
  const visited = new Set([root.sessionId])
  for (let nextId = clearedInto(current); nextId; nextId = clearedInto(current)) {
    const next = read(nextId)
    if (!next || visited.has(nextId) || next.location.workspaceId !== root.location.workspaceId) {
      break
    }
    visited.add(nextId)
    current = next
  }
  return current
}
