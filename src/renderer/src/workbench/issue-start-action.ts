import { useAppStore } from '@/store'
import { getWorkspaceIntentName } from '../../../shared/workspace-name'
import type { WorkbenchCreationContext } from '../../../shared/workbench/creation-context'
import {
  findVersionTaskWorktrees,
  findGoalParentSuggestion,
  notifyScopedWorkspaceUnavailable
} from './scoped-task-workspace'
import { dispatchScopedWorktrees } from './version-workspace-choice-state'
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
 * 预填名对齐原生直发链（#436 伴飞裁定 CF-6e）：getWorkspaceIntentName 的
 * `Issue <号> <标题前词>` 形态（launch-work-item-direct 同款），中文标题剥尽
 * 后仍含 Issue 号，不再产生「v0.7-g2」式残骸；预填与自动种子不同时按显式
 * 输入存活到提交（getInitialAutoManagedWorkspaceName 语义），号不会被冲掉。
 * 构造上 identity 恒在 → seedName 恒非空，`issue-<号>` 回落仅防御。
 */
function issuePrefilledName(provider: 'github' | 'codehub', number: number, title: string): string {
  return (
    getWorkspaceIntentName({ workItem: { type: 'issue', provider, number, title } })?.seedName ??
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
