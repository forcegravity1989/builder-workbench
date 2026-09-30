import { describe, expect, it } from 'vitest'
import { normalizeWorkspaceLinkedItem } from './workspace-linked-item'
import { WorkspaceLinkedItemSchema } from './workspace-linked-item-schema'

const codehubIssue = {
  provider: 'codehub' as const,
  type: 'issue' as const,
  number: 42,
  title: 'Fix the gate',
  url: 'https://codehub.example/team/app/issues/42',
  repoId: 'repo-1'
}

describe('normalizeWorkspaceLinkedItem', () => {
  it('keeps a CodeHub issue so worktree create can link it', () => {
    expect(normalizeWorkspaceLinkedItem(codehubIssue)).toEqual(codehubIssue)
    expect(WorkspaceLinkedItemSchema.parse(codehubIssue)).toEqual(codehubIssue)
  })
})
