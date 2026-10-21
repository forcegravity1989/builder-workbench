import { useAppStore } from '@/store'
import { activateWebRuntimeSessionWorktree } from '@/runtime/web-runtime-worktree-activation'
import {
  PlanningProgressSourceSchema,
  type PlanningProgressSource
} from '../../../../shared/workbench/version-material'
import type { CycleScope } from './ports'
import { assertCurrentCycleWorkspace } from './current-cycle-workspace'
import { cycleScopeForWorktree, findCycleWorktree } from './native-cycle-workspace'
import { nativeVersionMaterialPort } from '../version-material-port'
import { setCycleView, writeAcceptanceHistorySelection } from '../cycle-view-state'

/** A planning source opens the same fixed acceptance bytes on their own registered workflow tree. */
export async function openAcceptanceSource(
  scope: CycleScope,
  originWorktreeId: string,
  source: PlanningProgressSource
): Promise<void> {
  const fixedSource = PlanningProgressSourceSchema.parse(source)
  assertCurrentCycleWorkspace(scope, originWorktreeId)
  const worktree = findCycleWorktree({ ...scope, workflow: 'acceptance' })
  if (!worktree) {
    throw new Error('尚未登记本项目的验收工作区，请先打开验收工作区，再查看验收依据。')
  }
  const target = cycleScopeForWorktree(worktree, 'acceptance')
  const targetScope = { repoId: target.repoId, worktreeId: worktree.id, hostId: target.hostId }
  const port = nativeVersionMaterialPort(
    { ...targetScope, workflow: 'acceptance' },
    target.runtimeOwnerEnvironmentId
  )
  const selected = await port.select(fixedSource.version)
  assertCurrentCycleWorkspace(scope, originWorktreeId)
  if (selected.version !== fixedSource.version) {
    throw new Error('验收版本未选定，已保留当前计划，请重试。')
  }
  if (target.runtimeOwnerEnvironmentId) {
    await activateWebRuntimeSessionWorktree({
      worktreeId: worktree.id,
      environmentId: target.runtimeOwnerEnvironmentId
    })
    assertCurrentCycleWorkspace(scope, originWorktreeId)
  }
  writeAcceptanceHistorySelection(
    targetScope,
    fixedSource.version,
    `fixed:${JSON.stringify(fixedSource)}`,
    target.runtimeOwnerEnvironmentId
  )
  setCycleView('acceptance')
  const state = useAppStore.getState()
  state.setActiveWorktree(worktree.id, target.hostId)
  state.setActiveView('terminal')
}
