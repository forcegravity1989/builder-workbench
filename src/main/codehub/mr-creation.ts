import type { CodeHubRemote } from '../../shared/codehub'
import { runCodeHubCli, type CodeHubExecOptions } from './cli'
import { projectArgs } from './mutations'

/** Open MR iid whose source branch is `sourceBranch`; null when none. */
export async function openCodeHubMrForBranch(args: {
  remote: CodeHubRemote
  execOptions?: CodeHubExecOptions
  sourceBranch: string
}): Promise<number | null> {
  const stdout = await runCodeHubCli(
    [
      'mr',
      'list',
      ...projectArgs(args.remote),
      '--source-branch',
      args.sourceBranch,
      '--state',
      'opened',
      '--jq',
      '.[0].iid'
    ],
    args.execOptions
  )
  const text = stdout.trim()
  if (!text || text === 'null') {
    return null
  }
  const iid = Number(text)
  return Number.isFinite(iid) ? iid : null
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
  const existing = await openCodeHubMrForBranch(args)
  if (existing !== null) {
    return { iid: existing, adopted: true, url: null }
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
  if (!Number.isFinite(iid)) {
    throw new Error(`无法解析 codehub MR iid：${text || '(空输出)'}`)
  }
  return { iid, adopted: false, url: null }
}

