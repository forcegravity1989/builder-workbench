import { toRuntimeExecutionHostId } from '../../../shared/execution-host'
import { notifyMonicaError } from './error-feedback'
import { readVersionMembership } from './version-cycle/version-membership'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import type { CycleTaskReference } from './version-cycle/ports'
import type { VersionWorkflow } from '../../../shared/monica/version-document'
import { findVersionFlowWorktrees } from '../../../shared/monica/version-workspace-match'
import {
  isVersionFlowWorkflow,
  prepareFailed
} from '../../../shared/monica/version-workspace-prepare'
import { normalizeStoredMonicaVersionBinding } from '../../../shared/monica/version-binding'
import type { Worktree } from '../../../shared/worktree/types'
import type { VersionCatalogEntry } from '../../../shared/monica/version-catalog'
import { setCycleView } from './cycle-view-state'
import { setBrowsedVersion } from './version-context-state'
import { WORKFLOW_SCREEN_LABELS } from './version-labels'
import { openGoalStartComposer } from './goal-start-action'
import { openMonicaWorkspaceChoice } from './version-workspace-choice-state'
import { openVersionTasksPage } from './task-scope-load'
import { loadVersionPlanDocument } from './version-task-entries'
import { nativeVersionWorkspacePort } from './version-workspace-port'
import { prepareProblemSummary } from './version-workspace-prepare-report'
import type { VersionCatalogState } from './use-version-catalog'
import { activateVersionWorktree, isVersionHostDisconnected } from './version-worktree-host'
import { closeProjectPage, openCycleProject } from './project-page-state'
import { nativeWorkspaceScope } from './version-cycle/native-workspace'
import { versionTreeKey } from './version-material-selection'
import { worktreeActivationHostOpts } from './worktree-activation-host-opts'

export function chooseVersionSourceWorkspace(args: {
  version: string
  purpose: 'overview' | 'tasks'
  worktrees: readonly Worktree[]
  onChoose: (tree: Worktree) => void
}): boolean {
  const { version, purpose, worktrees, onChoose } = args
  const candidates = worktrees.filter((tree) => {
    const binding = normalizeStoredMonicaVersionBinding(tree.workbenchVersionBinding)
    return (
      !tree.isArchived &&
      binding?.version === version &&
      (purpose === 'tasks' || isVersionFlowWorkflow(binding.workflow)) &&
      !isVersionHostDisconnected(tree)
    )
  })
  if (!candidates.length) {
    return false
  }
  openMonicaWorkspaceChoice({
    title: `${version} · 选择${purpose === 'tasks' ? '任务' : '总览'}的工作区`,
    candidates,
    onChoose
  })
  return true
}

export function openVersionTasksFromWorkspace(tree: Worktree, version: string): void {
  const current = useAppStore
    .getState()
    .getKnownWorktreeById(tree.id, worktreeActivationHostOpts(tree)?.executionHostId)
  const binding = normalizeStoredMonicaVersionBinding(current?.workbenchVersionBinding)
  if (
    !current ||
    current.isArchived ||
    binding?.version !== version ||
    versionTreeKey(current) !== versionTreeKey(tree) ||
    isVersionHostDisconnected(current)
  ) {
    throw new Error('所选工作区已变化或暂不可用')
  }
  const scope = nativeWorkspaceScope(current)
  openVersionTasksPage({
    version,
    references: [],
    homeRepoId: scope.repoId,
    homeHostId: scope.hostId,
    runtimeOwnerEnvironmentId: scope.runtimeOwnerEnvironmentId
  })
  closeProjectPage()
}

export function navigateVersionWorkflow(args: {
  catalog: VersionCatalogState | null
  worktrees?: VersionCatalogState['worktrees']
  version: string
  workflow: VersionWorkflow
  projectKey: string | null
}): void {
  const { catalog, version, workflow, projectKey } = args
  const bound = findVersionFlowWorktrees(args.worktrees ?? catalog?.worktrees ?? [], {
    version,
    workflow
  })
  if (bound.length === 1 && bound[0]) {
    const only = bound[0]
    if (activateVersionWorktree(only)) {
      setBrowsedVersion(projectKey, version)
    }
    return
  }
  setBrowsedVersion(projectKey, version)
  if (bound.length > 1) {
    openMonicaWorkspaceChoice({
      title: `${version} ${WORKFLOW_SCREEN_LABELS[workflow]}工作区`,
      candidates: [...bound]
    })
    return
  }
  const committed = catalog?.catalog?.entries.find((entry) => entry.version === version)?.material[
    workflow
  ]
  if (!catalog?.scope || (catalog.error && !committed)) {
    toast.error('项目工作区尚未就绪，请稍后再试')
    return
  }
  setCycleView(workflow)
  openCycleProject(catalog.scope, version)
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
    await state.fetchWorktrees(scope.repoId, {
      executionHostId: scope.runtimeOwnerEnvironmentId
        ? toRuntimeExecutionHostId(scope.runtimeOwnerEnvironmentId)
        : scope.hostId
    })
    catalog.reload()
  } catch {
    // 静默：prepare 结果按下方如实回报。
  }
  if (prepareFailed(result)) {
    // 步骤链非原子：已成功步骤保留，重试即重入补齐（不重复建树）。
    notifyMonicaError(
      `版本 ${version} 工作区未全就绪`,
      prepareProblemSummary(result),
      '可重试，已就绪的工作区会复用。'
    )
    return
  }
  toast.success(`版本 ${version} 的计划与验收工作区已就绪；未启动 agent。`)
}

export async function openVersionTasks(args: {
  catalog: VersionCatalogState
  version: string
  goal?: { goalId: string; label: string; references?: readonly CycleTaskReference[] } | null
  entry: VersionCatalogEntry | null
}): Promise<void> {
  const { catalog, version, goal, entry } = args
  if (!catalog.scope || !catalog.home) {
    toast.error('项目工作区尚未就绪，请稍后再试')
    return
  }
  if (!goal || goal.references) {
    openVersionTasksPage({
      version,
      goal,
      references: goal?.references ?? [],
      homeRepoId: catalog.scope.repoId,
      homeHostId: catalog.scope.hostId,
      runtimeOwnerEnvironmentId: catalog.scope.runtimeOwnerEnvironmentId
    })
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
    notifyMonicaError(`版本 ${version} 没有可读的计划材料`, read.problem)
    return
  }
  if (read.problem) {
    // 草稿来源失败、已回落已提交材料：如实标注，不把旧真相冒充当前稿。
    notifyMonicaError('未读取计划草稿，正在使用已提交材料', read.problem)
  }
  let references: CycleTaskReference[]
  try {
    const members = await readVersionMembership(catalog.scope, read.document)
    references = members.filter((task) => task.goalId === goal.goalId)
  } catch (error) {
    notifyMonicaError('无法打开版本任务', error, '检查项目连接后重试。')
    return
  }
  openVersionTasksPage({
    version,
    goal,
    references,
    homeRepoId: catalog.scope.repoId,
    homeHostId: catalog.scope.hostId,
    runtimeOwnerEnvironmentId: catalog.scope.runtimeOwnerEnvironmentId
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
