import React from 'react'
import { useAppStore } from '@/store'
import { isWorkbenchShell } from './is-workbench-shell'
import { WorkbenchPinnedSection } from './WorkbenchPinnedSection'
import { WorkbenchVersionNav } from './WorkbenchVersionNav'
import { WorkbenchWorkspaceChoiceDialog } from './WorkbenchWorkspaceChoiceDialog'
import { WorkbenchVersionBindingDialog } from './version-tree-bind-dialog'

/**
 * #475 A 定稿：第二列的固定部分只留项目标题；已固定与版本块下移到 Orca 工作区
 * 列表的同一滚动容器里（见 WorkbenchSidebarPinnedVersions），整列只有一个滚动条。
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
 * 已固定 + 版本块。由 Sidebar 作为 WorktreeList 的 scrollPrefix 传入，与 Orca 项目
 * 工作区列表共享同一个滚动容器（#475 单一滚动条）。
 */
export function WorkbenchSidebarPinnedVersions(): React.JSX.Element {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 px-2 pb-1" data-workbench-scroll-prefix>
      <WorkbenchPinnedSection />
      <WorkbenchVersionNav />
    </div>
  )
}
