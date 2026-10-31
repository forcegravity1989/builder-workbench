import { frozenMilestoneProblems } from '../../shared/workbench/milestone-freeze'
import type { RuntimeWorktreeListResult } from '../../shared/runtime-worktree-contracts'
import {
  milestoneGoalProblems,
  type MilestoneSubmit
} from '../../shared/workbench/project-milestones'
import { readMilestoneSnapshot } from './milestone-snapshot'

export type MilestoneStartedRuntime = {
  listManagedWorktrees(repo: string, limit: number): Promise<RuntimeWorktreeListResult>
}

export async function readMilestoneStarted(runtime: MilestoneStartedRuntime, repoId: string) {
  const result = await runtime.listManagedWorktrees(`id:${repoId}`, 10_000)
  if (result.truncated || result.totalCount > result.worktrees.length) {
    throw new Error('版本开工信息未完整读取，请刷新后重试；不会按未开始版本提交')
  }
  return new Set(
    result.worktrees.flatMap((t) =>
      t.workbenchVersionBinding ? [t.workbenchVersionBinding.version] : []
    )
  )
}

export async function recheckMilestoneStarted(
  runtime: MilestoneStartedRuntime,
  repo: { id: string; path: string },
  head: string,
  options: { wslDistro?: string },
  input: MilestoneSubmit
) {
  const active = await readMilestoneStarted(runtime, repo.id)
  const fresh = await readMilestoneSnapshot(repo.path, head, options, active)
  if (fresh.snapshot.problems.length) {
    throw new Error('版本开工材料未能完整核对；草案保留，没有写入文件')
  }
  const frozen = [
    ...frozenMilestoneProblems(fresh.snapshot, input, active),
    ...milestoneGoalProblems(input, fresh.snapshot.versions)
  ]
  if (frozen.length) {
    throw new Error(`${frozen.join('；')}；草案保留，没有写入文件`)
  }
  for (const next of input.versions) {
    const old = fresh.plans.get(next.cycleId)
    if (
      (!old || old.version !== next.version) &&
      (active.has(next.version) || (old && active.has(old.version)))
    ) {
      throw new Error('版本刚开始计划，请重新核对身份；没有写入文件')
    }
  }
}
