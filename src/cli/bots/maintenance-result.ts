import type { PRSnapshotReply } from '../../shared/github/pull-requests/refresh/pull-request-refresh-types'
import type { RuntimeWorktreeRecord } from '../../shared/worktree/catalog/runtime-worktree-contracts'
import type { HandlerContext } from '../dispatch/dispatch'
import type { WorkerShowResult } from '../orchestration/workers/worker-view-results'
import type { BotItemShowView } from './bot-items-format'
import type { MaintenanceDispatch } from './maintenance-queue'

export async function deliverMaintenanceResult(
  { client }: HandlerContext,
  repo: string,
  caller: { callerSessionId?: string },
  pending: MaintenanceDispatch
) {
  if (!pending.dispatchId) {
    return undefined
  }
  const params = { ...caller, item: String(pending.item) }
  const {
    result: { item }
  } = await client.call<BotItemShowView>('bots.items.show', params)
  const worker = item.links.find(
    (link) =>
      link.kind === 'dispatch' &&
      (link.ref === pending.dispatchId || link.latest === pending.dispatchId)
  )
  const cached = worker?.kind === 'dispatch' && worker.pr?.shown ? worker.pr : undefined
  let pr: { url: string; state: string; checks: string | null } | undefined = cached
  if (!pr) {
    const { result: show } = await client.call<WorkerShowResult>('orchestration.workerShow', {
      dispatch: pending.dispatchId
    })
    const worktree = show.worker.worktreeId ?? show.projection?.workspace?.id
    if (!worktree) {
      return undefined
    }
    const tree = (
      await client.call<{ worktree: RuntimeWorktreeRecord }>('worktree.show', { worktree })
    ).result.worktree
    if (tree.repoId !== repo || !tree.git.branch) {
      return undefined
    }
    const branch = tree.git.branch.replace(/^refs\/heads\//, '')
    const { result } = await client.call<PRSnapshotReply>('github.prForBranch', {
      repo,
      branch,
      currentHeadOid: tree.git.head
    })
    if (
      !('kind' in result) ||
      result.kind !== 'found' ||
      result.pr.headRefName !== branch ||
      result.pr.headSha !== tree.git.head
    ) {
      return undefined
    }
    pr = { url: result.pr.url, state: result.pr.state, checks: result.pr.checksStatus }
  }
  await client.call('bots.items.link', { ...params, refs: [pr.url] })
  return pr
}
