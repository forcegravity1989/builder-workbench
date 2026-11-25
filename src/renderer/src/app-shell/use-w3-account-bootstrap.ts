import { useEffect, useRef } from 'react'
import { useAppStore } from '@/store'
import { isWorkbenchShell } from '@/workbench/is-workbench-shell'
import { isWebClientLocation } from './platform/web-client-location'
import type { W3AccountStatus } from '../../../shared/w3-account'
import {
  setW3LocalBrowserDefault,
  type W3LocalBrowserDefault
} from '@/lib/w3-local-browser-default'
import { getResourceExecutionHostIdForWorktree } from '@/lib/workspace/ownership/worktree-runtime-owner'
import { LOCAL_EXECUTION_HOST_ID } from '../../../shared/execution-host/execution-host'

// Why: app-level (not page-level) thin mount. On startup / profile restore the
// main process validates the W3 session against the trusted account API before
// this runs, so the local default is only ever set from a confirmed identity.
// When startup reports signed-out, the session bridge runs ONCE automatically
// (passwordless, zero user action); after that the user drives it from the
// settings pane. On sign-out the default is dropped and tabs that hold the
// retired session are closed. Remote/ssh hosts, explicit profiles, doc
// previews and client routes never pick this default up (see
// w3-local-browser-default).
export function useW3AccountBootstrap(): void {
  const previousStateRef = useRef<W3AccountStatus['state'] | null>(null)
  const signedInProfileRef = useRef<W3LocalBrowserDefault | null>(null)
  const autoSyncDoneRef = useRef(false)

  useEffect(() => {
    if (!isWorkbenchShell() || isWebClientLocation() || !window.api?.w3Account) {
      return
    }
    const accountApi = window.api.w3Account
    let disposed = false

    const apply = (status: W3AccountStatus | null): void => {
      if (!status) {
        return
      }
      if (status.state === 'signed-in') {
        const profile = {
          sessionProfileId: status.sessionProfileId,
          sessionPartition: status.sessionPartition
        }
        signedInProfileRef.current = profile
        setW3LocalBrowserDefault(profile)
      } else if (status.state === 'failed' && status.reason === 'sign-out-failed') {
        // Why keep everything: the sign-out cleanup failed, so the dedicated
        // session (and its cookies) is still alive. Dropping the local default
        // or closing W3 tabs here would pretend the sign-out succeeded while
        // the user is still signed in; they can retry the sign-out.
        return
      } else {
        if (previousStateRef.current === 'signed-in') {
          setW3LocalBrowserDefault(null)
          closeW3BrowserTabs(signedInProfileRef.current)
        }
        signedInProfileRef.current = null
      }
      previousStateRef.current = status.state
    }

    void accountApi
      .status()
      .then((status) => {
        if (disposed) {
          return
        }
        apply(status)
        // Why startup-only: the first trusted check says signed-out, so try the
        // passwordless bridge once. Later signed-out answers (user sign-out,
        // failed sync) must NOT silently relaunch Chrome — the user decides.
        if (status.state === 'signed-out' && !autoSyncDoneRef.current) {
          autoSyncDoneRef.current = true
          void accountApi.sync().catch(() => {})
        }
      })
      .catch(() => {})
    const unsubscribe = accountApi.onStatusChanged((status) => {
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
function closeW3BrowserTabs(profile: W3LocalBrowserDefault | null): void {
  if (!profile) {
    return
  }
  const state = useAppStore.getState()
  const tabIds: string[] = []
  for (const [worktreeId, tabs] of Object.entries(state.browserTabsByWorktree ?? {})) {
    if (getResourceExecutionHostIdForWorktree(state, worktreeId) !== LOCAL_EXECUTION_HOST_ID) {
      continue
    }
    for (const tab of tabs) {
      if (
        tab.sessionProfileId === profile.sessionProfileId &&
        tab.sessionPartition === profile.sessionPartition
      ) {
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
