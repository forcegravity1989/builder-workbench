import { codehubApi } from '@/lib/codehub-api'
import type { Repo } from '../../../shared/repo-types'
import type { CycleScope, CycleTaskReference } from './version-cycle/ports'
import { codehubStateOf, resolveReferenceRepo } from './task-port'
import { issueStateKey, type WallTaskState } from './wall-card-readings'

/**
 * CodeHub 计划任务状态读回（spec「墙卡读数」承诺进展行）：注册行解析复用
 * 任务屏语义（resolveReferenceRepo 身份匹配），但**只读 Issue、不做 MR
 * 兜底**——计划任务正本是 Issue（issue-state.md），且 codehub-cli 的错误
 * 无法区分「不存在」与瞬时失败，兜底同号 MR（Issue/MR 是两套独立 iid
 * 序列，同号常见）会把别的对象状态静默计成本任务进展；墙卡只剩数字，
 * 错读不可见。读失败（含引用实为 MR）即抛错，由调用方整行 Unknown
 * （全有或全无，数字不猜对象）。codehub-cli 无批量状态接口，每任务一次
 * viewTask（成本如实记入 spec 与 refreshWall 注释）。merged 与 closed
 * 同为关闭态（口径：关闭即完成，关闭原因不参与计数，spec 取舍 9）。
 */
export async function readCodeHubTaskStates(
  tasks: readonly CycleTaskReference[],
  rows: readonly Repo[],
  scope: CycleScope
): Promise<Map<string, WallTaskState>> {
  const entries = await Promise.all(
    tasks.map(async (task) => {
      const repo = resolveReferenceRepo({ repos: () => rows }, scope, task)
      if (!repo) {
        throw new Error(`CodeHub 任务仓库未在项目内注册：${task.repository}`)
      }
      const detail = await codehubApi.viewTask({
        repoPath: repo.path,
        repoId: repo.id,
        kind: 'issue',
        iid: task.number
      })
      const state: WallTaskState = {
        state: codehubStateOf(detail.state) === 'opened' ? 'OPEN' : 'CLOSED'
      }
      return [issueStateKey(task.repository, task.number), state] as const
    })
  )
  return new Map(entries)
}
