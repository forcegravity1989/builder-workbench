import { useAppStore } from '@/store'
import type { ExecutionHostId } from '../../../shared/execution-host'
import type { WorkbenchCreationContext } from '../../../shared/workbench/creation-context'
import type { CycleTaskReference } from './version-cycle/ports'
import { findGoalParentSuggestion } from './scoped-task-workspace'
import { prefetchWorkspaceCreateBase } from './workspace-create-prefetch'

/**
 * 目标开工动作（G2 P4③，P3a 侧栏目标「···」菜单以事件驱动接线）：复用同一
 * 原生创建器，预填目标名称与业务上下文（备注可见可改），不伪造目标 Issue、
 * 不绕过弹窗直接创建树、不新增 BW 多步骤向导。唯一合法的同项目同宿主目标树
 * 在原生父级选择器预选，可改可取消；repo/host 变更由创建器清除旧建议。
 * 事件入口 openGoalStartComposer 为单实现。
 */

type GoalStartTarget = {
  goalId: string
  /** 展示序号（如「G2」）；名称建议与上下文块用展示名，业务身份只认 goalId。 */
  label: string
  title: string
  deliverable?: string
  acceptance?: string
}

type GoalStartHome = {
  repoId: string
  projectId?: string | null
  hostId: ExecutionHostId
  runtimeOwnerEnvironmentId?: string | null
}

/** 目标开工预填块：进原生创建器的备注字段（可见可改、随树存为工作区备注），不做隐藏提示。 */
function buildGoalStartNote(args: {
  version: string
  goal: GoalStartTarget
  references: readonly CycleTaskReference[]
}): string {
  const { version, goal, references } = args
  const refs = references
    .filter((reference) => reference.goalId === goal.goalId)
    .map((reference) => `${reference.provider} ${reference.repository}#${reference.number}`)
  return [
    '目标开工上下文（Workbench 预填，可修改）：',
    `版本：${version}`,
    `目标：${goal.label} · ${goal.title}`,
    `交付约定：${goal.deliverable?.trim() || '待明确'}`,
    `验收约定：${goal.acceptance?.trim() || '待明确'}`,
    `计划依据：${version} 版计划目标 ${goal.label}（goalId: ${goal.goalId}）`,
    `相关任务引用：${refs.length > 0 ? refs.join('、') : '无'}`
  ].join('\n')
}

/**
 * 目标开工（普通函数形态，事件驱动入口用）：同一原生创建器 + BW 预填。
 * home 缺失（项目工作区未就绪）时如实不动作。
 */
export function openGoalStartComposer(args: {
  version: string
  goal: GoalStartTarget
  references: readonly CycleTaskReference[]
  home: GoalStartHome | null
}): void {
  const { version, goal, references, home } = args
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
    initialNote: buildGoalStartNote({ version, goal, references }),
    ...(initialParentWorktreeId ? { initialParentWorktreeId } : {}),
    workbenchCreation,
    enableIssueAutomation: false,
    telemetrySource: 'sidebar'
  })
}
