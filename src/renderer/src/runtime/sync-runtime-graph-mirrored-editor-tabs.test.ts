import { expect, it } from 'vitest'
import type { AppState } from '../store/types'
import { buildMobileSessionTabSnapshots } from './sync-runtime-graph'
import { makeState } from './sync-runtime-graph-test-harness'

it('does not republish host-mirrored editors through groups or either fallback', () => {
  const localFile = {
    id: 'local-file',
    filePath: '/repo/src/local.ts',
    relativePath: 'src/local.ts',
    worktreeId: 'wt-1',
    language: 'typescript',
    mode: 'edit',
    isDirty: false
  } satisfies AppState['openFiles'][number]
  const userOpenedRemoteFile = {
    ...localFile,
    id: 'user-opened-remote-file',
    filePath: '/repo/src/remote.ts',
    relativePath: 'src/remote.ts',
    runtimeEnvironmentId: 'host-a'
  }

  for (const surface of [
    { language: 'typescript', mode: 'edit' },
    { language: 'markdown', mode: 'edit' },
    { language: 'markdown', mode: 'markdown-preview' }
  ] as const) {
    const mirroredFiles = ['grouped', 'fallback', 'orphan'].map((id) => ({
      ...localFile,
      ...surface,
      id,
      filePath: `/repo/${id}/SKILL.md`,
      relativePath: `${id}/SKILL.md`,
      runtimeEnvironmentId: 'host-a',
      mirroredFromRuntimeSession: true
    }))
    const state = makeState({
      openFiles: [localFile, userOpenedRemoteFile, ...mirroredFiles],
      activeFileIdByWorktree: { 'wt-1': 'grouped' },
      activeTabTypeByWorktree: { 'wt-1': 'editor' },
      activeGroupIdByWorktree: { 'wt-1': 'mirror-group' },
      unifiedTabsByWorktree: {
        'wt-1': [
          ['local-tab', 'local-file', 'local-group'],
          ['remote-tab', 'user-opened-remote-file', 'local-group'],
          ['grouped-tab', 'grouped', 'mirror-group'],
          ['fallback-tab', 'fallback', 'mirror-group']
        ].map(([id, entityId, groupId]) => ({
          id,
          entityId,
          groupId,
          worktreeId: 'wt-1',
          contentType: 'editor',
          label: entityId,
          customLabel: null,
          color: null,
          sortOrder: 0,
          createdAt: 0,
          isPreview: false
        }))
      },
      groupsByWorktree: {
        'wt-1': [
          {
            id: 'local-group',
            worktreeId: 'wt-1',
            activeTabId: 'local-tab',
            tabOrder: ['local-tab', 'remote-tab']
          },
          {
            id: 'mirror-group',
            worktreeId: 'wt-1',
            activeTabId: 'grouped-tab',
            tabOrder: ['grouped-tab'],
            recentTabIds: ['grouped-tab', 'fallback-tab']
          }
        ]
      },
      layoutByWorktree: {
        'wt-1': {
          type: 'split',
          direction: 'horizontal',
          first: { type: 'leaf', groupId: 'local-group' },
          second: { type: 'leaf', groupId: 'mirror-group' }
        }
      }
    })

    const snapshot = buildMobileSessionTabSnapshots(state)[0]

    expect(snapshot?.tabs.map((tab) => tab.id)).toEqual(['local-tab', 'remote-tab'])
    expect(snapshot?.activeTabId).toBeNull()
    expect(snapshot?.tabGroups).toMatchObject([
      { id: 'local-group', tabOrder: ['local-tab', 'remote-tab'] }
    ])
    expect(snapshot?.tabGroupLayout).toEqual({ type: 'leaf', groupId: 'local-group' })
  }
})
