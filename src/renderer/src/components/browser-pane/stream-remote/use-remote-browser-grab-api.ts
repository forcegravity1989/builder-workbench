import { useMemo, useRef } from 'react'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import type {
  BrowserCaptureSelectionScreenshotResult,
  BrowserGrabResult,
  BrowserSetGrabModeResult
} from '../../../../../shared/browser-grab-types'
import type { BrowserGrabApi } from '../annotate/useGrabMode'
import type { RemoteBrowserRuntimeTarget } from './remote-browser-page-input-model'

// Why long: the wait ends only when the viewer clicks, presses Esc, or turns the picker off.
const GRAB_AWAIT_TIMEOUT_MS = 10 * 60_000
const GRAB_CALL_TIMEOUT_MS = 15_000

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Element picking for a page streamed from a remote host: the same four calls the local picker
 * makes over IPC, sent to the host that owns the page. The picker's overlay lives in the host's
 * page, so it appears in the screencast like anything else on that page.
 */
export function useRemoteBrowserGrabApi({
  runtimeTarget,
  runtimeWorktree,
  remotePageId
}: {
  runtimeTarget: () => RemoteBrowserRuntimeTarget | null
  runtimeWorktree: string
  remotePageId: string | null
}): BrowserGrabApi {
  const latest = useRef({ runtimeTarget, runtimeWorktree, remotePageId })
  latest.current = { runtimeTarget, runtimeWorktree, remotePageId }

  return useMemo<BrowserGrabApi>(() => {
    const call = <T>(
      method: string,
      params: Record<string, unknown>,
      timeoutMs = GRAB_CALL_TIMEOUT_MS
    ): Promise<T> => {
      const {
        runtimeTarget: getTarget,
        runtimeWorktree: worktree,
        remotePageId: page
      } = latest.current
      const target = getTarget()
      if (!target || !page) {
        return Promise.reject(new Error('Remote page is not ready'))
      }
      return callRuntimeRpc<T>(
        target,
        method,
        { worktree, page, ...params },
        { timeoutMs, suppressFeatureInteraction: true }
      )
    }
    return {
      setGrabMode: async ({ enabled }): Promise<BrowserSetGrabModeResult> => {
        try {
          return await call<BrowserSetGrabModeResult>('browser.grab.setMode', { enabled })
        } catch {
          return enabled ? { ok: false, reason: 'not-ready' } : { ok: true }
        }
      },
      awaitGrabSelection: async ({ opId }): Promise<BrowserGrabResult> => {
        try {
          return await call<BrowserGrabResult>(
            'browser.grab.await',
            { opId },
            GRAB_AWAIT_TIMEOUT_MS
          )
        } catch (error) {
          return { opId, kind: 'error', reason: errorText(error) }
        }
      },
      cancelGrab: async (): Promise<boolean> => {
        try {
          await call('browser.grab.cancel', {})
          return true
        } catch {
          return false
        }
      },
      captureSelectionScreenshot: async ({
        rect
      }): Promise<BrowserCaptureSelectionScreenshotResult> => {
        try {
          return await call<BrowserCaptureSelectionScreenshotResult>('browser.grab.screenshot', {
            rect
          })
        } catch (error) {
          return { ok: false, reason: errorText(error) }
        }
      }
    }
  }, [])
}
