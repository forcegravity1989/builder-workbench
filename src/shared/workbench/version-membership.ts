/**
 * Version membership is derived from data the Issue already carries: the
 * `bw:plan:<version>` label decides which version an Issue belongs to, and the
 * `【<version>|<goal>】` title prefix decides the goal. This module is the pure
 * read side — no provider calls, no material writes — so both the live plan
 * board and its tests share one definition of "which goal is this Issue in".
 */

// 【v0.7|G1】 or full-width vertical bar 【v0.7｜G1】; goal token is group 2.
const TITLE_GOAL_PREFIX = /^【([^|｜】]+)[|｜]([^】]+)】/

export function parseTitleGoalToken(title: string): string | null {
  const match = TITLE_GOAL_PREFIX.exec(String(title ?? '').trim())
  return match ? match[2].trim() : null
}

/** Resolve a member's goal only when the title token is one of the known goal ids. */
export function resolveMemberGoalId(
  title: string,
  goalIds: ReadonlySet<string>
): string | undefined {
  const token = parseTitleGoalToken(title)
  return token && goalIds.has(token) ? token : undefined
}
