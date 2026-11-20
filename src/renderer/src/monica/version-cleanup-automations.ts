import {
  getAutomationAuthorityTarget,
  listAutomationsForTarget
} from '@/components/automations/automation-host-client'
import type { Automation } from '../../../shared/automations-types'
import type { Worktree } from '../../../shared/worktree/types'
import { nativeWorkspaceScope } from './version-cycle/native-workspace'
import { cycleAutomationCreationKey } from './version-cycle/ensure-cycle-automation'

/**
 * 清理确认单的版本自动化探测（与 version-cleanup-dialog 同住，对话框只管渲染与
 * 勾选态）：返回本版已登记且仍启用的周期自动化，供对话框如实提示（是否停用由
 * 人在原生编辑器决定）。探测只影响提示条，不豁免原生删除预检，清理不改写
 * 自动化条目。
 * 身份精确匹配：creationKey 全键相等（scope+用途+版本全维度，P5 版本化身份）
 * ——曾按版本后缀匹配，会把其他项目同版本号条目计入本版；他宿主 runtime 的
 * 条目不跨机探测，属如实留白。探测失败/离线返回空集，不阻塞清理。
 */
export async function probeVersionAutomations(args: {
  version: string
  worktrees: readonly Worktree[]
  /** 清理确认单行；只用于派生探测键的项目维度（本版存活树的 repoId）。 */
  rows: readonly { tree: Worktree | null }[]
}): Promise<Automation[]> {
  const { version, worktrees, rows } = args
  try {
    // Why: home 行只用于派生探测键的项目/宿主维度；焦点在其他注册行时首条主树
    // 可能是别仓的行，探测键会落到错误项目——按本版行的 repoId 过滤后再回退。
    const targetRepoId = rows.find((row) => row.tree !== null)?.tree?.repoId ?? null
    const home =
      worktrees.find((tree) => tree.isMainWorktree && tree.repoId === targetRepoId) ??
      worktrees.find((tree) => tree.isMainWorktree) ??
      worktrees[0]
    if (!home) {
      return []
    }
    const scope = nativeWorkspaceScope(home)
    const keys = new Set([
      cycleAutomationCreationKey({ ...scope, workflow: 'plan' }, version),
      cycleAutomationCreationKey({ ...scope, workflow: 'acceptance' }, version)
    ])
    const automations = await listAutomationsForTarget(
      getAutomationAuthorityTarget({ kind: 'desktop' })
    )
    return automations.filter(
      (item) => item.enabled && typeof item.creationKey === 'string' && keys.has(item.creationKey)
    )
  } catch {
    // 探测失败不阻塞清理：对话框的静态语义行仍如实说明「不改写自动化条目」。
    return []
  }
}
