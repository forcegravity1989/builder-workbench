import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import type { VersionWorkflow } from '../../../shared/workbench/version-document'
import { findVersionFlowWorktrees } from '../../../shared/workbench/version-workspace-match'
import type { VersionCatalogEntry } from '../../../shared/workbench/version-catalog'
import { setCycleView } from './cycle-view-state'
import { setBrowsedVersion } from './version-context-state'
import { WORKFLOW_SCREEN_LABELS } from './version-labels'
import {
  openWorkbenchWorkspaceChoice,
  worktreeActivationHostOpts
} from './version-workspace-choice-state'
import { openVersionTasksPage } from './task-scope-load'
import { loadVersionPlanDocument } from './version-task-entries'
import type { VersionCatalogState } from './use-version-catalog'

/**
 * G2 侧栏版本导航动作（P3a）：绑定树是唯一「本版流程树」的认定依据（不从
 * 分支名反推）；无绑定树而旧固定树已存在 → 旧 artifacts 路径（旧上下文显式
 * 保留，不强迫一次迁完）；两者皆无 → 如实提示，不悄悄准备树——历史回看不
 * 建目录，准备是显式动作（spec「进入需要编辑的旧版时，再核对或准备」）。
 */

export function navigateVersionWorkflow(args: {
  catalog: VersionCatalogState
  version: string
  workflow: VersionWorkflow
  projectKey: string | null
}): void {
  const { catalog, version, workflow, projectKey } = args
  setBrowsedVersion(projectKey, version)
  const bound = findVersionFlowWorktrees(catalog.worktrees, { version, workflow })
  if (bound.length === 1 && bound[0]) {
    const only = bound[0]
    if (activateAndRevealWorktree(only.id, worktreeActivationHostOpts(only)) === false) {
      toast.error('无法打开本版流程工作区，请在原生项目工作区中核对。')
    }
    return
  }
  if (bound.length > 1) {
    openWorkbenchWorkspaceChoice({
      title: `${version} ${WORKFLOW_SCREEN_LABELS[workflow]}工作区`,
      candidates: [...bound]
    })
    return
  }
  // 无绑定树：无论旧固定树是否存在都进同一屏内入口——浏览目标 effect 按登记
  // 决定 ensure 旧固定树（旧上下文显式保留）还是只读回看；浏览不建树，准备是
  // 版本行菜单的显式动作。
  setCycleView(workflow)
  useAppStore.getState().openArtifactsPage()
}

export async function openVersionTasks(args: {
  catalog: VersionCatalogState
  version: string
  goal?: { goalId: string; label: string } | null
  entry: VersionCatalogEntry | null
}): Promise<void> {
  const { catalog, version, goal, entry } = args
  if (!catalog.scope || !catalog.home) {
    toast.error('项目工作区尚未就绪，请稍后再试')
    return
  }
  const read = await loadVersionPlanDocument({
    scope: catalog.scope,
    homeWorktreeId: catalog.home.id,
    version,
    entry,
    planTrees: catalog.planTrees
  })
  if (!read.document) {
    toast.error(read.problem ?? `版本 ${version} 没有可读的计划材料`)
    return
  }
  if (read.problem) {
    // 草稿来源失败、已回落已提交材料：如实标注，不把旧真相冒充当前稿。
    toast.info(read.problem)
  }
  const references = goal
    ? read.document.tasks.filter((task) => task.goalId === goal.goalId)
    : read.document.tasks
  openVersionTasksPage({
    version,
    goal: goal ?? null,
    references,
    homeRepoId: catalog.home.repoId
  })
}
