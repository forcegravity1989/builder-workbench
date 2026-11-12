import { useEffect, useRef } from 'react'
import { getKeybindingContext } from '@/components/terminal-workspace-model'
import { isEditableTarget } from '@/lib/editable-target'
import { getShortcutPlatform } from '@/lib/shortcut-platform'
import { useAppStore } from '@/store'
import { keybindingMatchesAction } from '../../../../shared/keybindings'

/**
 * Why a board-local window listener instead of a native app-command handler:
 * the annotation entry is conditionally rendered (plan built / acceptance has
 * material), and the app-command Map contract requires unavailable surfaces to
 * fall through — a permanently-mounted handler would swallow the chord on
 * overview/task pages and empty boards. Mirrors editor.addReviewNote (local
 * installer, zero native wiring). Only one board mounts at a time
 * (CycleWorkspaceShell renders plan/acceptance exclusively), so window-level
 * listeners never double-fire.
 */
export function useAnnotationModeShortcut(available: boolean, onToggle: () => void): void {
  // Why: ref indirection keeps the listener mounted across renders; the store
  // read below is deliberately non-reactive so a rebind applies on next press.
  const toggleRef = useRef(onToggle)
  toggleRef.current = onToggle
  useEffect(() => {
    if (!available) {
      return
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      // Bubble phase: the native capture dispatcher runs first, so chords it
      // claimed arrive already defaultPrevented and we stay out of their way.
      // Terminal focus and editable targets (session input, inline editors,
      // popover textarea, Monaco) keep the key for text input.
      if (
        event.defaultPrevented ||
        event.repeat ||
        getKeybindingContext(event.target) === 'terminal' ||
        isEditableTarget(event.target) ||
        !keybindingMatchesAction(
          'workbench.toggleAnnotationMode',
          event,
          getShortcutPlatform(),
          useAppStore.getState().keybindings
        )
      ) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      toggleRef.current()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [available])
}
