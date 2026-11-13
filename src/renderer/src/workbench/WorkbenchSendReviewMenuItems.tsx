import React, { useEffect, useMemo, useState } from 'react'
import { ReviewSendMenuItem } from './pr-review-notifications/ReviewSendMenuItem'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import {
  getGitHubRuntimeRepoId,
  getGitHubSourceRuntimeTarget
} from '@/lib/github-source-runtime-context'
import { normalizeGitHubPRForBranchOutcome } from '../../../shared/github/pull-request-for-branch-outcome'
import type { PRRefreshOutcome } from '../../../shared/github/pull-request-refresh-types'
import type { PRInfo } from '../../../shared/github/pull-request-types'
import { useAppStore } from '@/store'
import { parseGitHubIssueOrPRLink } from '../../../shared/github/links'
import { lookupGitHubWorkItemByOwnerRepoForSource } from '@/lib/github-work-item-source-lookup'
import {
  createRepoRowExecutionHostLookup,
  resolveWorktreeExecutionHost
} from '../../../shared/worktree-execution-host-resolution'
import { githubRepoIdentityKey } from '../../../shared/github/repository-identity-key'
import type { Repo } from '../../../shared/repo-types'
import type { Worktree } from '../../../shared/worktree/types'
import {
  reviewRepoIdentity,
  type ReviewRepoIdentity
} from '../../../shared/workbench/pr-review-request'
import { requireSourceContext } from './task-reference-repo'
import { isWorkbenchShell } from './is-workbench-shell'
import { openReviewSendDialog } from './pr-review-notifications/send-dialog-store'
import { isCodeHubGitRemote } from '../../../shared/codehub'
import { worktreeActivationHostOpts } from './worktree-activation-host-opts'
import { resolveCodeHubReviewTarget } from './pr-review-notifications/codehub-review'

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

type ReviewWorktreeRef = Pick<Worktree, 'branch' | 'head' | 'linkedPR' | 'linkedWorkItem'>

function reviewIdentityFromPrUrl(url: string): ReviewRepoIdentity {
  const link = parseGitHubIssueOrPRLink(url)
  if (!link || link.type !== 'pr' || !link.slug.host) {
    throw new Error('无法从 PR 链接确认评审仓库')
  }
  return { host: link.slug.host, path: `${link.slug.owner}/${link.slug.repo}` }
}

