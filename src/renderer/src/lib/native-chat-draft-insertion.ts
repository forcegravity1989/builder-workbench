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

function soleWriter(writers: Set<InsertDraft> | undefined): InsertDraft | null {
  if (!writers || writers.size !== 1) {
    return null
  }
  return writers.values().next().value ?? null
}

/** Append without submitting; a missing or ambiguous mounted target is a failure. */
export function insertNativeChatDraft(request: NativeChatDraftTarget & { text: string }): boolean {
  if (!request.text.trim()) {
    return false
  }
  const writer = soleWriter(targets.get(targetKey(request)))
  return writer?.(request.text) === true
}

/** One mounted composer on this tab is enough; several panes stay a failure. */
export function insertNativeChatDraftForTab(tabId: string, text: string): boolean {
  if (!text.trim()) {
    return false
  }
  const writers: InsertDraft[] = []
  for (const [key, registered] of targets) {
    let parsed: unknown
    try {
      parsed = JSON.parse(key)
    } catch {
      continue
    }
    if (!Array.isArray(parsed) || parsed[0] !== tabId) {
      continue
    }
    const writer = soleWriter(registered)
    if (writer) {
      writers.push(writer)
    }
  }
  if (writers.length !== 1) {
    return false
  }
  return writers[0](text) === true
}
