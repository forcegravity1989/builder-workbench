import type { Repo } from '../repo-types'
import { parseTaskItemLink } from '../task-item-link'
import { workbenchVersionTaskLabel } from './task-scope'

const TITLE_GOAL_PREFIX = /^【([^|｜】]+)[|｜]([^】]+)】/

export type IssueVersionMembership = {
  title: string
  labels: string[]
  titleChanged: boolean
  addedLabel: string | null
}

/** 归版只追加所选版本的计划标签，并改写标题开头的版本目标段。已有版本标签全部保留。 */
export function nextIssueVersionMembership(input: {
  title: string
  labels?: readonly string[] | null
  version: string
  goalId: string
}): IssueVersionMembership {
  const current = input.labels ? [...input.labels] : []
  const label = workbenchVersionTaskLabel(input.version)
  const addedLabel = current.includes(label) ? null : label
  const trimmed = input.title.trim()
  const match = TITLE_GOAL_PREFIX.exec(trimmed)
  const rest = match ? trimmed.slice(match[0].length) : trimmed
  const title = `【${input.version}|${input.goalId}】${rest}`
  return {
    title,
    labels: addedLabel ? [...current, addedLabel] : current,
    titleChanged: title !== input.title,
    addedLabel
  }
}

/** 归版写入钉在刚读回的 Issue 链接上，避免编号更新改到另一端同号 Issue。 */
export function githubIssueAssignmentTarget(
  url: string,
  number: number,
  repos: readonly Repo[] = []
): { owner: string; repo: string; host: string } | null {
  const link = parseTaskItemLink(url, repos)
  if (!link || link.provider !== 'github' || link.kind !== 'issue' || link.number !== number) {
    return null
  }
  const [owner, repo] = link.repository.split('/')
  return owner && repo && link.repository.split('/').length === 2
    ? { owner, repo, host: link.host }
    : null
}

export function resolveMemberGoalId(
  title: string,
  version: string,
  goalIds: ReadonlySet<string>
): string | undefined {
  const match = TITLE_GOAL_PREFIX.exec(title.trim())
  const goalId = match?.[2].trim()
  return match?.[1].trim() === version && goalId && goalIds.has(goalId) ? goalId : undefined
}