async function resolveReviewTarget(repo: Repo, worktree: ReviewWorktreeRef): Promise<TargetState> {
  const identity = reviewRepoIdentity(repo)
  if (!identity) {
    return { status: 'blocked', reason: '该工作树没有可识别的远端' }
  }
  const branch = worktree.branch.replace(/^refs\/heads\//, '')
  if (isCodeHubGitRemote(repo.gitRemoteIdentity)) {
    try {
      const target = await resolveCodeHubReviewTarget(repo, branch, worktree.linkedPR)
      return target
        ? { status: 'ready', target }
        : { status: 'blocked', reason: '分支没有关联的开放 MR' }
    } catch (error) {
      return { status: 'blocked', reason: error instanceof Error ? error.message : String(error) }
    }
  }
  try {
    const sourceContext = requireSourceContext(repo, 'github')
    const linked = worktree.linkedWorkItem
    if (linked?.provider === 'github' && linked.type === 'pr' && linked.url) {
      const link = parseGitHubIssueOrPRLink(linked.url)
      if (!link || link.type !== 'pr' || link.number !== linked.number) {
        return { status: 'blocked', reason: '无法确认关联 PR 的仓库和编号' }
      }
      const item = await lookupGitHubWorkItemByOwnerRepoForSource({
        repoPath: repo.path,
        repoId: repo.id,
        sourceContext,
        ...link.slug,
        number: link.number,
        type: 'pr'
      })
      const actual = item && parseGitHubIssueOrPRLink(item.url)
      if (
        !item ||
        actual?.type !== 'pr' ||
        actual.number !== link.number ||
        githubRepoIdentityKey(actual.slug) !== githubRepoIdentityKey(link.slug)
      ) {
        return { status: 'blocked', reason: '无法读取已关联的 PR' }
      }
      if (item.state === 'merged' || item.state === 'closed') {
        return { status: 'blocked', reason: item.state === 'merged' ? 'PR 已合入' : 'PR 已关闭' }
      }
      return {
        status: 'ready',
        target: {
          repo: reviewIdentityFromPrUrl(item.url),
          prNumber: item.number,
          title: item.title,
          sourceBranch: item.branchName ?? branch,
          targetBranch: item.baseRefName ?? '未知'
        }
      }
    }
    const outcome = normalizeGitHubPRForBranchOutcome(
      await callRuntimeRpc<PRRefreshOutcome | PRInfo | null>(
        getGitHubSourceRuntimeTarget(sourceContext),
        'github.prForBranch',
        {
          repo: getGitHubRuntimeRepoId(sourceContext, repo.id),
          branch,
          fallbackPRNumber: null,
          acceptMergedFallbackPR: false,
          currentHeadOid: worktree.head
        },
        { timeoutMs: 30_000 }
      )
    )
    if (outcome.kind === 'upstream-error') {
      throw new Error(outcome.message)
    }
    const pr = outcome.kind === 'found' ? outcome.pr : null
    if (!pr) {
      return { status: 'blocked', reason: '分支没有关联的开放 PR' }
    }
    if (worktree.linkedPR && worktree.linkedPR !== pr.number) {
      return { status: 'blocked', reason: '分支的 PR 与工作树记录的编号不一致' }
    }
    if (pr.state === 'merged') {
      return { status: 'blocked', reason: 'PR 已合入' }
    }
    if (pr.state === 'closed') {
      return { status: 'blocked', reason: 'PR 已关闭' }
    }
    return {
      status: 'ready',
      target: {
        repo: reviewIdentityFromPrUrl(pr.url),
        prNumber: pr.number,
        title: pr.title,
        sourceBranch: pr.headRefName ?? branch,
        targetBranch: pr.baseRefName ?? '未知'
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
  const executionHostId = worktreeActivationHostOpts(worktree)?.executionHostId
  const repos = useAppStore((state) => state.repos)
  const repo = useMemo(() => {
    const owner = resolveWorktreeExecutionHost(createRepoRowExecutionHostLookup(repos), {
      repoId: worktree.repoId,
      hostId: executionHostId
    })
    return owner.kind === 'resolved' ? owner.owner : null
  }, [repos, worktree.repoId, executionHostId])
  const [targetState, setTargetState] = useState<TargetState>({ status: 'checking' })
  const worktreeBranch = worktree.branch
  const worktreeHead = worktree.head
  const linkedPR = worktree.linkedPR
  const linkedWorkItem = worktree.linkedWorkItem

  useEffect(() => {
    let cancelled = false
    if (!repo) {
      setTargetState({ status: 'blocked', reason: '本机没有接入该项目' })
      return
    }
    setTargetState({ status: 'checking' })
    resolveReviewTarget(repo, {
      branch: worktreeBranch,
      head: worktreeHead,
      linkedPR,
      linkedWorkItem
    })
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
  }, [repo, worktreeBranch, worktreeHead, linkedPR, linkedWorkItem])

  if (!isWorkbenchShell() || worktree.isMainWorktree || worktree.isArchived) {
    return null
  }

  function sendReview(): void {
    if (targetState.status !== 'ready') {
      return
    }
    openReviewSendDialog(targetState.target)
  }

  return (
    <ReviewSendMenuItem
      disabled={disabled || targetState.status !== 'ready'}
      reason={
        targetState.status === 'checking'
          ? '正在确认关联 PR…'
          : targetState.status === 'blocked'
            ? targetState.reason
            : undefined
      }
      onSend={sendReview}
    />
  )
}
