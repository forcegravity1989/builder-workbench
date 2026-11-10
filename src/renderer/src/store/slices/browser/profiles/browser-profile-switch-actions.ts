import type { BrowserSlice, BrowserSliceGet, BrowserSliceSet } from '../browser-slice-contract'

export function createBrowserProfileSwitchActions(
  set: BrowserSliceSet,
  _get: BrowserSliceGet
): Pick<BrowserSlice, 'switchBrowserTabProfile'> {
  return {
    switchBrowserTabProfile: (workspaceId, profileId, sessionPartition) => {
      const switchHere = (): void =>
        set((s) => {
          for (const [worktreeId, tabs] of Object.entries(s.browserTabsByWorktree)) {
            const tabIndex = tabs.findIndex((t) => t.id === workspaceId)
            if (tabIndex !== -1) {
              const updatedTabs = [...tabs]
              updatedTabs[tabIndex] = {
                ...updatedTabs[tabIndex],
                sessionProfileId: profileId,
                sessionPartition: sessionPartition ?? null
              }
              return {
                browserTabsByWorktree: {
                  ...s.browserTabsByWorktree,
                  [worktreeId]: updatedTabs
                }
              }
            }
          }
          return s
        })
      switchHere()
    }
  }
}
