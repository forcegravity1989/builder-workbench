import { useEffect, useRef } from 'react'
import { useAppStore } from '@/store'
import type { W3AccountStatus } from '../../../shared/w3-account'
import { setW3LocalBrowserDefaultProfileId } from '@/lib/w3-local-browser-default'

// Why: app-level (not page-level) thin mount. On startup / profile restore the
// main process validates the W3 session against the trusted account API before
// this runs, so the local default is only ever set from a confirmed identity.
// On sign-out the default is dropped and tabs that hold the retired session
// are closed. Remote/ssh hosts, explicit profiles, doc previews and client
// routes never pick this default up (see w3-local-browser-default).
export function useW3AccountBootstrap(): void {
  const previousStateRef = useRef<W3AccountStatus['state'] | null>(null)
  const signedInProfileRef = useRef<string | null>(null)

  useEffect(() => {
    let disposed = false

    const apply = (status: W3AccountStatus | null): void => {
      if (!status) {
        return
      }
      if (status.state === 'signed-in') {
        signedInProfileRef.current = status.sessionProfileId
        setW3LocalBrowserDefaultProfileId(status.sessionProfileId)
      } else {
        if (previousStateRef.current === 'signed-in') {
          setW3LocalBrowserDefaultProfileId(null)
          closeW3BrowserTabs(signedInProfileRef.current)
        }
        signedInProfileRef.current = null
      }
      previousStateRef.current = status.state
    }

    void window.api.w3Account
      .status()
      .then((status) => {
        if (!disposed) {
          apply(status)
        }
      })
      .catch(() => {})
    const unsubscribe = window.api.w3Account.onStatusChanged((status) => {
      if (!disposed) {
        apply(status)
      }
    })
    return () => {
      disposed = true
      unsubscribe()
    }
  }, [])
}

// Why: closing the tabs bound to the retired W3 session stops pages from
// showing an identity that has just been signed out. Only tabs whose session
// profile is the W3 one are touched.
function closeW3BrowserTabs(profileId: string | null): void {
  if (!profileId) {
    return
  }
  const state = useAppStore.getState()
  const tabIds: string[] = []
  for (const tabs of Object.values(state.browserTabsByWorktree ?? {})) {
    for (const tab of tabs) {
      if (tab.sessionProfileId === profileId) {
        tabIds.push(tab.id)
      }
    }
  }
  for (const tabId of tabIds) {
    try {
      state.closeBrowserTab(tabId)
    } catch {
      // Best-effort; the session storage is already cleared by the main process.
    }
  }
}
