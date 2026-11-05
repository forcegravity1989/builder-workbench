import { folderWorkspaceKey } from '../../../../../../shared/workspace-scope'
import type { addHostSectionRows } from '../../host-section-rows'

export function collectRenderedSidebarRowKeys(sectionRows: ReturnType<typeof addHostSectionRows>) {
  const keys = new Set<string>()
  for (const row of sectionRows) {
    if (row.type === 'header') {
      keys.add(row.key)
    } else if (row.type === 'item') {
      keys.add(row.rowKey)
    } else if (row.type === 'folder-workspace') {
      keys.add(folderWorkspaceKey(row.folderWorkspace.id))
    } else if (row.type === 'pending-creation') {
      keys.add(`pending:${row.creationId}`)
    } else if (row.type === 'imported-worktrees-card') {
      keys.add(row.key)
    } else if (row.type === 'new-external-worktrees-inbox') {
      keys.add(row.key)
    }
  }
  return keys
}
