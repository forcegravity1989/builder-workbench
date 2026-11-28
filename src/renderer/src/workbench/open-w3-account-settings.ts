import { useAppStore } from '@/store'

/**
 * Open Settings › W3 账户, the only place the passwordless sign-in that group
 * discovery rides on can be configured and repaired.
 */
export function openW3AccountSettings(): void {
  const { openSettingsTarget, openSettingsPage } = useAppStore.getState()
  openSettingsTarget({ pane: 'w3-account', repoId: null })
  openSettingsPage()
}
