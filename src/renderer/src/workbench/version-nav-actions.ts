import { toast } from 'sonner'
import { useAppStore } from '@/store'
import type { VersionWorkflow } from '../../../shared/workbench/version-document'
import { findVersionFlowWorktrees } from '../../../shared/workbench/version-workspace-match'
import type { VersionCatalogEntry } from '../../../shared/workbench/version-catalog'
import { setCycleView } from './cycle-view-state'
import { setBrowsedVersion } from './version-context-state'
import { WORKFLOW_SCREEN_LABELS } from './version-labels'
import { openGoalStartComposer } from './goal-start-action'
import { openWorkbenchWorkspaceChoice } from './version-workspace-choice-state'
import { openVersionTasksPage } from './task-scope-load'
import { loadVersionPlanDocument } from './version-task-entries'
import { nativeVersionWorkspacePort } from './version-workspace-port'
import { prepareFailed } from '../../../shared/workbench/version-workspace-prepare'
import { prepareProblemSummary } from './version-workspace-prepare-report'
import type { VersionCatalogState } from './use-version-catalog'
import { activateVersionWorktree } from './version-worktree-host'
import { closeProjectPage } from './project-page-state'

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
  const bound = findVersionFlowWorktrees(catalog.worktrees, { version, workflow })
  if (bound.length === 1 && bound[0]) {
    const only = bound[0]
    if (activateVersionWorktree(only)) {
      setBrowsedVersion(projectKey, version)
    }
    return
  }
  setBrowsedVersion(projectKey, version)
  if (bound.length > 1) {
    openWorkbenchWorkspaceChoice({
      title: `${version} ${WORKFLOW_SCREEN_LABELS[workflow]}工作区`,
      candidates: [...bound]
    })
    return
  }
  // 无绑定树：无论旧固定树是否存在都进同一屏内入口——浏览目标 effect 按登记
  // 决定 ensure 旧固定树（旧上下文显式保留）还是只读回看；浏览不建树，初始化
  // 是版本行「初始化工作区」按钮的显式动作。
  setCycleView(workflow)
  closeProjectPage()
  useAppStore.getState().openArtifactsPage()
}

/**
 * 版本行「初始化工作区」（#436 伴飞裁定 CF-5）：点击直接执行、无确认单——
 * 创建类动作由 busy 态＋toast 如实回报即可。执行链与「＋ 新建版本」同一
 * prepare RPC（宿主端去重、重入即补齐、幂等 existing 不覆盖）；成功后刷新
 * 登记让侧栏目录立即可见。不激活、不导航（人可能正在别处；进屏走各行入口）。
 */
export async function initializeVersionWorkspace(args: {
  catalog: VersionCatalogState
  version: string
}): Promise<void> {
  const { catalog, version } = args
  const { scope } = catalog
  if (!scope) {
    toast.error('项目工作区尚未就绪，请稍后再试')
    return
  }
  toast.info(`正在为 ${version} 创建工作区…`)
  const result = await nativeVersionWorkspacePort({
    hostId: scope.hostId,
    runtimeOwnerEnvironmentId: scope.runtimeOwnerEnvironmentId
  }).prepare({ repoId: scope.repoId, hostId: scope.hostId, version })
  // 登记刷新：让侧栏目录/绑定立即可见（不依赖轮询）。刷新只是即时性对冲——
  // 失败不得掩盖 prepare 真实结果（否则树已建成却只见刷新报错）；原生登记
  // 推送与目录下次装载自然补齐。
  try {
    const state = useAppStore.getState()
    await Promise.all(catalog.repoIds.map((repoId) => state.fetchWorktrees(repoId)))
    catalog.reload()
  } catch {
    // 静默：prepare 结果按下方如实回报。
  }
  if (prepareFailed(result)) {
    // 步骤链非原子：已成功步骤保留，重试即重入补齐（不重复建树）。
    toast.error(
      `版本 ${version} 工作区未全就绪：${prepareProblemSummary(result)}。重试即补齐缺失步骤，不会重复建树。`
    )
    return
  }
  toast.success(`版本 ${version} 的计划与验收工作区已就绪；未启动 agent。`)
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
  if (!goal) {
    openVersionTasksPage({ version, goal: null, references: [], homeRepoId: catalog.home.repoId })
    closeProjectPage()
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
  const references = read.document.tasks.filter((task) => task.goalId === goal.goalId)
  openVersionTasksPage({
    version,
    goal,
    references,
    homeRepoId: catalog.home.repoId
  })
  closeProjectPage()
}

/** 目标开工只使用已知归属，不为原生可选备注预读计划材料。 */
export async function startVersionGoal(args: {
  catalog: VersionCatalogState
  version: string
  goal: { goalId: string; label: string; title: string }
}): Promise<void> {
  const { catalog, version, goal } = args
  if (!catalog.scope || !catalog.home) {
    toast.info('项目工作区尚未就绪，无法开工目标；待原生登记就绪后重试。')
    return
  }
  closeProjectPage()
  openGoalStartComposer({
    version,
    goal,
    home: {
      repoId: catalog.home.repoId,
      projectId: catalog.scope.projectId,
      hostId: catalog.scope.hostId,
      ...(catalog.scope.runtimeOwnerEnvironmentId
        ? { runtimeOwnerEnvironmentId: catalog.scope.runtimeOwnerEnvironmentId }
        : {})
    }
  })
}
