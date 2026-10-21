import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import type { VersionWorkflow } from '../../../shared/workbench/version-document'
import { normalizeStoredWorkbenchVersionBinding } from '../../../shared/workbench/version-binding'
import { findVersionFlowWorktrees } from '../../../shared/workbench/version-workspace-match'
import type { VersionCatalogEntry } from '../../../shared/workbench/version-catalog'
import { setCycleView } from './cycle-view-state'
import { setBrowsedVersion } from './version-context-state'
import { cycleBranch } from './version-cycle/native-cycle-workspace'
import { openWorkbenchWorkspaceChoice } from './version-workspace-choice-state'
import { openVersionTasksPage } from './task-scope-load'
import { loadVersionPlanDocument } from './version-task-entries'
import type { VersionCatalogState } from './use-version-catalog'

/**
 * G2 侧栏版本导航动作（P3a）：绑定树是唯一「本版流程树」的认定依据（不从
 * 分支名反推）；无绑定树而旧固定树已存在 → 旧 artifacts 路径（旧上下文显式
 * 保留，不强迫一次迁完）；两者皆无 → 如实提示，不悄悄准备树——历史回看不
 * 建目录，准备是显式动作（spec「进入需要编辑的旧版时，再核对或准备」）。
 */

export function workflowLabel(workflow: VersionWorkflow): string {
  return workflow === 'plan' ? '计划' : '验收'
}

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
    if (activateAndRevealWorktree(bound[0].id) === false) {
      toast.error('无法打开本版流程工作区，请在原生项目工作区中核对。')
    }
    return
  }
  if (bound.length > 1) {
    openWorkbenchWorkspaceChoice({
      title: `${version} ${workflowLabel(workflow)}工作区`,
      candidates: [...bound]
    })
    return
  }
  const legacyBranch = cycleBranch({ workflow })
  const legacy = catalog.worktrees.find(
    (tree) =>
      !tree.isArchived &&
      !normalizeStoredWorkbenchVersionBinding(tree.workbenchVersionBinding) &&
      tree.branch.replace(/^refs\/heads\//, '') === legacyBranch
  )
  if (legacy) {
    // 旧固定树路径：artifacts 槽沿现有 ensure/选版语义（旧上下文显式保留）。
    setCycleView(workflow)
    useAppStore.getState().openArtifactsPage()
    return
  }
  toast.info(
    `版本 ${version} 尚无${workflowLabel(workflow)}工作区。可在版本行菜单「准备流程工作区」；材料回看走任务/目标入口，浏览不建树。`
  )
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
