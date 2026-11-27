import { describe, expect, it } from 'vitest'
import { normalizeWorkspaceLinkedItem } from './workspace-attachments/workspace-linked-item'
import { WorkspaceLinkedItemSchema } from './workspace-attachments/workspace-linked-item-schema'

import { WorkspaceAttachmentSchema } from './workspace-attachments/workspace-attachment-schema'
import {
  getWorkspaceReferenceIdentity,
  parseWorkspaceReferenceUrl
} from './workspace-attachments/workspace-reference-identity'

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
    expect(WorkspaceAttachmentSchema.parse(codehubIssue)).toEqual(codehubIssue)
    const link = parseWorkspaceReferenceUrl(
      'https://codehub.example/team/subgroup/app/-/merge_requests/42'
    )
    expect(link).toEqual({
      provider: 'codehub',
      type: 'mr',
      number: 42,
      url: 'https://codehub.example/team/subgroup/app/merge_requests/42'
    })
    const stored = WorkspaceAttachmentSchema.parse({
      ...link,
      url: undefined,
      taskSourceContext: {
        kind: 'task-source',
        provider: 'codehub',
        projectId: 'project-1',
        hostId: 'local',
        providerIdentity: {
          provider: 'codehub',
          host: 'codehub.example',
          project: 'team/subgroup/app'
        }
      }
    })
    expect(getWorkspaceReferenceIdentity(stored)).toBe(getWorkspaceReferenceIdentity(link))
  })
})
