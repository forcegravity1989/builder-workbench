import { useEffect } from 'react'
import { useAppStore } from '@/store'
import { isWorkbenchShell } from './is-workbench-shell'

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
  }, [])
  return null
}
