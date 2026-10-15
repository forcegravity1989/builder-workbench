import { useAppStore } from '@/store'

// Why (BW #323): injection reuses the standard terminal-creation path — the
// main process writes the startup command and submits it, so interactive auth
// prompts (QR / device codes) render in the terminal itself. Remote runtimes
// reject local terminal creation, so cards only offer the buttons for the
// local desktop scope (spec I09).
export function useCanInjectCliCommand(): boolean {
  const activeRuntimeEnvironmentId = useAppStore(
    (s) => s.settings?.activeRuntimeEnvironmentId?.trim() ?? ''
  )
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)
  return activeRuntimeEnvironmentId === '' && Boolean(activeWorktreeId)
}

export function injectCliCommandIntoTerminal(command: string): void {
  const store = useAppStore.getState()
  const worktreeId = store.activeWorktreeId
  if (!worktreeId) {
    return
  }
  const tab = store.createTab(worktreeId, undefined, undefined, {
    pendingStartup: { command }
  })
  store.setActiveTabType('terminal')
  store.setActiveTab(tab.id)
}
