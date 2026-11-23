const TITLE_GOAL_PREFIX = /^【([^|｜】]+)[|｜]([^】]+)】/

export function resolveMemberGoalId(
  title: string,
  version: string,
  goalIds: ReadonlySet<string>
): string | undefined {
  const match = TITLE_GOAL_PREFIX.exec(title.trim())
  const goalId = match?.[2].trim()
  return match?.[1].trim() === version && goalId && goalIds.has(goalId) ? goalId : undefined
}
