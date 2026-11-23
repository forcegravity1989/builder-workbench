// Why: after a validated W3 sign-in, ordinary *local* built-in-browser tabs
// should reuse the W3 dedicated session so internal sites are already
// logged in. This is a non-persisted, per-launch cell: it is only ever set
// after the main process has confirmed a trusted W3 identity, and every tab
// re-resolves it at creation time, so a stale id can never outlive the session.
// It never applies to remote/ssh hosts, explicit session profiles, doc
// previews, or client-routed tabs.
let w3LocalBrowserDefaultProfileId: string | null = null

export function getW3LocalBrowserDefaultProfileId(): string | null {
  return w3LocalBrowserDefaultProfileId
}

export function setW3LocalBrowserDefaultProfileId(profileId: string | null): void {
  w3LocalBrowserDefaultProfileId = profileId
}
