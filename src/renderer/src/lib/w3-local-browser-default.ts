// Why: after a validated W3 sign-in, ordinary *local* built-in-browser tabs
// should reuse the W3 dedicated session so internal sites are already
// logged in. This is a non-persisted, per-launch cell: it is only ever set
// after the main process has confirmed a trusted W3 identity, and every tab
// re-resolves it at creation time, so a stale value can never outlive the
// session. The partition rides along because the W3 profile is internal —
// it is filtered out of the renderer's profile list, so a tab holding only
// the profile id would fall back to the default partition and never see the
// W3 cookies. It never applies to remote/ssh hosts, explicit session
// profiles, doc previews, or client-routed tabs.
export type W3LocalBrowserDefault = {
  sessionProfileId: string
  sessionPartition: string
}

let w3LocalBrowserDefault: W3LocalBrowserDefault | null = null

export function getW3LocalBrowserDefault(): W3LocalBrowserDefault | null {
  return w3LocalBrowserDefault
}

export function setW3LocalBrowserDefault(value: W3LocalBrowserDefault | null): void {
  w3LocalBrowserDefault = value
}
