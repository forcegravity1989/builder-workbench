/**
 * 工作树右键「发送评审」（pr-review-notify）：只有能定位到开放 PR 时可用，
 * 置灰时在菜单项上说明原因。点击即发送，不再要求打开面板或二次确认。
 * PR 定位与侧栏「已链接 PR」同口径——linkedPR 优先，缺失按分支补查。
 */
import React, { useEffect, useState } from 'react'
import { Send } from 'lucide-react'
import { toast } from 'sonner'
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { useRepoById } from '@/store/selectors'
import { lookupGitHubWorkItemForSource } from '@/lib/github-work-item-source-lookup'
import type { Repo } from '../../../shared/repo-types'
import type { Worktree } from '../../../shared/worktree/types'
import type { ReviewRepoIdentity } from '../../../shared/workbench/pr-review-request'
import { requireSourceContext } from './task-reference-repo'
import { isWorkbenchShell } from './is-workbench-shell'
import { nextReviewRound, sendReviewRequest } from './pr-review-notifications/store'

type ReviewTarget = {
  repo: ReviewRepoIdentity
  prNumber: number
  title: string
  sourceBranch: string
  targetBranch: string
}

type TargetState =
  | { status: 'checking' }
  | { status: 'ready'; target: ReviewTarget }
  | { status: 'blocked'; reason: string }

/** canonicalKey（github.com/owner/name）→ 仓库身份；无 GitHub 远端时返回 null。 */
function reviewRepoIdentity(repo: Repo): ReviewRepoIdentity | null {
  const source = repo.gitRemoteIdentity?.canonicalKey ?? repo.gitRemoteIdentity?.remoteUrl
  if (!source) {
    return null
  }
  const match = source.match(/github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?$/)
  return match ? { owner: match[1]!, name: match[2]! } : null
}

type ReviewWorktreeRef = Pick<Worktree, 'branch' | 'head' | 'linkedPR'>

async function resolveReviewTarget(repo: Repo, worktree: ReviewWorktreeRef): Promise<TargetState> {
  const identity = reviewRepoIdentity(repo)
  if (!identity) {
    return { status: 'blocked', reason: '该工作树没有 GitHub 远端' }
  }
  const branch = worktree.branch.replace(/^refs\/heads\//, '')
  // Why: 持久关联的 PR 优先按编号读状态，能区分「已合入/已关闭」与本分支
  // 没有开放 PR，菜单置灰原因才准确（spec N02）。
  if (worktree.linkedPR) {
    try {
      const item = await lookupGitHubWorkItemForSource({
        repoPath: repo.path,
        repoId: repo.id,
        sourceContext: requireSourceContext(repo, 'github'),
        number: worktree.linkedPR,
        type: 'pr'
      })
      if (item) {
        if (item.state === 'merged') {
          return { status: 'blocked', reason: 'PR 已合入' }
        }
        if (item.state === 'closed') {
          return { status: 'blocked', reason: 'PR 已关闭' }
        }
        return {
          status: 'ready',
          target: {
            repo: identity,
            prNumber: item.number,
            title: item.title,
            sourceBranch: item.branchName ?? branch,
            targetBranch: item.baseRefName ?? '未知'
          }
        }
      }
    } catch {
      // 读不到就退回按分支补查，由下方统一给出原因。
    }
  }
  try {
    const pr = await window.api.gh.prForBranch({
      repoPath: repo.path,
      repoId: repo.id,
      branch,
      linkedPRNumber: worktree.linkedPR ?? null,
      fallbackPRNumber: null,
      acceptMergedFallbackPR: false,
      currentHeadOid: worktree.head
    })
    if (!pr) {
      return { status: 'blocked', reason: '分支没有关联的开放 PR' }
    }
    if (pr.state === 'merged') {
      return { status: 'blocked', reason: 'PR 已合入' }
    }
    if (pr.state === 'closed') {
      return { status: 'blocked', reason: 'PR 已关闭' }
    }
    let baseRefName = pr.baseRefName
    if (!baseRefName) {
      try {
        const item = await lookupGitHubWorkItemForSource({
          repoPath: repo.path,
          repoId: repo.id,
          sourceContext: requireSourceContext(repo, 'github'),
          number: pr.number,
          type: 'pr'
        })
        baseRefName = item?.baseRefName
      } catch {
        // 目标分支只作展示；读不到不否定 PR 存在。
      }
    }
    return {
      status: 'ready',
      target: {
        repo: identity,
        prNumber: pr.number,
        title: pr.title,
        sourceBranch: pr.headRefName ?? branch,
        targetBranch: baseRefName ?? '未知'
      }
    }
  } catch (error) {
    return {
      status: 'blocked',
      reason: error instanceof Error ? error.message : '暂时无法确认关联 PR'
    }
  }
}

export function WorkbenchSendReviewMenuItems({
  worktree,
  disabled
}: {
  worktree: Worktree
  disabled: boolean
}): React.JSX.Element | null {
  const repo = useRepoById(worktree.repoId)
  const [targetState, setTargetState] = useState<TargetState>({ status: 'checking' })
  const repoPath = repo?.path
  const repoId = repo?.id
  const worktreeId = worktree.id
  const worktreeBranch = worktree.branch
  const worktreeHead = worktree.head
  const linkedPR = worktree.linkedPR

  useEffect(() => {
    let cancelled = false
    if (!repo) {
      setTargetState({ status: 'blocked', reason: '本机没有接入该项目' })
      return
    }
    setTargetState({ status: 'checking' })
    resolveReviewTarget(repo, { branch: worktreeBranch, head: worktreeHead, linkedPR })
      .then((result) => {
        if (!cancelled) {
          setTargetState(result)
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setTargetState({
            status: 'blocked',
            reason: error instanceof Error ? error.message : '暂时无法确认关联 PR'
          })
        }
      })
    return () => {
      cancelled = true
    }
    // Why: 菜单打开时只按工作树/仓库身份解析一次，避免每次渲染重复打 GitHub。
  }, [repo, repoPath, repoId, worktreeId, worktreeBranch, worktreeHead, linkedPR])

  if (!isWorkbenchShell() || worktree.isMainWorktree || worktree.isArchived) {
    return null
  }

  async function sendReview(): Promise<void> {
    if (targetState.status !== 'ready') {
      return
    }
    const { target } = targetState
    try {
      const round = nextReviewRound(target.repo, target.prNumber)
      await sendReviewRequest(
        {
          repo: target.repo,
          prNumber: target.prNumber,
          title: target.title,
          sourceBranch: target.sourceBranch,
          targetBranch: target.targetBranch,
          round
        },
        round
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        disabled={disabled || targetState.status !== 'ready'}
        onSelect={() => void sendReview()}
      >
        <Send className="size-3.5" />
        {targetState.status === 'ready'
          ? '发送评审'
          : targetState.status === 'checking'
            ? '发送评审（正在确认关联 PR…）'
            : `发送评审（${targetState.reason}）`}
      </DropdownMenuItem>
    </>
  )
}
