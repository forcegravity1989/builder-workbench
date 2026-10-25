import type { GitHubOwnerRepo } from '../../shared/github/pull-request-types'
import type {
  WorkItemsBatchEntry,
  WorkItemsBatchResult
} from '../../shared/github/work-item-batch-types'
import { ghExecFileAsync, acquire, release } from './gh-utils'
import { mapIssueWorkItem, mapPullRequestWorkItem } from './client/map/work-item'

export type { WorkItemsBatchEntry, WorkItemsBatchResult }

// Why: owner/repo/host 直接内插进 GraphQL 查询串，必须白名单校验防注入；
// numbers 走 int 校验后拼接（issue-state-batch 同口径）。已知限制同源：
// 白名单不含 ':'，带端口 GHES host 拒绝并如实返回错误（调用方回落单条读）。
const SAFE_NAME = /^[A-Za-z0-9_.-]+$/
const MAX_NUMBERS_PER_CALL = 200
// 双别名（issue+pullRequest）每号占两个别名：单次查询编号数按别名上限 40 折半。
const NUMBERS_PER_QUERY = 20

// 字段集=单条读回链的行渲染消费面对齐（Rows/AssigneesCell/ReviewCell/MergeCell）：
// issue 对齐 mapIssueWorkItem 全字段；PR 对齐原生列表级字段＋同节点可直取的
// detail 字段（reviewDecision/additions/…/reviewRequests/latestOpinionatedReviews）。
// statusCheckRollup 与 merge-metadata 不进批量——原生 PR 列表路径同样不带
// （WORK_ITEM_PR_LIST_JSON_FIELDS 注释：per-row GraphQL 昂贵），checks 由行级
// 预取机制按 headSha 补齐，merge-metadata 在单条链里也是 best-effort 附加调用。
const ISSUE_FRAGMENT = `fragment BwIssueFields on Issue {
  number title state url updatedAt
  labels(first: 20) { nodes { name } }
  author { login avatarUrl }
  assignees(first: 20) { nodes { login name avatarUrl } }
}`
const PR_FRAGMENT = `fragment BwPullRequestFields on PullRequest {
  number title state url updatedAt mergedAt isDraft
  reviewDecision additions deletions changedFiles
  headRefOid headRefName baseRefName
  mergeable mergeStateStatus maintainerCanModify
  autoMergeRequest { enabledAt }
  headRepositoryOwner { login }
  labels(first: 20) { nodes { name } }
  author { login avatarUrl }
  assignees(first: 20) { nodes { login name avatarUrl } }
  reviewRequests(first: 10) { nodes { requestedReviewer { ... on User { login name avatarUrl } } } }
  latestOpinionatedReviews(first: 10) { nodes { author { login avatarUrl } state } }
}`

export function buildWorkItemsBatchQuery(owner: string, repo: string, numbers: number[]): string {
  const selections = numbers
    .map(
      (number) =>
        `i${number}: issue(number: ${number}) { ...BwIssueFields } p${number}: pullRequest(number: ${number}) { ...BwPullRequestFields }`
    )
    .join(' ')
  return `query { repository(owner: "${owner}", name: "${repo}") { ${selections} } } ${ISSUE_FRAGMENT} ${PR_FRAGMENT}`
}

/** GraphQL connection → 数组（gh --json 同形），供既有 mapper 直接消费。 */
function nodesArray(value: unknown): Record<string, unknown>[] {
  if (typeof value !== 'object' || value === null) {
    return []
  }
  const nodes = (value as { nodes?: unknown }).nodes
  return Array.isArray(nodes)
    ? nodes.filter(
        (node): node is Record<string, unknown> => typeof node === 'object' && node !== null
      )
    : []
}

function issueRecordFromNode(node: Record<string, unknown>): Record<string, unknown> {
  return {
    ...node,
    // Why: mapIssueWorkItem 按小写 'closed' 判定；GraphQL IssueState 是大写枚举。
    state: typeof node.state === 'string' ? node.state.toLowerCase() : node.state,
    labels: nodesArray(node.labels),
    assignees: nodesArray(node.assignees)
  }
}

