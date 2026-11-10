import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTabsSliceMockApi } from './tabs-slice-test-harness'
import { createTestStore } from './store-test-helpers'

createTabsSliceMockApi()
const worktreeId = 'repo1::/tmp/feature'

describe('browser placement through the existing tab owner', () => {
  let store: ReturnType<typeof createTestStore>
  beforeEach(() => {
    store = createTestStore()
  })

  it('creates a visible background split without replacing the selected pane', () => {
    const source = store.getState().createUnifiedTab(worktreeId, 'terminal')
    const record = vi.fn()
    store.setState({ recordFeatureInteraction: record })
    const page = store.getState().createUnifiedTab(worktreeId, 'browser', {
      entityId: 'page',
      activate: false,
      split: { sourceGroupId: source.groupId, splitDirection: 'right', activate: false }
    })
    const state = store.getState()
    expect(state.layoutByWorktree[worktreeId]).toMatchObject({
      type: 'split',
      direction: 'horizontal',
      first: { groupId: source.groupId },
      second: { groupId: page.groupId }
    })
    expect(state.activeGroupIdByWorktree[worktreeId]).toBe(source.groupId)
    expect(
      state.groupsByWorktree[worktreeId].find((group) => group.id === page.groupId)?.activeTabId
    ).toBe(page.id)
    expect(page.lastFocusedAt).toBeUndefined()
    expect(record.mock.calls.map(([event]) => event)).toEqual(['terminal-tabs', 'tab-splits'])
  })

  it('inserts after the clicked tab in its pane while retaining selection and pin order', () => {
    const pinned = store
      .getState()
      .createUnifiedTab(worktreeId, 'browser', { isPinned: true, executionHostId: 'local' })
    const anchor = store
      .getState()
      .createUnifiedTab(worktreeId, 'browser', { executionHostId: 'local' })
    const tail = store
      .getState()
      .createUnifiedTab(worktreeId, 'browser', { executionHostId: 'local' })
    const groupId = store.getState().createEmptySplitGroup(worktreeId, anchor.groupId, 'right')!
    const selected = store
      .getState()
      .createUnifiedTab(worktreeId, 'terminal', { targetGroupId: groupId })
    const page = store.getState().createUnifiedTab(worktreeId, 'browser', {
      afterTabId: anchor.id,
      executionHostId: 'local',
      activate: false,
      showInGroup: true
    })
    const state = store.getState()
    const sourceGroup = state.groupsByWorktree[worktreeId].find(
      (group) => group.id === anchor.groupId
    )!
    expect(sourceGroup.tabOrder).toEqual([pinned.id, anchor.id, page.id, tail.id])
    expect(sourceGroup.activeTabId).toBe(page.id)
    expect(sourceGroup.recentTabIds).not.toContain(page.id)
    expect(state.activeGroupIdByWorktree[worktreeId]).toBe(selected.groupId)
    expect(page.lastFocusedAt).toBeUndefined()
  })

  it('refuses stale placement without publishing tabs, split groups or interactions', () => {
    const source = store.getState().createUnifiedTab(worktreeId, 'terminal')
    const record = vi.fn()
    store.setState({ recordFeatureInteraction: record })
    const before = store.getState()
    expect(() =>
      store.getState().createUnifiedTab(worktreeId, 'browser', {
        split: { sourceGroupId: source.groupId, splitDirection: 'right' },
        validatePlacement: () => {
          throw new Error('Source changed')
        }
      })
    ).toThrow('Source changed')
    expect(store.getState()).toBe(before)
    expect(record).not.toHaveBeenCalled()
    for (const sourceGroupId of ['removed-group', source.groupId]) {
      if (sourceGroupId === source.groupId) {
        store.setState({
          layoutByWorktree: { [worktreeId]: { type: 'leaf', groupId: 'other-group' } }
        })
      }
      const unchanged = store.getState()
      expect(() =>
        store.getState().createUnifiedTab(worktreeId, 'browser', {
          split: { sourceGroupId, splitDirection: 'right' }
        })
      ).toThrow('The split source group is no longer available.')
      expect(store.getState()).toBe(unchanged)
      expect(record).not.toHaveBeenCalled()
    }
  })
})
