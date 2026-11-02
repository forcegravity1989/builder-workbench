import { beforeEach, expect, it, vi } from 'vitest'
import { makeState as makePublicationState } from './sync-runtime-graph-test-harness'
import {
  NOW,
  WT,
  makeState,
  makeSnapshot,
  resetWebSessionTabsSyncTestState
} from './web-session-tabs-sync-test-harness'
import { applyWebSessionTabsSnapshot } from './web-session-tabs-sync/snapshot-api'
import { buildMobileSessionTabSnapshots } from './sync-runtime-graph/mobile-session-snapshots'
import { buildBrowserPage, buildWorkspaceFromPage } from '../store/slices/browser-page-records'

vi.mock('../store', () => ({ useAppStore: { setState: vi.fn() } }))

beforeEach(resetWebSessionTabsSyncTestState)

it('does not republish a peer browser mirror or replace the original page on a reciprocal connection', () => {
  const page = buildBrowserPage(
    'workspace-browser-a',
    WT,
    'file:///D:/project/review.html',
    'Review',
    null,
    'page-a'
  )
  const workspace = buildWorkspaceFromPage('workspace-browser-a', WT, page, [page.id])
  const originalState = makePublicationState({
    ...makeState(),
    browserTabsByWorktree: { [WT]: [workspace] },
    browserPagesByWorkspace: { [workspace.id]: [page] },
    unifiedTabsByWorktree: {
      [WT]: [
        {
          id: 'browser-tab-a',
          entityId: workspace.id,
          contentType: 'browser',
          worktreeId: WT,
          groupId: 'group-a',
          label: 'Review',
          customLabel: null,
          color: null,
          sortOrder: 0,
          isPinned: false,
          createdAt: NOW
        }
      ]
    },
    groupsByWorktree: {
      [WT]: [
        { id: 'group-a', worktreeId: WT, activeTabId: 'browser-tab-a', tabOrder: ['browser-tab-a'] }
      ]
    },
    layoutByWorktree: { [WT]: { type: 'leaf', groupId: 'group-a' } },
    activeGroupIdByWorktree: { [WT]: 'group-a' },
    activeBrowserTabIdByWorktree: { [WT]: workspace.id }
  })
  const outbound = buildMobileSessionTabSnapshots(originalState, false).find(
    (s) => s.worktree === WT
  )!
  const peerState = makeState()
  const peer = makePublicationState({
    ...peerState,
    ...applyWebSessionTabsSnapshot(
      peerState,
      makeSnapshot(outbound.tabs, outbound),
      'connection-to-a',
      NOW
    )
  })
  const echoed = buildMobileSessionTabSnapshots(peer, false).find((s) => s.worktree === WT)!
  const returned = {
    ...originalState,
    ...applyWebSessionTabsSnapshot(
      originalState,
      makeSnapshot(echoed.tabs, { ...echoed, publicationEpoch: 'peer-b', snapshotVersion: 1 }),
      'connection-to-b',
      NOW + 1
    )
  }
  expect(peer.remoteBrowserPageHandlesByPageId[page.id]).toMatchObject({
    environmentId: 'connection-to-a',
    remotePageId: page.id
  })
  expect(echoed.tabs.filter((t) => t.type === 'browser')).toEqual([])
  expect(echoed.tabGroups?.flatMap((group) => group.tabOrder) ?? []).not.toContain('browser-tab-a')
  expect(
    returned.browserPagesByWorkspace[workspace.id]?.[0]?.browserRuntimeEnvironmentId
  ).toBeNull()
  expect(returned.remoteBrowserPageHandlesByPageId[page.id]).toBeUndefined()
})
