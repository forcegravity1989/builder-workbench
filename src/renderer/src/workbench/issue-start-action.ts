import { useAppStore } from '@/store'
import { getLinkedWorkItemSuggestedName } from '../../../shared/workspace-name'
import type { WorkbenchCreationContext } from '../../../shared/workbench/creation-context'
import {
  findVersionTaskWorktrees,
  findGoalParentSuggestion,
  notifyScopedWorkspaceUnavailable
} from './scoped-task-workspace'
import { openWorkbenchWorkspaceChoice } from './version-workspace-choice-state'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import type { CycleTaskSnapshot } from './version-cycle/ports'

/**
 * Issue 开工/打开（G2 P3b，计划板 Issue 行开工箭头的永久 hookup）：与任务屏
 * 范围行调用同一个统一 Start/Open 解析核——归属只认绑定 (version, issue,
 * taskSource) ＋原生 linked 双重证明；唯一 → 直开、多候选 → BW 选择器（绝不
 * 取第一棵）、无 → 同一原生创建器（BW 预填可见可改，绑定在真实创建结果处写入）。
 * 版本未知或 provider 不在开工面（读回仅 github/codehub 就绪）时返回 false，
 * 调用方回落原生任务详情（临时语义），不猜版本、不另造创建路径。
 */
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
  if (candidates.length === 1) {
    const only = candidates[0]
    if (!only || activateAndRevealWorktree(only.id) === false) {
      notifyScopedWorkspaceUnavailable()
    }
    return true
  }
  if (candidates.length > 1) {
    openWorkbenchWorkspaceChoice({
      title: `#${task.iid} ${task.title}`,
      candidates
    })
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
    prefilledName: getLinkedWorkItemSuggestedName({ title: task.title }),
    initialRepoId: repoId,
    enableIssueAutomation: true,
    telemetrySource: 'sidebar',
    workbenchCreation,
    ...(suggested ? { initialParentWorktreeId: suggested } : {})
  })
  return true
}
