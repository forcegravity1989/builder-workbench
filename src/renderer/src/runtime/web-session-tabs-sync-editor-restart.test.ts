import { expect, it, vi } from 'vitest'
import { UNPUBLISHED_WORKTREE_PUBLICATION_EPOCH } from '../../../shared/runtime-types'
import { parseWorkspaceSession } from '../../../shared/workspace-session-schema'
import { buildWorkspaceSessionPayload } from '../lib/workspace-session'
import { createStoreSessionMockApi } from '../store/slices/store-session-test-harness'
import { createTestStore, makeWorktree } from '../store/slices/store-test-helpers'
import { buildMobileSessionTabSnapshots } from './sync-runtime-graph/mobile-session-snapshots'
import { applyWebSessionTabsSnapshot } from './web-session-tabs-sync'
import {
  ENV,
  HOST_SURFACE_ID,
  LEAF_ID,
  NOW,
  WT,
  makeSnapshot
} from './web-session-tabs-sync-test-harness'

vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }))
createStoreSessionMockApi()

const mirroredPath = '/worktree/mirror-test.txt'
const cleanMirroredPath = '/worktree/clean-mirror.txt'
const ownPath = '/worktree/opened-by-client.txt'

function createClient() {
  const store = createTestStore()
  store.setState({
    repos: [{ id: 'repo', path: '/worktree', displayName: 'Repo', badgeColor: '#000', addedAt: 0 }],
    worktreesByRepo: { repo: [makeWorktree({ id: WT, repoId: 'repo', path: '/worktree' })] },
    activeWorktreeId: WT
  })
  return store
}

it('does not echo restored mirrors, and host closure retires only the mirror without a local draft', () => {
  const beforeQuit = createClient()
  beforeQuit.setState({
    openFiles: [
      {
        id: ownPath,
        filePath: ownPath,
        relativePath: 'opened-by-client.txt',
        worktreeId: WT,
        language: 'plaintext',
        isDirty: false,
        runtimeEnvironmentId: ENV,
        mode: 'edit'
      }
    ]
  })
  const hostTab = {
    type: 'file' as const,
    id: 'host-editor',
    title: 'mirror-test.txt',
    filePath: mirroredPath,
    relativePath: 'mirror-test.txt',
    language: 'plaintext',
    isDirty: false,
    isActive: true
  }
  const cleanHostTab = {
    ...hostTab,
    id: 'host-clean-editor',
    title: 'clean-mirror.txt',
    filePath: cleanMirroredPath,
    relativePath: 'clean-mirror.txt',
    isActive: false
  }
  const rendererEpoch = 'renderer:1:client-navigation'
  const hostOpen = makeSnapshot([hostTab, cleanHostTab], {
    publicationEpoch: rendererEpoch,
    activeTabId: hostTab.id,
    activeTabType: 'file'
  })
  beforeQuit.setState(applyWebSessionTabsSnapshot(beforeQuit.getState(), hostOpen, ENV, NOW) ?? {})
  beforeQuit.setState((state) => ({
    openFiles: state.openFiles.map((file) =>
      file.filePath === mirroredPath ? { ...file, isDirty: true } : file
    ),
    editorDrafts: { [mirroredPath]: 'unsaved edit from the client' }
  }))

  const persisted = buildWorkspaceSessionPayload(beforeQuit.getState())
  const parsed = parseWorkspaceSession(persisted)
  if (!parsed.ok) {
    throw new Error('Saved editor session failed validation')
  }
  const afterRestart = createClient()
  afterRestart.getState().hydrateTabsSession(parsed.value)
  afterRestart.getState().hydrateEditorSession(parsed.value)

  const publish = () =>
    buildMobileSessionTabSnapshots(afterRestart.getState())
      .find((snapshot) => snapshot.worktree === WT)
      ?.tabs.flatMap((tab) => (tab.type === 'file' ? [tab.filePath] : []))
  expect(publish()).toEqual([ownPath])

  const apply = (snapshot: ReturnType<typeof makeSnapshot>) =>
    afterRestart.setState(
      applyWebSessionTabsSnapshot(afterRestart.getState(), snapshot, ENV, NOW) ?? {}
    )
  const restoredDraft = () =>
    buildWorkspaceSessionPayload(afterRestart.getState()).openFilesByWorktree?.[WT]?.find(
      (file) => file.filePath === mirroredPath
    )?.dirtyDraftContent
  const openPaths = () => afterRestart.getState().openFiles.map((file) => file.filePath)

  const terminal = {
    type: 'terminal' as const,
    id: HOST_SURFACE_ID,
    title: 'Terminal',
    parentTabId: 'host-tab-1',
    leafId: LEAF_ID,
    status: 'pending-handle' as const,
    terminal: null,
    isActive: true
  }
  const partialSnapshots = [
    makeSnapshot([], {
      publicationEpoch: UNPUBLISHED_WORKTREE_PUBLICATION_EPOCH,
      snapshotVersion: 0
    }),
    makeSnapshot([], {
      publicationEpoch: `${UNPUBLISHED_WORKTREE_PUBLICATION_EPOCH}:client-navigation`,
      snapshotVersion: 3
    }),
    makeSnapshot([terminal], { publicationEpoch: 'headless-hydrated:1' }),
    makeSnapshot([terminal], { publicationEpoch: 'renderer-rescue:1' }),
    makeSnapshot(
      [
        {
          type: 'agent-session',
          id: 'agent-session:codex-1',
          sessionId: 'codex-1',
          agent: 'codex',
          title: 'Codex Chat',
          isActive: true
        }
      ],
      { publicationEpoch: 'structured:1', activeTabType: 'agent-session' }
    )
  ]
  for (const partial of partialSnapshots) {
    apply(partial)
    expect(openPaths()).toContain(cleanMirroredPath)
    expect(restoredDraft()).toBe('unsaved edit from the client')
  }

  apply(hostOpen)
  expect(restoredDraft()).toBe('unsaved edit from the client')
  expect(publish()).toEqual([ownPath])

  apply(makeSnapshot([], { publicationEpoch: rendererEpoch, snapshotVersion: 2 }))
  expect(openPaths()).toEqual([ownPath, mirroredPath])
  const visibleTabIds = (afterRestart.getState().unifiedTabsByWorktree[WT] ?? []).map(
    (tab) => tab.id
  )
  expect(visibleTabIds).not.toContain(cleanHostTab.id)
  expect(visibleTabIds).toContain(hostTab.id)
  expect(restoredDraft()).toBe('unsaved edit from the client')
  expect(publish()).toEqual([ownPath])
})
