import { findSiblingGroupId } from '../../../../shared/workspace-layout/tab-group-layout-tree'
import type { Tab } from '../../../../shared/tab-types'
import {
  deriveActiveSurface,
  pickNextActiveTabAfterClose,
  pruneGroupLayout
} from '../../../../shared/workspace-session-terminal-tab-close'
// Persist headless browser tabs/pages like window-owned tabs; restart lists saved tabs but restores pages only on first use.

import type { BrowserPage } from '../../../../shared/browser-workspace-types'
import type { ExecutionHostId } from '../../../../shared/execution-host'
import type { WorkspaceSessionState } from '../../../../shared/workspace-session-state-types'
import { randomUUID } from 'node:crypto'

export type ServeBrowserPageState = {
  worktreeId: string
  pageId: string
  url: string
  title: string
}

/** The saved browser tab showing this page, and the page; a host's own tab is named by its page. */
export function findSavedBrowserPage(
  session: WorkspaceSessionState,
  worktreeId: string,
  pageId: string
): { tabId: string; page: BrowserPage } | null {
  for (const tab of session.browserTabsByWorktree?.[worktreeId] ?? []) {
    const page = session.browserPagesByWorkspace?.[tab.id]?.find((entry) => entry.id === pageId)
    if (page) {
      return { tabId: tab.id, page }
    }
  }
  return null
}

/** The partition with a just-created page's tab, or null when it is saved already or refused. */
export function withOpenedServeBrowserTab(
  hostId: ExecutionHostId,
  session: WorkspaceSessionState,
  page: ServeBrowserPageState & { profileId?: string; groupId?: string }
): WorkspaceSessionState | null {
  if (findSavedBrowserPage(session, page.worktreeId, page.pageId)) {
    return null
  }
  const worktreeId = page.worktreeId
  const groups = session.tabGroups?.[worktreeId] ?? []
  const group = groups.find((entry) => entry.id === page.groupId) ?? groups[0]
  const groupId = group?.id ?? randomUUID()
  const now = Date.now()
  const savedPage = servePageRecord(page, now)
  const tabs = session.unifiedTabs?.[worktreeId] ?? []
  const tab: Tab = {
    id: page.pageId,
    entityId: page.pageId,
    groupId,
    worktreeId,
    executionHostId: hostId,
    contentType: 'browser',
    label: page.title,
    customLabel: null,
    color: null,
    sortOrder: group?.tabOrder.length ?? 0,
    createdAt: now
  }
  const nextGroup = {
    ...(group ?? { id: groupId, worktreeId, activeTabId: null }),
    tabOrder: [...(group?.tabOrder ?? []), tab.id]
  }
  return {
    ...session,
    browserTabsByWorktree: {
      ...session.browserTabsByWorktree,
      [worktreeId]: [
        ...(session.browserTabsByWorktree?.[worktreeId] ?? []),
        {
          ...savedPage,
          sessionProfileId: page.profileId ?? null,
          activePageId: page.pageId,
          pageIds: [page.pageId]
        }
      ]
    },
    browserPagesByWorkspace: { ...session.browserPagesByWorkspace, [page.pageId]: [savedPage] },
    unifiedTabs: { ...session.unifiedTabs, [worktreeId]: [...tabs, tab] },
    tabGroups: {
      ...session.tabGroups,
      [worktreeId]: group
        ? groups.map((entry) => (entry.id === groupId ? nextGroup : entry))
        : [nextGroup]
    },
    tabGroupLayouts: {
      ...session.tabGroupLayouts,
      [worktreeId]: session.tabGroupLayouts?.[worktreeId] ?? { type: 'leaf', groupId }
    }
  }
}

function servePageRecord(page: ServeBrowserPageState, createdAt: number): BrowserPage {
  return {
    loading: false,
    faviconUrl: null,
    canGoBack: false,
    canGoForward: false,
    loadError: null,
    url: page.url,
    title: page.title,
    id: page.pageId,
    workspaceId: page.pageId,
    worktreeId: page.worktreeId,
    createdAt
  }
}

/** Attach the page record/address after openBrowserTab; null if the tab vanished or its page was already saved. */
export function withServeBrowserPageRecord(
  session: WorkspaceSessionState,
  page: ServeBrowserPageState
): WorkspaceSessionState | null {
  const tabs = session.browserTabsByWorktree?.[page.worktreeId] ?? []
  const tab = tabs.find((entry) => entry.id === page.pageId)
  if (!tab || findSavedBrowserPage(session, page.worktreeId, page.pageId)) {
    return null
  }
  return {
    ...session,
    browserTabsByWorktree: {
      ...session.browserTabsByWorktree,
      [page.worktreeId]: tabs.map((entry) =>
        entry === tab ? { ...entry, url: page.url, title: page.title } : entry
      )
    },
    browserPagesByWorkspace: {
      ...session.browserPagesByWorkspace,
      [page.pageId]: [servePageRecord(page, tab.createdAt)]
    }
  }
}

/** The partition without a closed tab's page records; null when it holds none. */
export function withoutServeBrowserPages(
  session: WorkspaceSessionState,
  browserTabId: string
): WorkspaceSessionState | null {
  if (!session.browserPagesByWorkspace?.[browserTabId]) {
    return null
  }
  const { [browserTabId]: _closed, ...pages } = session.browserPagesByWorkspace
  return { ...session, browserPagesByWorkspace: pages }
}

