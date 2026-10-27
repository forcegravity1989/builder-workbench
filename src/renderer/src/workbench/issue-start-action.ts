import { useAppStore } from '@/store'
import { getLinkedWorkItemWorkspaceName } from '../../../shared/workspace-name'
import type { WorkbenchCreationContext } from '../../../shared/workbench/creation-context'
import {
  findVersionTaskWorktrees,
  findGoalParentSuggestion,
  notifyScopedWorkspaceUnavailable
} from './scoped-task-workspace'
import { dispatchScopedWorktrees } from './version-workspace-choice-state'
import { prefetchWorkspaceCreateBase } from './workspace-create-prefetch'
import type { CycleTaskSnapshot } from './version-cycle/ports'

/**
 * Issue 开工/打开（G2 P3b，计划板 Issue 行开工箭头的永久 hookup）：与任务屏
 * 范围行调用同一个统一 Start/Open 解析核——归属只认绑定 (version, issue,
 * taskSource) ＋原生 linked 双重证明；唯一 → 直开、多候选 → BW 选择器（绝不
 * 取第一棵）、无 → 同一原生创建器（BW 预填可见可改，绑定在真实创建结果处写入）。
 * 版本未知或 provider 不在开工面（读回仅 github/codehub 就绪）时返回 false，
 * 调用方回落原生任务详情，不猜版本、不另造创建路径。
 */

/**
 * 与原生创建器使用同一个自动种子；中文标题仍保留 Issue 编号，用户修改后
 * 才按显式名称处理。展示标题由原生关联信息提供，不使用分支 slug。
 */
function issuePrefilledName(provider: 'github' | 'codehub', number: number, title: string): string {
  return (
    getLinkedWorkItemWorkspaceName({ type: 'issue', provider, number, title })?.seedName ??
    `issue-${number}`
  )
}

export function openIssueWorkspaceOrStart(args: {
  task: CycleTaskSnapshot
  version: string | null
}): boolean {
  const { task, version } = args
  const provider = task.reference.provider
  if (!version || (provider !== 'github' && provider !== 'codehub')) {
    return false
  }
  const repoId = task.source.repoId ?? task.source.projectId
  if (!repoId) {
    return false
  }
  const worktrees = useAppStore.getState().allWorktrees()
  const candidates = findVersionTaskWorktrees(worktrees, {
    version,
    number: task.iid,
    source: task.source,
    provider,
    repoId
  })
  const outcome = dispatchScopedWorktrees({
    candidates,
    choiceTitle: `#${task.iid} ${task.title}`,
    onUnavailable: notifyScopedWorkspaceUnavailable
  })
  if (outcome !== 'none') {
    return true
  }
  const goalId = task.reference.goalId
  const workbenchCreation: WorkbenchCreationContext = {
    version,
    workflow: 'issue',
    ...(goalId ? { goalId } : {}),
    repoId
  }
  const suggested = goalId
    ? findGoalParentSuggestion({
        version,
        goalId,
        worktrees,
        home: { repoId, hostId: task.source.hostId }
      })
    : undefined
  // CF-6c：进创建器前预热 base fetch 与 gh 用户名缓存（fire-and-forget）。
  prefetchWorkspaceCreateBase(repoId)
  useAppStore.getState().openModal('new-workspace-composer', {
    linkedWorkItem: {
      provider,
      type: 'issue',
      number: task.iid,
      title: task.title,
      url: task.url,
      repoId
    },
    taskSourceContext: task.source,
    prefilledName: issuePrefilledName(provider, task.iid, task.title),
    initialRepoId: repoId,
    enableIssueAutomation: true,
    telemetrySource: 'sidebar',
    workbenchCreation,
    ...(suggested ? { initialParentWorktreeId: suggested } : {})
  })
  return true
}
