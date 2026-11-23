import { PINNED_GROUP_KEY, getWorktreeLineageGroupKey } from '../grouping/group-keys'
import type { HostSectionRow } from '../../host-section-rows'
import type { RenderRow } from './render-row'
import type { ReactNode } from 'react'

export type WorktreeItemRow = Extract<HostSectionRow, { type: 'item' }>
export type FolderWorkspaceItemRow = Extract<HostSectionRow, { type: 'folder-workspace' }>

export function isWorktreeItemRow(row: HostSectionRow): row is WorktreeItemRow {
  return row.type === 'item'
}

export function isPinnedWorktreeRow(row: WorktreeItemRow): boolean {
  return row.sectionKey === PINNED_GROUP_KEY
}

// Collapse a parent and its visible lineage descendants into one virtual row so the card renders them inline.
export function buildRenderableRows(
  rows: HostSectionRow[],
  afterPinnedContent?: ReactNode
): RenderRow[] {
  const renderRows: RenderRow[] = []
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index]
    if (
      !isWorktreeItemRow(row) ||
      row.lineageChildCount === 0 ||
      row.lineageCollapsed ||
      rows[index + 1]?.type !== 'item' ||
      (rows[index + 1] as WorktreeItemRow).depth <= row.depth
    ) {
      renderRows.push(row)
      continue
    }

    const groupRows: WorktreeItemRow[] = [row]
    let cursor = index + 1
    while (cursor < rows.length) {
      const child = rows[cursor]
      if (!isWorktreeItemRow(child) || child.depth <= row.depth) {
        break
      }
      groupRows.push(child)
      cursor++
    }
    renderRows.push({
      type: 'lineage-group',
      key: `${row.sectionKey}:${getWorktreeLineageGroupKey(row.worktree)}`,
      rows: groupRows
    })
    index = cursor - 1
  }
  if (afterPinnedContent !== undefined) {
    const pinnedFirst = renderRows[0]?.type === 'header' && renderRows[0].key === PINNED_GROUP_KEY
    const nextSection = pinnedFirst
      ? renderRows.findIndex(
          (row, index) =>
            index > 0 &&
            !(
              (row.type === 'item' && row.sectionKey === PINNED_GROUP_KEY) ||
              (row.type === 'lineage-group' && row.rows[0]?.sectionKey === PINNED_GROUP_KEY) ||
              (row.type === 'imported-worktrees-card' && row.placement === 'pinned-fallback')
            )
        )
      : 0
    renderRows.splice(nextSection < 0 ? renderRows.length : nextSection, 0, {
      type: 'content',
      key: 'after-pinned',
      content: afterPinnedContent
    })
  }
  return renderRows
}