/** The tab-bar entry showing a saved browser tab: a window's has its own id, a host's the tab's. */
export function savedBrowserTabEntryId(
  session: WorkspaceSessionState,
  worktreeId: string,
  browserTabId: string
): string {
  return (
    session.unifiedTabs?.[worktreeId]?.find(
      (entry) => entry.contentType === 'browser' && entry.entityId === browserTabId
    )?.id ?? browserTabId
  )
}

/** Update only address fields without reloading layout; null if absent or unchanged. */
export function withServeBrowserPageState(
  session: WorkspaceSessionState,
  page: ServeBrowserPageState
): WorkspaceSessionState | null {
  const saved = findSavedBrowserPage(session, page.worktreeId, page.pageId)
  if (!saved || (saved.page.url === page.url && saved.page.title === page.title)) {
    return null
  }
  const state = { url: page.url, title: page.title }
  const tabs = session.browserTabsByWorktree?.[page.worktreeId] ?? []
  return {
    ...session,
    browserTabsByWorktree: {
      ...session.browserTabsByWorktree,
      // The tab mirrors its active page only.
      [page.worktreeId]: tabs.map((tab) =>
        tab.id === saved.tabId && (!tab.activePageId || tab.activePageId === page.pageId)
          ? { ...tab, ...state }
          : tab
      )
    },
    browserPagesByWorkspace: {
      ...session.browserPagesByWorkspace,
      [saved.tabId]: (session.browserPagesByWorkspace?.[saved.tabId] ?? []).map((entry) =>
        entry.id === page.pageId ? { ...entry, ...state } : entry
      )
    }
  }
}

/** The partition without the tab showing the page, or null when no saved tab shows it. */
export function withClosedServeBrowserTab(
  _hostId: ExecutionHostId,
  session: WorkspaceSessionState,
  worktreeId: string,
  pageId: string
): WorkspaceSessionState | null {
  const saved = findSavedBrowserPage(session, worktreeId, pageId)
  if (!saved) {
    return null
  }
  const closedIds = new Set([savedBrowserTabEntryId(session, worktreeId, saved.tabId)])
  const tabs = (session.unifiedTabs?.[worktreeId] ?? []).filter((tab) => !closedIds.has(tab.id))
  const groups = (session.tabGroups?.[worktreeId] ?? [])
    .map((group) => {
      const tabOrder = group.tabOrder.filter((id) => !closedIds.has(id))
      const remaining = new Set(tabOrder)
      return {
        ...group,
        tabOrder,
        activeTabId: closedIds.has(group.activeTabId ?? '')
          ? pickNextActiveTabAfterClose(group, closedIds, tabOrder, remaining)
          : group.activeTabId,
        recentTabIds: group.recentTabIds?.filter((id) => remaining.has(id))
      }
    })
    .filter((group) => group.tabOrder.length > 0)
  const groupIds = new Set(groups.map((group) => group.id))
  const previousGroupId = session.activeGroupIdByWorktree?.[worktreeId]
  const previousLayout = session.tabGroupLayouts?.[worktreeId]
  const siblingId =
    previousLayout && previousGroupId ? findSiblingGroupId(previousLayout, previousGroupId) : null
  const groupId = groupIds.has(previousGroupId ?? '')
    ? previousGroupId
    : siblingId && groupIds.has(siblingId)
      ? siblingId
      : groups[0]?.id
  const layout = pruneGroupLayout(session.tabGroupLayouts?.[worktreeId], groupIds)
  const { [saved.tabId]: _closed, ...pages } = session.browserPagesByWorkspace ?? {}
  const next: WorkspaceSessionState = {
    ...session,
    browserTabsByWorktree: {
      ...session.browserTabsByWorktree,
      [worktreeId]: (session.browserTabsByWorktree?.[worktreeId] ?? []).filter(
        (tab) => tab.id !== saved.tabId
      )
    },
    browserPagesByWorkspace: pages,
    unifiedTabs: { ...session.unifiedTabs, [worktreeId]: tabs },
    tabGroups: { ...session.tabGroups, [worktreeId]: groups },
    tabGroupLayouts: { ...session.tabGroupLayouts },
    activeGroupIdByWorktree: { ...session.activeGroupIdByWorktree }
  }
  if (layout) {
    next.tabGroupLayouts![worktreeId] = layout
  } else {
    delete next.tabGroupLayouts![worktreeId]
  }
  if (groupId) {
    next.activeGroupIdByWorktree![worktreeId] = groupId
  } else {
    delete next.activeGroupIdByWorktree![worktreeId]
  }
  const surface = deriveActiveSurface(next, worktreeId, tabs, groups, groupId)
  next.activeBrowserTabIdByWorktree = {
    ...session.activeBrowserTabIdByWorktree,
    [worktreeId]: surface.browserTabId
  }
  next.activeTabTypeByWorktree = { ...session.activeTabTypeByWorktree, [worktreeId]: surface.type }
  next.activeTabIdByWorktree = {
    ...session.activeTabIdByWorktree,
    [worktreeId]: surface.terminalTabId
  }
  next.activeFileIdByWorktree = { ...session.activeFileIdByWorktree, [worktreeId]: surface.fileId }
  if (session.activeWorktreeId === worktreeId) {
    next.activeTabId = surface.terminalTabId
    const hasSurface =
      tabs.length > 0 ||
      (next.tabsByWorktree[worktreeId]?.length ?? 0) > 0 ||
      (next.browserTabsByWorktree?.[worktreeId]?.length ?? 0) > 0 ||
      (next.openFilesByWorktree?.[worktreeId]?.length ?? 0) > 0
    if (!hasSurface) {
      next.activeWorktreeId = null
      next.activeWorkspaceKey = null
      next.activeWorkspaceExecutionHostId = null
    }
  }
  return next
}
