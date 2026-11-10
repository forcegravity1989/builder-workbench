import { describe, expect, it } from 'vitest'
import type { RuntimeMobileSessionTabsResult } from '../../../../shared/runtime-types'
import { projectSessionTabFileHosts } from './session-tab-file-host-projection'

describe('projectSessionTabFileHosts', () => {
  it('removes hosted browser rows from runtime peers and repairs active group and layout', () => {
    const source = makeSnapshot()
    const projected = projectSessionTabFileHosts(source, 'runtime')
    expect(projected.tabs).toEqual([expect.objectContaining({ id: 'terminal-leaf', isActive: true })])
    expect(projected.activeTabId).toBe('terminal-leaf')
    expect(projected.activeTabType).toBe('terminal')
    expect(projected.activeGroupId).toBe('group-terminal')
    expect(projected.tabGroups?.map(group => group.id)).toEqual(['group-terminal'])
    expect(projected.tabGroupLayout).toEqual({ type: 'leaf', groupId: 'group-terminal' })
    expect(source).toEqual(makeSnapshot())
  })

  it('retains hosted browser rows for mobile while stripping private routing metadata', () => {
    const source = makeSnapshot()
    const projected = projectSessionTabFileHosts(source, 'mobile')
    expect(projected.tabs.map(tab => tab.id)).toEqual(['terminal-leaf', 'page-client'])
    expect(projected.activeTabId).toBe('page-client')
    expect(projected.tabs.every(tab => !('hostRuntimeEnvironmentId' in tab))).toBe(true)
    expect(projected.tabGroups).toEqual(source.tabGroups)
    expect(projected.tabGroupLayout).toEqual(source.tabGroupLayout)
    expect(source).toEqual(makeSnapshot())
  })
})

function makeSnapshot(): RuntimeMobileSessionTabsResult {
  return {
    worktree: 'wt-1',
    publicationEpoch: 'epoch-1',
    snapshotVersion: 1,
    activeGroupId: 'group-browser',
    activeTabId: 'page-client',
    activeTabType: 'browser',
    tabGroups: [
      {
        id: 'group-terminal',
        activeTabId: 'terminal-parent',
        tabOrder: ['terminal-parent'],
        recentTabIds: ['terminal-parent']
      },
      {
        id: 'group-browser',
        activeTabId: 'page-client',
        tabOrder: ['page-client'],
        recentTabIds: ['page-client']
      }
    ],
    tabGroupLayout: {
      type: 'split',
      direction: 'horizontal',
      first: { type: 'leaf', groupId: 'group-terminal' },
      second: { type: 'leaf', groupId: 'group-browser' }
    },
    tabs: [
      {
        type: 'terminal',
        id: 'terminal-leaf',
        parentTabId: 'terminal-parent',
        leafId: 'leaf-1',
        title: 'Terminal',
        isActive: false,
        status: 'ready',
        terminal: 'term-1'
      },
      {
        type: 'browser',
        id: 'page-client',
        title: 'Browser',
        browserWorkspaceId: 'page-client',
        browserPageId: 'page-client',
        url: 'about:blank',
        loading: false,
        canGoBack: false,
        canGoForward: false,
        hostRuntimeEnvironmentId: 'server-a',
        isActive: true
      }
    ]
  }
}
