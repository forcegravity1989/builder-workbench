/**
 * worktree 右键「发送评审」两入口（pr-review-notify）：
 * 方案一「发送评审」——拼评审消息经窗口事件预填进群聊面板并自动展开，
 * 发送仍由人点发送按钮；方案二「发送评审通知」——同一 PR 定位，负载经
 * main POST 到配置的接收方端点，对方弹原生通知。
 * PR 定位与侧边栏「已链接 PR」徽标同口径——优先 Orca 持久关联 linkedPR，
 * 缺失时按分支查 GitHub 开着的 PR（徽标显示的关联常来自这条分支推导，
 * 不能显示已链接却置灰）。
 */
import React, { useEffect, useState } from 'react'
import { BellRing, Send } from 'lucide-react'
import { toast } from 'sonner'
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { useRepoById } from '@/store/selectors'
import { useAppStore } from '@/store'
import { lookupGitHubWorkItemForSource } from '@/lib/github-work-item-source-lookup'
import type { Repo } from '../../../shared/repo-types'
import type { Worktree } from '../../../shared/worktree/types'
import { buildReviewMessage } from '../../../shared/workbench/pr-review-message'
import { readProjectCharter } from './project-charter'
import { isWorkbenchShell } from './is-workbench-shell'
import { requireSourceContext } from './task-reference-repo'
import { PROJECT_CHAT_COMPOSE_EVENT } from './chat/use-project-chat'

/** canonicalKey（github.com/owner/name）→ owner/name；无远端身份时返回 null。 */
function ownerRepoFromRepo(
  canonicalKey: string | undefined,
  remoteUrl: string | undefined
): string | null {
  const source = canonicalKey ?? remoteUrl
  if (!source) {
    return null
  }
  const match = source.match(/github\.com\/([^/\s]+)\/([^/\s]+)/)
  return match ? `${match[1]}/${match[2]}` : null
}

/** PR 定位（两入口共用）：linkedPR 优先，缺失按分支补查；查不到返回 null 由调用方如实提示。 */
async function resolveReviewTarget(
  repo: Repo,
  worktree: Worktree
): Promise<{ prNumber: number; title: string } | null> {
  // git worktree 的 branch 形如 refs/heads/<name>；消息里只要短名。
  const branch = worktree.branch.replace(/^refs\/heads\//, '')
  let prNumber = worktree.linkedPR
  let title: string | null = null
  if (!prNumber) {
    // linkedPR 持久字段可空而徽标仍显示分支推导的关联；点击时按分支补查，
    // currentHeadOid 锚定当前头，防旧 merged PR 误配（同徽标的 head 门）。
    const pr = await window.api.gh.prForBranch({
      repoPath: repo.path,
      repoId: repo.id,
      branch,
      linkedPRNumber: null,
      fallbackPRNumber: null,
      acceptMergedFallbackPR: false,
      currentHeadOid: worktree.head
    })
    if (!pr) {
      return null
    }
    prNumber = pr.number
    title = pr.title
  }
  if (!title) {
    const sourceContext = requireSourceContext(repo, 'github')
    const item = await lookupGitHubWorkItemForSource({
      repoPath: repo.path,
      repoId: repo.id,
      sourceContext,
      number: prNumber,
      type: 'pr'
    })
    // Why: 标题只作展示，接收侧解析键在「链接：」行——查不到标题不否定 PR 存在，
    // 用占位继续，避免误报「没有关联 PR」。
    title = item?.title ?? '（标题获取失败）'
  }
  return { prNumber, title }
}

export function WorkbenchSendReviewMenuItems({
  worktree,
  disabled
}: {
  worktree: Worktree
  disabled: boolean
}): React.JSX.Element | null {
  const repo = useRepoById(worktree.repoId)
  const activeRepoId = useAppStore((s) => s.activeRepoId ?? s.repos[0]?.id ?? null)
  const [chatConfigured, setChatConfigured] = useState(false)
  const repoPath = repo?.path
  const repoConnectionId = repo?.connectionId
  // [chat] 配置决定「发送评审」能否落地：无配置时群聊面板不存在，预填事件
  // 无人接收会静默失效（spec N01）。菜单挂载时异步读回，未就绪先按未配置置灰。
  useEffect(() => {
    let cancelled = false
    if (!repoPath) {
      setChatConfigured(false)
      return
    }
    readProjectCharter(repoPath, repoConnectionId)
      .then((result) => {
        if (!cancelled) {
          setChatConfigured(result.charter?.chat != null)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setChatConfigured(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [repoPath, repoConnectionId])
  if (!isWorkbenchShell() || worktree.isMainWorktree || worktree.isArchived) {
    return null
  }
  const ownerRepo = ownerRepoFromRepo(
    repo?.gitRemoteIdentity?.canonicalKey,
    repo?.gitRemoteIdentity?.remoteUrl
  )

  async function sendReview(): Promise<void> {
    if (!repo || !ownerRepo) {
      return
    }
    const branch = worktree.branch.replace(/^refs\/heads\//, '')
    try {
      const target = await resolveReviewTarget(repo, worktree)
      if (!target) {
        toast.error(`分支 ${branch} 没有关联 PR，无法拼装评审消息`)
        return
      }
      const text = buildReviewMessage({ repo: ownerRepo, ...target })
      window.dispatchEvent(new CustomEvent(PROJECT_CHAT_COMPOSE_EVENT, { detail: { text } }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  async function sendReviewNotification(): Promise<void> {
    if (!repo || !ownerRepo) {
      return
    }
    try {
      const target = await resolveReviewTarget(repo, worktree)
      if (!target) {
        toast.error(
          `分支 ${worktree.branch.replace(/^refs\/heads\//, '')} 没有关联 PR，无法发送评审通知`
        )
        return
      }
      const result = await window.api.bwReview.sendReviewRequest({ repo: ownerRepo, ...target })
      const failed = result.results.filter((entry) => !entry.ok)
      if (failed.length === 0) {
        toast.success(`评审请求已投递到 ${result.results.length} 个接收方`)
        return
      }
      // Why: 部分失败/全失败如实列出每个接收方的结果，不装成功。
      const lines = failed.map(
        (entry) =>
          `${entry.name || `${entry.host}:${entry.port}`}: ${entry.error ?? `HTTP ${entry.status}`}`
      )
      toast.error(`评审通知投递失败\n${lines.join('\n')}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <>
      <DropdownMenuSeparator />
      {/* Why 置灰：预填事件由活跃项目的群聊面板接收——worktree 属其他项目会错投
          到当前项目的群；未配置 [chat] 时面板不存在、事件无人接。通知走 HTTP 不受限。 */}
      <DropdownMenuItem
        disabled={disabled || !ownerRepo || worktree.repoId !== activeRepoId || !chatConfigured}
        onSelect={() => void sendReview()}
      >
        <Send className="size-3.5" />
        发送评审
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={disabled || !ownerRepo}
        onSelect={() => void sendReviewNotification()}
      >
        <BellRing className="size-3.5" />
        发送评审通知
      </DropdownMenuItem>
    </>
  )
}
