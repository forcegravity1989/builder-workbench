import type { VersionTaskSnapshot } from '../../../../shared/workbench/version-material'

/** One derivation for the list and the board header: counts come only from real reads;
 * unread or failed items never collapse into a completion-style 0/0 fraction. */
export function taskSnapshotFacts(snapshot: VersionTaskSnapshot[], referenced: number) {
  const states = new Map<string, number>()
  let readAt: string | null = null
  for (const item of snapshot) {
    const state = item.kind === 'ready' ? item.state : '读取失败'
    states.set(state, (states.get(state) ?? 0) + 1)
    if (readAt === null || item.readAt > readAt) {
      readAt = item.readAt
    }
  }
  return { states, unread: Math.max(0, referenced - snapshot.length), readAt }
}

export function taskSnapshotSummary(snapshot: VersionTaskSnapshot[], referenced: number): string {
  const facts = taskSnapshotFacts(snapshot, referenced)
  const parts = [...facts.states].map(([state, count]) => `${state} ${count}`)
  if (facts.unread > 0) {
    parts.push(`待读取 ${facts.unread}`)
  }
  if (facts.readAt) {
    parts.push(`快照 ${facts.readAt}`)
  }
  return `Issue ${parts.length > 0 ? parts.join(' · ') : `待读取 ${referenced} 项`}`
}
