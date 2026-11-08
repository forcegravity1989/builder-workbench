import React, { useMemo } from 'react'
import { useAppStore } from '@/store'
import { isWorkbenchShell } from './is-workbench-shell'
import { FolderGit2 } from 'lucide-react'
import type { Worktree } from '../../../shared/worktree/types'
import { VersionTreeDisplayContext } from './VersionNativeTrees'
import { WorkbenchSidebarSectionHeader } from './WorkbenchSidebarSectionHeader'
import { WorkbenchVersionNav } from './WorkbenchVersionNav'
import { WorkbenchWorkspaceChoiceDialog } from './WorkbenchWorkspaceChoiceDialog'
import { WorkbenchVersionBindingDialog } from './version-tree-bind-dialog'

/**
 * Project identity stays above the native toolbar; tree sections share the native scroller.
 */
export function WorkbenchSidebarNav(): React.JSX.Element | null {
  const projectName = useAppStore((s) => {
    const active = s.activeRepoId ?? s.repos[0]?.id ?? null
    return s.repos.find((repo) => repo.id === active)?.displayName?.trim() || null
  })

  if (!isWorkbenchShell()) {
    return null
  }

  return (
    <div className="wb-nav flex min-w-0 shrink-0 flex-col px-2 pt-2" data-workbench-nav>
      <div className="wb-proj flex shrink-0 items-center gap-2 px-2 py-2" data-workbench-project>
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[var(--color-accent)] text-xs font-semibold text-white">
          {(projectName ?? '项目墙').slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold tracking-tight text-worktree-sidebar-foreground">
            {projectName ?? '项目墙'}
          </span>
          <span className="block truncate text-[10px] tracking-tight text-worktree-sidebar-foreground/55">
            当前项目
          </span>
        </span>
      </div>

      {/* G2 多候选工作区选择器挂在侧栏层：任务屏、侧栏目标菜单与流程行在任意
          视图触发选择时都可见（Radix portal，不受侧栏布局裁剪）。 */}
      <WorkbenchWorkspaceChoiceDialog />
      <WorkbenchVersionBindingDialog />
    </div>
  )
}

/**
 * Only the business directory is inserted between native Pinned and native project groups.
 */
export function WorkbenchSidebarVersions({
  visibleWorktrees,
  sortedIds
}: {
  visibleWorktrees: readonly Worktree[]
  sortedIds: readonly string[]
}): React.JSX.Element {
  const display = useMemo(() => ({ visibleWorktrees, sortedIds }), [visibleWorktrees, sortedIds])
  return (
    <VersionTreeDisplayContext.Provider value={display}>
      <div className="flex min-w-0 flex-col gap-1 pb-1" data-workbench-version-section>
        <WorkbenchVersionNav />
        <WorkbenchSidebarSectionHeader icon={FolderGit2}>
          全部项目工作区
        </WorkbenchSidebarSectionHeader>
      </div>
    </VersionTreeDisplayContext.Provider>
  )
}