function prRecordFromNode(node: Record<string, unknown>): Record<string, unknown> {
  return {
    ...node,
    labels: nodesArray(node.labels),
    assignees: nodesArray(node.assignees),
    // usersFromUnknown/latestReviewsFromUnknown 认 gh --json 键名与嵌套形状。
    reviewRequests: nodesArray(node.reviewRequests),
    latestReviews: nodesArray(node.latestOpinionatedReviews)
  }
}

/**
 * 批量读一组编号的工作项行（#436 伴飞裁定 CF-6b，任务屏范围装载用）：每仓一次
 * `gh api graphql` 双别名展开（issue+pullRequest），消灭「issue 空探→pr view→
 * merge-metadata」的逐条三调用链；映射复用单条链同一 mapIssueWorkItem/
 * mapPullRequestWorkItem（不写第二套 mapper）。编号在 GraphQL 双别名都未命中
 * （转移/占号）不进 items——调用方回落既有单条读，missing 语义不变。
 * 平台侧读取：只需 owner/repo 与本机 gh 登录态（gh:issueStates 同口径）；
 * 查询失败是返回值不是异常，调用方如实回落或呈现。
 */
export async function getWorkItemsBatch(input: {
  host?: string | null
  owner: string
  repo: string
  numbers: number[]
}): Promise<WorkItemsBatchResult> {
  const { host, owner, repo, numbers } = input
  if (!SAFE_NAME.test(owner) || !SAFE_NAME.test(repo) || (host && !SAFE_NAME.test(host))) {
    return { items: [], error: '仓库身份含非法字符，拒绝查询' }
  }
  if (numbers.length === 0 || !numbers.every((n) => Number.isInteger(n) && n > 0)) {
    return { items: [], error: '编号列表非法（须为正整数）' }
  }
  if (numbers.length > MAX_NUMBERS_PER_CALL) {
    return {
      items: [],
      error: `任务数 ${numbers.length} 超单次读取上限（${MAX_NUMBERS_PER_CALL}），请拆分读取`
    }
  }
  const ownerRepo: GitHubOwnerRepo = {
    owner,
    repo,
    ...(host && host !== 'github.com' ? { host } : {})
  }
  await acquire()
  try {
    const items: WorkItemsBatchEntry[] = []
    for (let start = 0; start < numbers.length; start += NUMBERS_PER_QUERY) {
      const chunk = numbers.slice(start, start + NUMBERS_PER_QUERY)
      const query = buildWorkItemsBatchQuery(owner, repo, chunk)
      const { stdout } = await ghExecFileAsync([
        'api',
        ...(host && host !== 'github.com' ? ['--hostname', host] : []),
        'graphql',
        '-f',
        `query=${query}`
      ])
      const data = JSON.parse(stdout) as {
        data?: {
          repository?: Record<string, Record<string, unknown> | null> | null
        }
        errors?: { message?: string }[]
      }
      const repository = data.data?.repository
      if (!repository) {
        const reason = data.errors
          ?.map((e) => e.message)
          .filter(Boolean)
          .join('; ')
        return { items: [], error: reason || 'GraphQL 未返回仓库数据（不存在或无权限）' }
      }
      for (const number of chunk) {
        // issue 优先=单条读回 dispatch 的探测顺序（REST issues 端点会返回 PR、
        // 被 pull_request 键拒掉后再试 PR）；GraphQL 两别名互斥，直判即可。
        const issueNode = repository[`i${number}`]
        if (issueNode) {
          items.push(mapIssueWorkItem(issueRecordFromNode(issueNode)))
          continue
        }
        const prNode = repository[`p${number}`]
        if (prNode) {
          items.push(mapPullRequestWorkItem(prRecordFromNode(prNode), ownerRepo))
        }
      }
    }
    return { items }
  } catch (err) {
    return { items: [], error: err instanceof Error ? err.message : String(err) }
  } finally {
    release()
  }
}
