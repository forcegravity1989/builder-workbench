import { useAppStore } from '@/store'
import type { ExecutionHostId } from '../../../shared/execution-host'
import type { WorkbenchCreationContext } from '../../../shared/workbench/creation-context'
import { findGoalParentSuggestion } from './scoped-task-workspace'
import { prefetchWorkspaceCreateBase } from './workspace-create-prefetch'

/**
 * 目标开工动作（G2 P4③，P3a 侧栏目标「···」菜单以事件驱动接线）：复用同一
 * 原生创建器，带入名称、归属与父级建议，不伪造目标 Issue、
 * 不绕过弹窗直接创建树、不新增 BW 多步骤向导。唯一合法的同项目同宿主目标树
 * 在原生父级选择器预选，可改可取消；repo/host 变更由创建器清除旧建议。
 * 事件入口 openGoalStartComposer 为单实现。
 */

type GoalStartTarget = {
  goalId: string
  /** 展示序号（如「G2」）；名称建议用展示名，业务身份只认 goalId。 */
  label: string
  title: string
}

type GoalStartHome = {
  repoId: string
  projectId?: string | null
  hostId: ExecutionHostId
  runtimeOwnerEnvironmentId?: string | null
}

/**
 * 目标开工（普通函数形态，事件驱动入口用）：同一原生创建器 + BW 预填。
 * home 缺失（项目工作区未就绪）时如实不动作。
 */
export function openGoalStartComposer(args: {
  version: string
  goal: GoalStartTarget
  home: GoalStartHome | null
}): void {
  const { version, goal, home } = args
  if (!home) {
    return
  }
  const workbenchCreation: WorkbenchCreationContext = {
    version,
    workflow: 'goal',
    goalId: goal.goalId,
    repoId: home.repoId
  }
  const initialParentWorktreeId = findGoalParentSuggestion({
    version,
    goalId: goal.goalId,
    worktrees: useAppStore.getState().allWorktrees(),
    home
  })
  // CF-6c：进创建器前预热 base fetch 与 gh 用户名缓存（fire-and-forget）。
  prefetchWorkspaceCreateBase(home.repoId)
  useAppStore.getState().openModal('new-workspace-composer', {
    prefilledName: `${version}-${goal.label}`,
    initialRepoId: home.repoId,
    ...(initialParentWorktreeId ? { initialParentWorktreeId } : {}),
    workbenchCreation,
    enableIssueAutomation: false,
    telemetrySource: 'sidebar'
  })
}
