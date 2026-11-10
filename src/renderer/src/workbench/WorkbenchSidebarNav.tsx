import React, { useMemo } from 'react'
import { useAppStore } from '@/store'
import { FolderGit2 } from 'lucide-react'
import type { VersionTreeDisplayInput } from './VersionNativeTrees'
import { WorkbenchSidebarSectionHeader } from './WorkbenchSidebarSectionHeader'
import { WorkbenchVersionNav } from './WorkbenchVersionNav'
import { WORKTREE_SIDEBAR_VIRTUAL_ROW_GAP } from '@/components/sidebar/worktree-list/viewport/virtual-rows'
import { useVersionSidebarProjection } from './version-sidebar-state'

/**
 * Project identity stays beside the native toolbar, outside the tree scroller.
 */
export function WorkbenchSidebarNav(): React.JSX.Element {
  const projectName = useAppStore((s) => {
    const active = s.activeRepoId ?? s.repos[0]?.id ?? null
    return s.repos.find((repo) => repo.id === active)?.displayName?.trim() || null
  })

  return (
    <div
      className="flex min-w-0 flex-1 items-center gap-2"
      data-workbench-nav
      data-workbench-project
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[var(--color-accent)] text-xs font-semibold text-white">
        {(projectName ?? '项目墙').slice(0, 1).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className="block truncate text-[13px] font-semibold tracking-tight text-worktree-sidebar-foreground"
          title={projectName ?? undefined}
        >
          {projectName ?? '项目墙'}
        </span>
        <span className="block truncate text-[10px] tracking-tight text-worktree-sidebar-foreground/55">
          当前项目
        </span>
      </span>
    </div>
  )
}

/**
 * Only the business directory is inserted between native Pinned and native project groups.
 */
export function WorkbenchSidebarVersions({
  visibleWorktrees,
  filterOptions,
  sortedIds,
  sortNow
}: VersionTreeDisplayInput): React.JSX.Element {
  const projection = useVersionSidebarProjection()
  const display = useMemo(
    () => ({ visibleWorktrees, filterOptions, sortedIds, sortNow }),
    [visibleWorktrees, filterOptions, sortedIds, sortNow]
  )
  return (
    <div
      className="flex min-w-0 flex-col"
      style={{ rowGap: WORKTREE_SIDEBAR_VIRTUAL_ROW_GAP }}
      data-workbench-version-section
    >
      <WorkbenchVersionNav nativeDisplay={display} />
      <WorkbenchSidebarSectionHeader icon={FolderGit2}>
        {projection.worktreeIdentities.size ? '其他工作区' : '工作区'}
      </WorkbenchSidebarSectionHeader>
    </div>
  )
}
