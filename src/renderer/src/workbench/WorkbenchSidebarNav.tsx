import React from 'react'
import { useAppStore } from '@/store'
import { isWorkbenchShell } from './is-workbench-shell'
import { WorkbenchPinnedSection } from './WorkbenchPinnedSection'
import { WorkbenchVersionNav } from './WorkbenchVersionNav'
import { WorkbenchWorkspaceChoiceDialog } from './WorkbenchWorkspaceChoiceDialog'
import { WorkbenchVersionBindingDialog } from './version-tree-bind-dialog'

/**
 * #475 A 定稿：第二列（对象面板）＝项目标题 → 已固定 → 版本块，共用单一滚动容器；
 * Orca 原生项目工作区列表仍在其下（由原生虚拟化视图占用自己的滚动）。
 * 项目墙、项目总览、任务、自动化、知识库入口移入 Rail，不在第二列重复。
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
    <div
      className="wb-nav flex max-h-[65%] min-h-0 min-w-0 shrink flex-col px-2 pt-2 pb-1"
      data-workbench-nav
    >
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

      <div className="worktree-sidebar-scrollbar flex min-h-0 min-w-0 flex-1 flex-col gap-0.5 overflow-x-hidden overflow-y-auto overscroll-contain">
        <WorkbenchPinnedSection />
        <WorkbenchVersionNav />
      </div>

      {/* G2 多候选工作区选择器挂在侧栏层：任务屏、侧栏目标菜单与流程行在任意
          视图触发选择时都可见（Radix portal，不受侧栏布局裁剪）。 */}
      <WorkbenchWorkspaceChoiceDialog />
      <WorkbenchVersionBindingDialog />
    </div>
  )
}
