import { describe, expect, it } from 'vitest'
import type { TaskSourceContext } from '../task-source-context'
import type { WorktreeMeta } from '../worktree/meta-types'
import {
  localizeWorktreeTaskSources,
  projectWorktreeTaskSources
} from './task-source-host-projection'

const source: TaskSourceContext = {
  kind: 'task-source',
  provider: 'github',
  projectId: 'project',
  repoId: 'repo',
  projectHostSetupId: 'repo',
  hostId: 'ssh:server'
}
const metadata: Pick<
  WorktreeMeta,
  'workbenchVersionBinding' | 'linkedTaskSourceContext' | 'linkedItems'
> = {
  workbenchVersionBinding: { schema: 1, version: 'v1', workflow: 'issue', taskSource: source },
  linkedTaskSourceContext: source,
  linkedItems: [
    { provider: 'github', type: 'issue', number: 12, repoId: 'repo', taskSourceContext: source }
  ]
}
const repoIds = new Set(['repo'])

describe('owner-relative task source persistence', () => {
  it('moves SSH bindings and attachments together and reads them through either client identity', () => {
    const owner = localizeWorktreeTaskSources(metadata, 'ssh:server', repoIds)
    for (const client of ['runtime:alice', 'runtime:bob'] as const) {
      const visible = projectWorktreeTaskSources(owner, 'local', client, repoIds)
      expect(visible.workbenchVersionBinding?.taskSource?.hostId).toBe(client)
      expect(visible.linkedTaskSourceContext?.hostId).toBe(client)
      expect(visible.linkedItems?.[0].taskSourceContext?.hostId).toBe(client)
      const mutation = { ...visible, linkedItemsBase: visible.linkedItems }
      const persisted = localizeWorktreeTaskSources(mutation, client, repoIds)
      expect(persisted.linkedItemsBase).toEqual(owner.linkedItems)
      expect(persisted.workbenchVersionBinding).toEqual(owner.workbenchVersionBinding)
    }
    expect(metadata.linkedTaskSourceContext?.hostId).toBe('ssh:server')
  })
  it('preserves foreign owners, foreign repos and unidentified legacy sources without guessing', () => {
    for (const context of [
      { ...source, hostId: 'runtime:someone-else' as const },
      { ...source, repoId: 'other' },
      { ...source, repoId: undefined }
    ]) {
      const value = {
        ...metadata,
        linkedTaskSourceContext: context,
        workbenchVersionBinding: { ...metadata.workbenchVersionBinding!, taskSource: context },
        linkedItems: [{ ...metadata.linkedItems![0], taskSourceContext: context }]
      }
      expect(projectWorktreeTaskSources(value, 'ssh:server', 'local', repoIds)).toBe(value)
    }
  })
  it('refuses ambiguous local sources before export or remote writes', () => {
    const local = { ...metadata, linkedTaskSourceContext: { ...source, hostId: 'local' as const } }
    for (const host of ['ssh:server', 'runtime:alice'] as const) {
      expect(() => localizeWorktreeTaskSources(local, host, repoIds)).toThrow(
        'desktop-local task source'
      )
    }
    expect(() => localizeWorktreeTaskSources(local, 'local', new Set(['other']))).toThrow(
      'desktop-local task source'
    )
    expect(local.linkedTaskSourceContext.hostId).toBe('local')
  })
  it('preserves clears, empty fields and non-Issue version bindings', () => {
    for (const value of [
      {},
      { workbenchVersionBinding: null, linkedTaskSourceContext: null, linkedItems: [] },
      { workbenchVersionBinding: { schema: 1 as const, version: 'v1', workflow: 'plan' as const } }
    ]) {
      expect(projectWorktreeTaskSources(value, 'runtime:alice', 'local', repoIds)).toBe(value)
    }
  })
})
