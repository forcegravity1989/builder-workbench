import { buildGitHubRepoUrl } from '../../shared/github/repositories/links'
import { getWorktreeGitHubIssueUrl } from '../../shared/worktree/github-issue-repository'
import type {
  GitHubWorkItem,
  GitHubWorkItemDetails,
  ListWorkItemsResult
} from '../../shared/github/work-items/work-item-types'
import type { RuntimeWorktreeListResult } from '../../shared/worktree/catalog/runtime-worktree-contracts'
import type { HandlerContext } from '../dispatch/dispatch'
import type { MaintenanceIssue } from './maintenance-queue'

const label = 'bw-bot-fix'
export type Issue = Omit<GitHubWorkItem, 'repoId'>

export function authorized(issue: Issue | null): issue is Issue {
  return issue?.state === 'open' && issue.type === 'issue' && issue.labels.includes(label)
}

export async function discover({ client }: HandlerContext, repo: string) {
  const issues = new Map<string, MaintenanceIssue>()
  let source: string | null = null
  for (let page = 1; ; page++) {
    const { result } = await client.call<ListWorkItemsResult<Issue>>('github.listWorkItems', {
      repo,
      query: `is:issue is:open label:${label}`,
      noCache: true,
      page,
      limit: 100
    })
    if (!result.sources.issues || result.issueSourceFellBack || result.errors?.issues) {
      throw new Error('无法核实所选项目的 GitHub Issue，请检查项目来源与登录。')
    }
    const pageSource = buildGitHubRepoUrl(result.sources.issues)?.toLowerCase()
    if (!pageSource || (source && pageSource !== source)) {
      throw new Error('扫描中仓库来源变化，请重新扫描。')
    }
    source = pageSource
    for (const issue of result.items.filter(authorized)) {
      issues.set(issue.url, { url: issue.url, number: issue.number })
    }
    if (result.items.length < 100) {
      break
    }
  }
  if (!source) {
    throw new Error('无法识别仓库来源。')
  }
  return { source, issues: [...issues.values()].sort((a, b) => a.number - b.number) }
}

export async function findExistingWork(
  { client }: HandlerContext,
  repoId: string,
  next: MaintenanceIssue
) {
  const { result: detail } = await client.call<GitHubWorkItemDetails | null>(
    'github.workItemDetails',
    {
      repo: repoId,
      number: next.number,
      type: 'issue',
      canonical: true
    }
  )
  if (!detail || detail.item.url !== next.url) {
    throw new Error('无法核对原 Issue 的工作记录。')
  }
  const existingPR = detail.timelineItems?.find(
    (event) => event.event === 'cross-referenced' && event.source?.type === 'pr'
  )?.source
  const { result: trees } = await client.call<RuntimeWorktreeListResult>('worktree.list', {
    repo: repoId,
    limit: 10000
  })
  if (trees.truncated) {
    throw new Error('工作树列表不完整，等待核对已有工作。')
  }
  const existingTree = trees.worktrees.find((tree) => {
    const url = getWorktreeGitHubIssueUrl(tree)
    return url ? url === next.url : tree.linkedIssue === next.number
  })
  return { existingTree, existingPR }
}
