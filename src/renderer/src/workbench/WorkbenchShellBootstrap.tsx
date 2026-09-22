import { useEffect } from 'react'
import { useAppStore } from '@/store'
import { isWorkbenchShell } from './is-workbench-shell'

/** Force light + claude tokens; keep left nav open; land on plan when idle terminal. */
export function WorkbenchShellBootstrap(): null {
  useEffect(() => {
    if (!isWorkbenchShell()) {
      return
    }
    document.documentElement.setAttribute('data-skin', 'ds')
    document.documentElement.setAttribute('data-theme', 'claude')
    document.documentElement.classList.remove('dark')
    document.documentElement.classList.add('light')

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
