import { codehubApi } from '@/lib/codehub-api'
import type { Repo } from '../../../shared/repo-types'
import type { CycleScope, CycleTaskReference } from './version-cycle/ports'
import { codehubStateOf, resolveReferenceRepo, viewCodeHubTaskByIid } from './task-port'
import { issueStateKey, type WallTaskState } from './wall-card-readings'

/**
 * CodeHub 计划任务状态读回（spec「墙卡读数」承诺进展行）：复用任务屏同一
 * 解析与读取语义——resolveReferenceRepo 身份匹配注册行、viewCodeHubTaskByIid
 * 先 Issue 后 MR。codehub-cli 无批量状态接口，每任务 1–2 次 viewTask
 * （MR 型任务 Issue 读取失败后再读 MR，最坏 2 次；成本如实记入 spec 与
 * refreshWall 注释）；任一任务读不到即抛错，由调用方整行
 * Unknown（全有或全无，不拼半真数字）。merged 与 closed 同为关闭态
 * （口径：关闭即完成，关闭原因不参与计数，spec 取舍 9）。
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
      const { detail } = await viewCodeHubTaskByIid(
        { viewCodeHubTask: codehubApi.viewTask },
        repo,
        task.number
      )
      const state: WallTaskState = {
        state: codehubStateOf(detail.state) === 'opened' ? 'OPEN' : 'CLOSED'
      }
      return [issueStateKey(task.repository, task.number), state] as const
    })
  )
  return new Map(entries)
}
