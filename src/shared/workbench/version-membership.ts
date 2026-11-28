import { isDefaultGitHubHost } from '../github/repositories/repository-identity-key'
import type { Repo } from '../repository/repo-types'
import { parseTaskItemLink, taskItemLinkIdentityKey } from '../task-item-link'
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

/**
 * 已有关联的仓库身份取链接本身。GitHub 是 `host/owner/repo`，CodeHub 是 `host/项目路径`。
 * 链接对不上这条 Issue 时返回空，调用方不得改用工作区登记仓库。
 */
export function linkedIssueRepository(
  url: string,
  provider: 'github' | 'codehub',
  number: number,
  repos: readonly Repo[] = []
): string | null {
  const link = parseTaskItemLink(url, repos)
  if (!link || link.provider !== provider || link.kind !== 'issue' || link.number !== number) {
    return null
  }
  if (link.provider === 'github' && !isDefaultGitHubHost(link.host)) {
    // 登记键用主机名，不带 HTTP 端口。带端口的键会被远端解析当成 scp 路径。
    return `${link.host.replace(/:\d+$/, '')}/${link.repository}`.toLowerCase()
  }
  return taskItemLinkIdentityKey(link)
}

/** 读回链接必须和原来的关联是同一条 Issue，同号的另一端仓库不算。 */
export function sameIssueLink(
  expectedUrl: string,
  actualUrl: string,
  provider: 'github' | 'codehub',
  number: number,
  repos: readonly Repo[] = []
): boolean {
  const expected = linkedIssueRepository(expectedUrl, provider, number, repos)
  const actual = linkedIssueRepository(actualUrl, provider, number, repos)
  return expected !== null && expected === actual
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
