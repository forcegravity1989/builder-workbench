import type { AutomationRun } from '../../../../shared/automations-types'
import type { ExecutionHostId } from '../../../../shared/execution-host'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import { useAppStore } from '@/store'
import {
  buildAutomationRunOpenLayout,
  getAutomationRunOpenTabId,
  resolveAutomationRunOpenTarget
} from './automation-run-open-target'
import { getAutomationRunViewState } from './automation-run-view-state'
import type { AutomationsPageActionContext } from './automations-page-action-context'

/** Focus the exact live pane recorded by a run; never substitute another session. */
export function openAutomationRunTerminal(
  run: AutomationRun,
  executionHostId?: ExecutionHostId
): boolean {
  const state = useAppStore.getState()
  const tabId = getAutomationRunOpenTabId(run)
  const currentLayout = tabId ? state.terminalLayoutsByTabId[tabId] : null
  const target = resolveAutomationRunOpenTarget({
    run,
    terminalTabExists: Boolean(tabId && state.getTab(tabId)?.worktreeId === run.workspaceId),
    currentLayout,
    livePtyIds: tabId ? (state.ptyIdsByTabId[tabId] ?? []) : []
  })
  if (!run.workspaceId || !target || !currentLayout) {
    return false
  }
  if (
    !activateAndRevealWorktree(run.workspaceId, { executionHostId, providesInitialSurface: true })
  ) {
    return false
  }
  state.setTabLayout(target.tabId, buildAutomationRunOpenLayout({ target, currentLayout }))
  state.setActiveTab(target.tabId)
  state.setActiveTabType('terminal')
  return true
}

/** Opens the original run terminal when its host-qualified workspace is alive. */
export function createAutomationRunWorkspaceAction({ store, list }: AutomationsPageActionContext) {
  const { repoForRow, worktreeForRow } = store
  const { selectedRow } = list
  return function openRunWorkspace(run: AutomationRun): void {
    const runWorktree =
      run.workspaceId && selectedRow
        ? (worktreeForRow(selectedRow, repoForRow(selectedRow), run.workspaceId) ?? null)
        : null
    const appStore = useAppStore.getState()
    const openTabId = getAutomationRunOpenTabId(run)
    const terminalTabExists = openTabId ? Boolean(appStore.getTab(openTabId)) : false
    const currentLayout = openTabId ? appStore.terminalLayoutsByTabId[openTabId] : null
    const livePtyIds = openTabId ? (appStore.ptyIdsByTabId[openTabId] ?? []) : []
    const terminalTarget = resolveAutomationRunOpenTarget({
      run,
      terminalTabExists,
      currentLayout,
      livePtyIds
    })
    const runViewState = getAutomationRunViewState({
      run,
      workspaceExists: Boolean(runWorktree),
      terminalTargetExists: terminalTarget !== null
    })
    if (!run.workspaceId || !runWorktree || !runViewState.canOpen) {
      toast.error(runViewState.statusLabel)
      return
    }
    if (runViewState.availability === 'terminal' && !terminalTarget) {
      toast.error(runViewState.statusLabel)
      return
    }
    const hostId = runWorktree.hostId ?? runWorktree.identity?.executionHostId
    if (terminalTarget && openAutomationRunTerminal(run, hostId)) {
      return
    }
    if (!activateAndRevealWorktree(run.workspaceId, { executionHostId: hostId })) {
      toast.error(
        translate(
          'auto.components.automations.AutomationsPage.e1bf9b1512',
          'Workspace is not available.'
        )
      )
      return
    }
    toast.message(runViewState.statusLabel)
  }
}

export type AutomationRunWorkspaceAction = ReturnType<typeof createAutomationRunWorkspaceAction>
