import { useAppStore } from '@/store'
import {
  PlanningProgressSourceSchema,
  type PlanningProgressSource
} from '../../../../shared/workbench/version-material'
import type { CycleScope } from './ports'
import { assertCurrentCycleWorkspace } from './current-cycle-workspace'
import { cycleScopeForWorktree, cycleScopeKey } from './native-cycle-workspace'
import { nativeVersionHistoryPort } from '../version-history-port'
import { readPlanningProgressSource } from '../../../../shared/workbench/planning-progress-source'
import { normalizeStoredWorkbenchVersionBinding } from '../../../../shared/workbench/version-binding'
import { cycleWorkflowForWorktree } from '../workbench-nav'
import {
  openFixedAcceptanceBrowse,
  setCycleView,
  type FixedAcceptanceBrowse
} from '../cycle-view-state'

/** Open the verified acceptance and adopted plan without selecting or writing workflow material. */
export async function openAcceptanceSource(
  scope: CycleScope,
  originWorktreeId: string,
  source: PlanningProgressSource,
  originPlan: FixedAcceptanceBrowse['originPlan'],
  isCurrent: () => boolean
): Promise<void> {
  const fixedSource = PlanningProgressSourceSchema.parse(source)
  const originWorktreeInstanceId =
    useAppStore.getState().getKnownWorktreeById(originWorktreeId, scope.hostId)?.instanceId ?? null
  const assertOrigin = () => {
    assertCurrentCycleWorkspace(scope, originWorktreeId)
    const worktree = useAppStore.getState().getKnownWorktreeById(originWorktreeId, scope.hostId)
    const binding = normalizeStoredWorkbenchVersionBinding(worktree?.workbenchVersionBinding)
    if (
      scope.workflow !== 'plan' ||
      cycleWorkflowForWorktree(worktree) !== 'plan' ||
      (worktree?.instanceId ?? null) !== originWorktreeInstanceId ||
      (binding && binding.version !== originPlan.version) ||
      !isCurrent()
    ) {
      throw new Error('计划版本已切换，请从当前计划重新打开验收依据。')
    }
  }
  assertOrigin()
  const documents = await readPlanningProgressSource(
    nativeVersionHistoryPort(scope.runtimeOwnerEnvironmentId),
    { repoId: scope.repoId, worktreeId: originWorktreeId, hostId: scope.hostId },
    fixedSource
  )
  assertOrigin()
  openFixedAcceptanceBrowse({
    scope,
    originWorktreeId,
    originWorktreeInstanceId,
    originExecutionHostId: useAppStore.getState().activeWorkspaceExecutionHostId,
    originPlan,
    source: fixedSource,
    ...documents
  })
  useAppStore.getState().openArtifactsPage()
}

export function returnFromAcceptanceSource(view: FixedAcceptanceBrowse): void {
  const state = useAppStore.getState()
  const worktree = state.getKnownWorktreeById(view.originWorktreeId, view.scope.hostId)
  const binding = normalizeStoredWorkbenchVersionBinding(worktree?.workbenchVersionBinding)
  if (
    !worktree ||
    cycleWorkflowForWorktree(worktree) !== 'plan' ||
    (worktree.instanceId ?? null) !== view.originWorktreeInstanceId ||
    (binding && binding.version !== view.originPlan.version) ||
    cycleScopeKey(cycleScopeForWorktree(worktree, view.scope.workflow)) !==
      cycleScopeKey(view.scope)
  ) {
    throw new Error('原计划工作区的登记已改变，请从侧栏重新进入计划。')
  }
  setCycleView('plan')
  state.setActiveWorktree(view.originWorktreeId, view.scope.hostId)
  state.setActiveView('terminal')
}
