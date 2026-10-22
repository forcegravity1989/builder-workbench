import { useCallback, useEffect } from 'react'
import { useAppStore } from '@/store'
import { revealPlanChat } from '../plan-column-resize'

/**
 * Object-level actions on the acceptance board (deploy, organize minutes, start
 * archiving, release, send annotations) reuse the Orca native agent-send popover
 * — the same chain as browser annotations' "send to agent": a one-sentence
 * instruction with object context, confirmed and sent by the user in the native
 * popover. The board button and saying the same thing in the session are
 * equivalent; the retired paste-draft channel stays retired. `source` stays
 * 'browser-annotations' (extending the Orca union would change native protocol).
 *
 * The popover id is scoped to this screen so a plan board open on another
 * worktree cannot displace an acceptance request, and vice versa.
 */
export function useAcceptanceActionSend(worktreeId: string | null) {
  const open = useAppStore((state) => state.openAgentSendPopoverTargetMode)
  const close = useAppStore((state) => state.closeAgentSendPopoverTargetMode)
  const id = `bw-acceptance-actions:${worktreeId ?? 'none'}`
  useEffect(() => {
    return () => close(id)
  }, [id, close])
  return useCallback(
    (prompt: string, label: string) => {
      if (!worktreeId) {
        return
      }
      // The action also reveals the chat column, matching the approved design.
      revealPlanChat()
      open({
        id,
        worktreeId,
        source: 'browser-annotations',
        prompt,
        label,
        launchSource: 'notes_send'
      })
    },
    [id, worktreeId, open]
  )
}
