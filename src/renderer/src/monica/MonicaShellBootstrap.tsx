import { useEffect } from 'react'
import { useAppStore } from '@/store'
import { isMonicaShell } from './is-monica-shell'

/** claude tokens; keep left nav open; land on plan when idle terminal. */
export function MonicaShellBootstrap(): null {
  useEffect(() => {
    if (!isMonicaShell()) {
      return
    }
    document.documentElement.setAttribute('data-skin', 'ds')
    document.documentElement.setAttribute('data-theme', 'claude')
    // Why: theme classes (.dark/.light) belong to useDocumentAppearance so
    // settings.theme drives the shell; forcing light here stranded dark (#354).

    const state = useAppStore.getState()
    if (!state.sidebarOpen) {
      state.setSidebarOpen(true)
    }
    if (state.activeView === 'terminal' && !state.activeWorktreeId) {
      state.openArtifactsPage()
    }
  }, [])
  return null
}
