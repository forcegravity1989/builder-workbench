import type { AppState } from '@/store/types'
import { OPEN_FLOATING_TERMINAL_EVENT } from './floating-terminal'

/** The existing panel owns its visibility; repeated browser reveals always request open. */
export function revealFloatingWorkspacePanel(
  state: Pick<AppState, 'settings' | 'updateSettings'>
): void {
  if (!state.settings) {
    return
  }
  const reveal = (): void => {
    window.dispatchEvent(new Event(OPEN_FLOATING_TERMINAL_EVENT))
  }
  if (state.settings.floatingTerminalEnabled === true) {
    reveal()
    return
  }
  void state
    .updateSettings({ floatingTerminalEnabled: true })
    .then(() => requestAnimationFrame(reveal))
}
