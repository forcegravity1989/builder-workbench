import { useEffect } from 'react'
import { useAppStore } from '@/store'
import { isWorkbenchShell } from './is-workbench-shell'
import { reconcileMissingActiveRuntimeSession } from '@/store/repos/active-runtime-placeholder'
import { openProjectWall } from './project-page-state'

/** claude tokens; keep left nav open; land on plan when idle terminal. */
export function WorkbenchShellBootstrap(): null {
  useEffect(() => {
    if (!isWorkbenchShell()) {
      return
    }
    document.documentElement.setAttribute('data-skin', 'ds')
    document.documentElement.setAttribute('data-theme', 'claude')
    // Why: theme classes (.dark/.light) belong to useDocumentAppearance so
    // settings.theme drives the shell; forcing light here stranded dark (#354).

    const state = useAppStore.getState()
    // Why: Workbench nav lives in the left sidebar; a collapsed rail
    // leaves Overview/Plan/Tasks/KB unreachable.
    if (!state.sidebarOpen) {
      state.setSidebarOpen(true)
    }
    if (state.activeView === 'terminal' && !state.activeWorktreeId) {
      state.openArtifactsPage()
    }
    let reconciling = false
    const reconcileActivePlaceholder = (previous?: ReturnType<typeof useAppStore.getState>) => {
      if (reconciling) {
        return
      }
      reconciling = true
      try {
        reconcileMissingActiveRuntimeSession(useAppStore.getState(), openProjectWall, previous)
      } finally {
        reconciling = false
      }
    }
    const unsubscribe = useAppStore.subscribe((state, previous) => {
      if (
        state.activeWorktreeId !== previous.activeWorktreeId ||
        state.activeWorkspaceExecutionHostId !== previous.activeWorkspaceExecutionHostId ||
        state.activeRepoId !== previous.activeRepoId ||
        state.restoredRuntimeHostIdByWorkspaceSessionKey !==
          previous.restoredRuntimeHostIdByWorkspaceSessionKey ||
        state.worktreesByRepo !== previous.worktreesByRepo ||
        state.repos !== previous.repos ||
        state.runtimeRepoCatalogIdsByHost !== previous.runtimeRepoCatalogIdsByHost ||
        state.runtimeStatusByEnvironmentId !== previous.runtimeStatusByEnvironmentId
      ) {
        reconcileActivePlaceholder(previous)
      }
    })
    reconcileActivePlaceholder()
    return unsubscribe
  }, [])
  return null
}
