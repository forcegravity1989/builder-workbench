import type { DraftPasteReadySignal } from '../../../shared/tui-agent-config'
import type { GlobalSettings } from '../../../shared/global-settings-types'
import { subscribeToPtyData } from '@/components/terminal-pane/pty-data-sidecar-subscriptions'
import { replayPreHandlerPtyData } from '@/components/terminal-pane/pty-pre-handler-buffer'
import { isRemoteRuntimePtyId } from '@/runtime/runtime-terminal-inspection'
import { subscribeToRuntimeTerminalData } from '@/runtime/runtime-terminal-stream'
import { createDraftPasteReadyScanner } from '../../../shared/draft-paste-ready-scanner'
import { parseAppSshPtyId } from '../../../shared/ssh-pty-id'

const BRACKETED_PASTE_QUIET_MS = 1500

/**
 * Tap the PTY data stream as a side-channel observer (does NOT take over
 * the primary handler that feeds xterm) and resolve once input is ready.
 *
 * Why a sidecar subscription:
 *   - the main pane may attach mid-flight; we must not race against its
 *     handler registration on the dispatcher's primary slot.
 *   - DECSET 2004 and the Codex composer prompt may straddle two data chunks,
 *     so keep a small ring of recent bytes and search the union.
 */
export function waitForAgentDraftInputReady(
  ptyId: string,
  timeoutMs: number,
  readySignal: DraftPasteReadySignal,
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let settled = false
    const scanner = createDraftPasteReadyScanner(readySignal)
    let quietTimer: number | null = null
    let hardTimer: number | null = null
    let unsubscribe: (() => void) | null = null

    const finish = (value: boolean): void => {
      if (settled) {
        return
      }
      settled = true
      if (hardTimer !== null) {
        window.clearTimeout(hardTimer)
      }
      if (quietTimer !== null) {
        window.clearTimeout(quietTimer)
      }
      unsubscribe?.()
      resolve(value)
    }

    const armQuietTimer = (): void => {
      if (quietTimer !== null) {
        window.clearTimeout(quietTimer)
      }
      quietTimer = window.setTimeout(() => finish(true), BRACKETED_PASTE_QUIET_MS)
    }

    const observeData = (data: string): void => {
      if (settled) {
        return
      }
      const { ready, armQuietTimer: shouldArm } = scanner.observe(data)
      if (ready) {
        finish(true)
        return
      }
      if (shouldArm) {
        armQuietTimer()
      }
    }

    if (isRemoteRuntimePtyId(ptyId)) {
      void subscribeToRuntimeTerminalData(
        settings,
        ptyId,
        `desktop:paste-ready:${ptyId}`,
        observeData
      )
        .then((remoteUnsubscribe) => {
          if (settled) {
            remoteUnsubscribe()
            return
          }
          unsubscribe = remoteUnsubscribe
        })
        .catch(() => finish(false))
    } else {
      let sawLiveData = false
      unsubscribe = subscribeToPtyData(ptyId, (data) => {
        sawLiveData = true
        observeData(data)
      })
      // Why: spawn can resolve after the first Codex frame was buffered. Replay
      // it to this observer without consuming the primary xterm handler's copy.
      replayPreHandlerPtyData(ptyId, observeData)
      if (!settled && !parseAppSshPtyId(ptyId)) {
        // A retry may start after the live composer frame has already rendered.
        // Only use the current frame, and never replay it after newer live bytes.
        void (async () => {
          const snapshot = await window.api?.pty?.getMainBufferSnapshot?.(ptyId, {
            scrollbackRows: 0
          })
          if (!sawLiveData && snapshot?.data && snapshot.terminalOwner !== 'shell') {
            observeData(snapshot.data)
          }
        })().catch(() => {
          // Keep observing the original PTY stream when a snapshot is unavailable.
        })
      }
    }

    if (!settled) {
      hardTimer = window.setTimeout(() => finish(false), timeoutMs)
    }
  })
}
