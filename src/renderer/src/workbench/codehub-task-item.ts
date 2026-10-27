import { parseCodeHubRemote } from '../../../shared/codehub'
import type { CodeHubTaskDetail, CodeHubTaskItem } from '../../../shared/codehub-tasks'
import type { Repo } from '../../../shared/repo-types'

/**
 * CodeHub 行形态映射（BW 单实现）：任务屏范围装载（P4）、task-port 详情打开与
 * 墙卡读数共用同一状态归一与行映射，不另造第二种 CodeHub 行形态。
 */

/** 墙卡承诺进展复用同一状态归一（closed/merged 均为关闭态），不另造映射。 */
export function codehubStateOf(state: string): CodeHubTaskItem['state'] {
  const raw = state.toLowerCase()
  return raw === 'merged' ? 'merged' : raw === 'closed' ? 'closed' : 'opened'
}

/** Same web-URL shape main/codehub/work-items.ts itemUrl falls back to; only used when the CLI omits the link. */
export function codehubWebUrl(repo: Repo, kind: 'issue' | 'mr', iid: number): string | null {
  const remote =
    parseCodeHubRemote(repo.gitRemoteIdentity?.remoteUrl) ??
    parseCodeHubRemote(repo.gitRemoteIdentity?.canonicalKey)
  if (!remote) {
    return null
  }
  const project = remote.project
    .split('/')
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join('/')
  return `https://${remote.host}/${project}/-/${kind === 'mr' ? 'merge_requests' : 'issues'}/${iid}`
}

/** CodeHub 详情 → 原生任务列表行。URL 依次取详情自带、调用方回退、web 形态
 *  推导；全缺时留空由调用方如实处置。 */
export function codeHubTaskItemFromDetail(args: {
  detail: CodeHubTaskDetail
  kind: 'issue' | 'mr'
  repo: Repo
  fallbackUrl?: string | null
}): CodeHubTaskItem {
  const { detail, kind, repo, fallbackUrl } = args
  const remote =
    parseCodeHubRemote(repo.gitRemoteIdentity?.remoteUrl) ??
    parseCodeHubRemote(repo.gitRemoteIdentity?.canonicalKey)
  return {
    type: kind,
    iid: detail.iid,
    title: detail.title,
    state: codehubStateOf(detail.state),
    url: detail.url ?? fallbackUrl ?? codehubWebUrl(repo, kind, detail.iid) ?? '',
    author: detail.author,
    assignees: detail.assignees,
    reviewers: detail.reviewers,
    labels: detail.labels,
    sourceBranch: detail.sourceBranch,
    targetBranch: detail.targetBranch,
    // Why: viewTask carries no updated timestamp; leave empty rather than pass readAt off as one.
    updatedAt: '',
    repoId: repo.id,
    repoPath: repo.path,
    ...(remote ? { host: remote.host, project: remote.project } : {})
  }
}
