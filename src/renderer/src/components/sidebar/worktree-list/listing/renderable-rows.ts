import { PINNED_GROUP_KEY } from '../../../../../../shared/sidebar-list/sections/group-keys'
import type { HostSectionRow } from '../../../../../../shared/sidebar-list/hosts/host-section-rows'
import type { RenderRow } from './render-row'

export type WorktreeItemRow = Extract<HostSectionRow, { type: 'item' }>
export type FolderWorkspaceItemRow = Extract<HostSectionRow, { type: 'folder-workspace' }>

export function isWorktreeItemRow(row: HostSectionRow): row is WorktreeItemRow {
  return row.type === 'item'
}

export function isPinnedWorktreeRow(row: WorktreeItemRow): boolean {
  return row.sectionKey === PINNED_GROUP_KEY
}

// Each visible workspace owns a measured virtual slot, including expanded descendants.
export function buildRenderableRows(
  rows: HostSectionRow[],
  showWorkbenchVersions = false
): RenderRow[] {
  if (!showWorkbenchVersions) {
    return rows
  }
  const pinned = rows[0]?.type === 'header' && rows[0].key === PINNED_GROUP_KEY
  const end = pinned
    ? rows.findIndex(
        (row, index) => index > 0 && !(row.type === 'item' && isPinnedWorktreeRow(row))
      )
    : 0
  const index = end === -1 ? rows.length : end
  return [...rows.slice(0, index), { type: 'workbench-versions' }, ...rows.slice(index)]
}
