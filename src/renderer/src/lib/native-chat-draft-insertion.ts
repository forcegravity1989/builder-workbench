export type NativeChatDraftTarget = { tabId: string; paneKey: string }

type InsertDraft = (text: string) => boolean
const targets = new Map<string, Set<InsertDraft>>()

function targetKey(target: NativeChatDraftTarget): string {
  return JSON.stringify([target.tabId, target.paneKey])
}

/** A mounted composer registers its existing draft writer, never a second draft store. */
export function registerNativeChatDraftTarget(
  target: NativeChatDraftTarget,
  insert: InsertDraft
): () => void {
  const key = targetKey(target)
  const writers = targets.get(key) ?? new Set<InsertDraft>()
  writers.add(insert)
  targets.set(key, writers)
  return () => {
    writers.delete(insert)
    if (writers.size === 0) {
      targets.delete(key)
    }
  }
}

/** Append without submitting; a missing or ambiguous mounted target is a failure. */
export function insertNativeChatDraft(request: NativeChatDraftTarget & { text: string }): boolean {
  const writers = targets.get(targetKey(request))
  if (!request.text.trim() || writers?.size !== 1) {
    return false
  }
  const writer = writers.values().next().value
  return writer?.(request.text) === true
}
