import type { CodeHubRemote } from '../../shared/codehub'
import { viewCodeHubTask } from './mutations'
import { runCodeHubCli, type CodeHubExecOptions } from './cli'
import { projectArgs } from './mutations'
import { readCodeHubBranchReview } from './mr-branch-review'

/** Open MR in the registered repository with both material branches matching. */
export async function openCodeHubMrForBranch(args: {
  remote: CodeHubRemote
  execOptions?: CodeHubExecOptions
  sourceBranch: string
  targetBranch: string
}): Promise<number | null> {
  const review = await readCodeHubBranchReview({ ...args, states: ['opened'] })
  return review?.number ?? null
}

/**
 * Create an MR for `sourceBranch`, adopting an already-open one instead of
 * failing (main create_mr_on_branch semantics). Target branch must be resolved
 * by the caller (CodeHub has no implicit default).
 */
export async function createCodeHubMr(args: {
  remote: CodeHubRemote
  execOptions?: CodeHubExecOptions
  sourceBranch: string
  targetBranch: string
  title: string
  description: string
}): Promise<{ iid: number; adopted: boolean; url: string | null }> {
  const existing = await readCodeHubBranchReview({ ...args, states: ['opened'] })
  if (existing !== null) {
    return { iid: existing.number, adopted: true, url: existing.url }
  }
  const stdout = await runCodeHubCli(
    [
      'mr',
      'create',
      ...projectArgs(args.remote),
      '--source-branch',
      args.sourceBranch,
      '--target-branch',
      args.targetBranch,
      '--title',
      args.title,
      '--description',
      args.description,
      '--jq',
      '.iid'
    ],
    args.execOptions
  )
  const text = stdout.trim()
  const iid = Number(text)
  if (!Number.isSafeInteger(iid) || iid <= 0) {
    throw new Error(`无法解析 codehub MR iid：${text || '(空输出)'}`)
  }
  const detail = await viewCodeHubTask({ ...args, kind: 'mr', iid })
  if (!detail.url?.trim()) {
    throw new Error('CodeHub MR 已创建，但详情未返回评审链接')
  }
  return { iid, adopted: false, url: detail.url }
}
