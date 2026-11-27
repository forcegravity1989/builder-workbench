import { useCallback, useEffect, useState } from 'react'
import type { W3AccountStatus, W3OpenWebResult } from '../../../../../../shared/w3-account'

export type W3AccountController = {
  status: W3AccountStatus | null
  start: () => Promise<void>
  /** Primary path: harvest the SSO session from the system browser (no user action). */
  sync: () => Promise<void>
  retry: () => Promise<void>
  cancel: () => Promise<void>
  signOut: () => Promise<void>
  openWeb: () => Promise<W3OpenWebResult>
}

/**
 * UI controller for the W3 Account pane. All trusted state comes from
 * `window.api.w3Account`; the pane never infers login from URL/cookie. The
 * main process owns the W3 login window and the account-API poll and pushes
 * the resolved status via `onStatusChanged`.
 */
export function useW3AccountStatus(): W3AccountController {
  const [status, setStatus] = useState<W3AccountStatus | null>(null)

  useEffect(() => {
    let disposed = false
    void window.api.w3Account
      .status()
      .then((next) => {
        if (!disposed) {
          setStatus(next)
        }
      })
      .catch(() => {})
    const unsubscribe = window.api.w3Account.onStatusChanged((next) => {
      if (!disposed) {
        setStatus(next)
      }
    })
    return () => {
      disposed = true
      unsubscribe()
    }
  }, [])

  const start = useCallback(async (): Promise<void> => {
    const result = await window.api.w3Account.start()
    setStatus(result.status)
  }, [])

  const sync = useCallback(async (): Promise<void> => {
    setStatus(await window.api.w3Account.sync())
  }, [])

  const cancel = useCallback(async (): Promise<void> => {
    setStatus(await window.api.w3Account.cancel())
  }, [])

  const signOut = useCallback(async (): Promise<void> => {
    setStatus(await window.api.w3Account.signOut())
  }, [])

  const openWeb = useCallback(
    async (): Promise<W3OpenWebResult> => window.api.w3Account.openWeb(),
    []
  )

  return { status, start, sync, retry: sync, cancel, signOut, openWeb }
}
