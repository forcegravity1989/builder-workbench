import {
  ORCA_APP_RESTART_ABORTED_EVENT,
  ORCA_APP_RESTART_STARTED_EVENT,
  ORCA_UPDATER_QUIT_AND_INSTALL_ABORTED_EVENT,
  ORCA_UPDATER_QUIT_AND_INSTALL_DISCARD_UNSAVED_EVENT,
  ORCA_UPDATER_QUIT_AND_INSTALL_STARTED_EVENT
} from '../../../shared/updater-renderer-events'
import { ORCA_RENDERER_SHUTDOWN_CHECKPOINT_ABORTED_EVENT } from '../../../shared/renderer-shutdown-events'

let intentionalAppRestartInProgress = false
// Why: an intentional restart still runs the checkpoint and can block on dirty files.
// Discard is the separate acceptance that a later beforeunload must not cancel the quit.
let discardUnsavedSessionForUpdate = false

export function isUpdaterQuitAndInstallInProgress(): boolean {
  return isIntentionalAppRestartInProgress()
}

export function isIntentionalAppRestartInProgress(): boolean {
  return intentionalAppRestartInProgress
}

export function isDiscardingUnsavedSessionForUpdate(): boolean {
  return discardUnsavedSessionForUpdate
}

export function registerUpdaterBeforeUnloadBypass(): () => void {
  const markInProgress = (): void => {
    intentionalAppRestartInProgress = true
  }
  const markDiscardUnsavedSession = (): void => {
    discardUnsavedSessionForUpdate = true
    intentionalAppRestartInProgress = true
  }
  const clearInProgress = (): void => {
    intentionalAppRestartInProgress = false
    discardUnsavedSessionForUpdate = false
  }

  window.addEventListener(ORCA_UPDATER_QUIT_AND_INSTALL_STARTED_EVENT, markInProgress)
  window.addEventListener(
    ORCA_UPDATER_QUIT_AND_INSTALL_DISCARD_UNSAVED_EVENT,
    markDiscardUnsavedSession
  )
  window.addEventListener(ORCA_UPDATER_QUIT_AND_INSTALL_ABORTED_EVENT, clearInProgress)
  window.addEventListener(ORCA_APP_RESTART_STARTED_EVENT, markInProgress)
  window.addEventListener(ORCA_APP_RESTART_ABORTED_EVENT, clearInProgress)
  window.addEventListener(ORCA_RENDERER_SHUTDOWN_CHECKPOINT_ABORTED_EVENT, clearInProgress)

  return () => {
    window.removeEventListener(ORCA_UPDATER_QUIT_AND_INSTALL_STARTED_EVENT, markInProgress)
    window.removeEventListener(
      ORCA_UPDATER_QUIT_AND_INSTALL_DISCARD_UNSAVED_EVENT,
      markDiscardUnsavedSession
    )
    window.removeEventListener(ORCA_UPDATER_QUIT_AND_INSTALL_ABORTED_EVENT, clearInProgress)
    window.removeEventListener(ORCA_APP_RESTART_STARTED_EVENT, markInProgress)
    window.removeEventListener(ORCA_APP_RESTART_ABORTED_EVENT, clearInProgress)
    window.removeEventListener(ORCA_RENDERER_SHUTDOWN_CHECKPOINT_ABORTED_EVENT, clearInProgress)
    // Why: hot reloads can re-register this listener inside the same renderer.
    // Reset the module flag on cleanup so a failed earlier restart attempt
    // cannot silently suppress future unsaved-change prompts.
    intentionalAppRestartInProgress = false
    discardUnsavedSessionForUpdate = false
  }
}
