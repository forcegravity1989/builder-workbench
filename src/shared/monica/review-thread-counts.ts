import type { CodeHubComment } from '../codehub-tasks'

export function countUnresolvedCodeHubThreadsSince(
  comments: readonly CodeHubComment[],
  sinceIso: string
): number | null {
  const since = Date.parse(sinceIso)
  if (!Number.isFinite(since)) {
    return null
  }
  const threads = new Set<string>()
  let count = 0
  for (const comment of comments) {
    if (comment.individual) {
      continue
    }
    if (!comment.discussionId) {
      return null
    }
    if (threads.has(comment.discussionId)) {
      continue
    }
    threads.add(comment.discussionId)
    if (comment.isReply) {
      return null
    }
    if (comment.isSystem === true) {
      continue
    }
    const createdAt = Date.parse(comment.createdAt)
    // Native discussions preserve the root first; replies do not own its resolved state.
    if (
      comment.isSystem !== false ||
      typeof comment.isResolved !== 'boolean' ||
      !Number.isFinite(createdAt)
    ) {
      return null
    }
    if (createdAt > since && !comment.isResolved) {
      count++
    }
  }
  return count
}
