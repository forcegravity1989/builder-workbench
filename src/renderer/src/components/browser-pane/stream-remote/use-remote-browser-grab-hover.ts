import { useCallback, useEffect, useRef } from 'react'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import type { RemoteBrowserStreamLifecycle } from './remote-browser-stream-lifecycle'
import type { RemoteBrowserOperationToken } from './remote-browser-stream-tokens'
import type { RemoteBrowserRuntimeTarget } from './remote-browser-page-input-model'

/**
 * While the element picker is armed, tells the host page where the pointer is.
 *
 * Why: the picker's highlight follows pointer movement inside the host's page, and the remote pane
 * otherwise sends the pointer only on press and release. Without this the highlight would not
 * appear until the click that ends the pick.
 *
 * Moves are coalesced: only the latest position waits while one is in flight, so a fast sweep
 * cannot queue behind the click that should end it.
 */
export function useRemoteBrowserGrabHover({
  active,
  getRemoteImagePoint,
  runtimeTarget,
  lifecycle,
  runtimeWorktree,
  enqueueRemoteInput,
  createRemoteOperationToken,
  isCurrentRemoteOperationToken
}: {
  active: boolean
  getRemoteImagePoint: (event: {
    clientX: number
    clientY: number
  }) => { x: number; y: number } | null
  runtimeTarget: () => RemoteBrowserRuntimeTarget | null
  lifecycle: RemoteBrowserStreamLifecycle
  runtimeWorktree: string
  enqueueRemoteInput: (operation: () => Promise<void>) => Promise<void>
  createRemoteOperationToken: (remotePageId?: string | null) => RemoteBrowserOperationToken | null
  isCurrentRemoteOperationToken: (token: RemoteBrowserOperationToken) => boolean
}): (event: React.PointerEvent<HTMLImageElement>) => void {
  const inFlightRef = useRef(false)
  const latestPointRef = useRef<{ x: number; y: number } | null>(null)
  const sendRef = useRef<() => void>(() => {})

  const send = useCallback((): void => {
    if (inFlightRef.current) {
      return
    }
    const point = latestPointRef.current
    const target = runtimeTarget()
    const pageId = lifecycle.tokens.remotePage
    const token = pageId ? createRemoteOperationToken(pageId) : null
    if (!point || !target || !pageId || !token) {
      return
    }
    latestPointRef.current = null
    inFlightRef.current = true
    void enqueueRemoteInput(async () => {
      try {
        if (!isCurrentRemoteOperationToken(token)) {
          return
        }
        await callRuntimeRpc(
          target,
          'browser.mouseMove',
          { worktree: runtimeWorktree, page: pageId, x: point.x, y: point.y },
          { timeoutMs: 15_000, suppressFeatureInteraction: true }
        )
      } catch {
        // Hover feedback is best effort; the click that ends the pick reports its own failure.
      } finally {
        inFlightRef.current = false
        if (latestPointRef.current) {
          window.setTimeout(() => sendRef.current(), 0)
        }
      }
    })
  }, [
    createRemoteOperationToken,
    enqueueRemoteInput,
    isCurrentRemoteOperationToken,
    lifecycle,
    runtimeTarget,
    runtimeWorktree
  ])

  useEffect(() => {
    sendRef.current = send
  }, [send])

  useEffect(() => {
    if (!active) {
      latestPointRef.current = null
    }
  }, [active])

  return useCallback(
    (event: React.PointerEvent<HTMLImageElement>): void => {
      if (!active) {
        return
      }
      const point = getRemoteImagePoint(event)
      if (!point) {
        return
      }
      latestPointRef.current = point
      sendRef.current()
    },
    [active, getRemoteImagePoint]
  )
}
