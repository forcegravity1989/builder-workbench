import { describe, expect, it } from 'vitest'
import type { WorkspaceSessionState } from '../../../../shared/workspace-session-state-types'
import { LOCAL_EXECUTION_HOST_ID } from '../../../../shared/execution-host'
import {
  findSavedBrowserPage,
  withClosedServeBrowserTab,
  withOpenedServeBrowserTab
} from './serve-browser-tab-layout'

const hostId = LOCAL_EXECUTION_HOST_ID
function emptySession(): WorkspaceSessionState {
  return {
    activeRepoId: 'repo',
    activeWorktreeId: 'worktree',
    activeTabId: null,
    tabsByWorktree: {},
    terminalLayoutsByTabId: {}
  }
}
function open(
  session: WorkspaceSessionState,
  pageId: string,
  groupId?: string
): WorkspaceSessionState {
  return withOpenedServeBrowserTab(hostId, session, {
    worktreeId: 'worktree',
    pageId,
    groupId,
    profileId: 'profile-private',
    url: `https://example.com/${pageId}`,
    title: pageId
  })!
}

describe('headless browser persistence on the desktop session owner', () => {
  it('preserves the host selection when background pages are saved and restored', () => {
    const base = open(emptySession(), 'first')
    const group = base.tabGroups!.worktree[0]
    group.activeTabId = 'first'
    group.recentTabIds = ['first']
    base.activeGroupIdByWorktree = { worktree: group.id }
    base.activeBrowserTabIdByWorktree = { worktree: 'first' }
    base.activeTabTypeByWorktree = { worktree: 'browser' }
    const reopened: WorkspaceSessionState = JSON.parse(JSON.stringify(open(base, 'background')))
    expect(reopened.activeBrowserTabIdByWorktree).toEqual({ worktree: 'first' })
    expect(reopened.activeTabTypeByWorktree).toEqual(base.activeTabTypeByWorktree)
    expect(reopened.tabGroups!.worktree[0]).toMatchObject({
      activeTabId: 'first',
      recentTabIds: ['first']
    })
    expect(findSavedBrowserPage(reopened, 'worktree', 'background')?.page.url).toBe(
      'https://example.com/background'
    )
    expect(reopened.browserTabsByWorktree!.worktree[1].sessionProfileId).toBe('profile-private')
    expect(reopened.unifiedTabs!.worktree[1].sortOrder).toBe(1)
  })

  it('closes a distinct saved tab ID and focuses the adjacent split group', () => {
    let session = emptySession()
    for (const id of ['a', 'b', 'c']) {
      session.tabGroups = {
        worktree: [
          ...(session.tabGroups?.worktree ?? []),
          {
            id,
            worktreeId: 'worktree',
            activeTabId: null,
            tabOrder: []
          }
        ]
      }
      session = open(session, `page-${id}`, id)
    }
    session.tabGroups!.worktree.forEach((group) => {
      group.activeTabId = group.tabOrder[0]
      group.recentTabIds = [...group.tabOrder]
    })
    const tab = session.unifiedTabs!.worktree.find((entry) => entry.entityId === 'page-b')!
    tab.id = 'window-tab-b'
    session.tabGroups!.worktree[1] = {
      ...session.tabGroups!.worktree[1],
      activeTabId: tab.id,
      tabOrder: [tab.id],
      recentTabIds: [tab.id]
    }
    session.activeGroupIdByWorktree = { worktree: 'b' }
    session.activeBrowserTabIdByWorktree = { worktree: 'page-b' }
    session.tabGroupLayouts = {
      worktree: {
        type: 'split',
        direction: 'horizontal',
        first: { type: 'leaf', groupId: 'a' },
        second: {
          type: 'split',
          direction: 'vertical',
          first: { type: 'leaf', groupId: 'b' },
          second: { type: 'leaf', groupId: 'c' }
        }
      }
    }
    const result = withClosedServeBrowserTab(hostId, session, 'worktree', 'page-b')!
    expect(result.activeGroupIdByWorktree!.worktree).toBe('c')
    expect(result.activeBrowserTabIdByWorktree!.worktree).toBe('page-c')
    expect(result.unifiedTabs!.worktree.map((entry) => entry.id)).toEqual(['page-a', 'page-c'])
    expect(result.browserPagesByWorkspace).not.toHaveProperty('page-b')
    expect(result.tabGroupLayouts!.worktree).toMatchObject({
      second: { type: 'leaf', groupId: 'c' }
    })
  })

  it('clears only an empty active workspace when its last browser surface closes', () => {
    const session = open(emptySession(), 'last')
    session.activeWorkspaceExecutionHostId = hostId
    session.browserUrlHistory = [
      {
        url: 'https://example.com',
        normalizedUrl: 'https://example.com/',
        title: 'History',
        lastVisitedAt: 1,
        visitCount: 1
      }
    ]
    const result = withClosedServeBrowserTab(hostId, session, 'worktree', 'last')!
    expect(result).toMatchObject({
      activeWorktreeId: null,
      activeWorkspaceKey: null,
      activeWorkspaceExecutionHostId: null
    })
    expect(result.browserUrlHistory).toEqual(session.browserUrlHistory)
    const otherActive = { ...session, activeWorktreeId: 'other' }
    expect(
      withClosedServeBrowserTab(hostId, otherActive, 'worktree', 'last')!.activeWorktreeId
    ).toBe('other')
    const editorStillOpen = {
      ...session,
      openFilesByWorktree: {
        worktree: [
          {
            filePath: '/repo/readme.md',
            relativePath: 'readme.md',
            worktreeId: 'worktree',
            language: 'markdown'
          }
        ]
      }
    }
    expect(
      withClosedServeBrowserTab(hostId, editorStillOpen, 'worktree', 'last')!.activeWorktreeId
    ).toBe('worktree')
  })
})
