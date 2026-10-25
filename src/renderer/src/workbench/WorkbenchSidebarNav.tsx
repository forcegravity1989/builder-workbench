import React from 'react'
import { BookOpen, CalendarClock, LayoutDashboard } from 'lucide-react'
import { useAppStore } from '@/store'
import { cn } from '@/lib/utils'
import { isWorkbenchShell } from './is-workbench-shell'
import { closeProjectPage, openProjectWall, useProjectPage } from './project-page-state'
import { useCycleView } from './cycle-view-state'
import { resolveWorkbenchNav, type WorkbenchNavId } from './workbench-nav'
import { WorkbenchVersionNav } from './WorkbenchVersionNav'
import { WorkbenchWorkspaceChoiceDialog } from './WorkbenchWorkspaceChoiceDialog'

// G2（P3a，高保真修订 8）：项目级入口（总览/自动化/知识库）＋分隔＋版本区。
// 计划/验收不再设扁平入口——由版本行承载（业务入口与本树入口合一）；
// 全局「任务」入口经人裁定隐藏（#436：任务经版本区进入，全量任务屏仍由
// 命令面板 view.tasks 可达；SidebarTaskNavButton 的 BW 分支随之休眠，留上游同步时清理）。
const NAV_ITEMS: { id: WorkbenchNavId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: '项目总览', icon: LayoutDashboard },
  { id: 'automations', label: '自动化', icon: CalendarClock },
  { id: 'knowledge', label: '知识库', icon: BookOpen }
]

function WorkbenchNavItem({
  item,
  active,
  onGo
}: {
  item: { id: WorkbenchNavId; label: string; icon: typeof LayoutDashboard }
  active: boolean
  onGo: (id: WorkbenchNavId) => void
}): React.JSX.Element {
  const Icon = item.icon
  return (
    <button
      type="button"
      onClick={() => onGo(item.id)}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] font-medium tracking-tight transition-colors',
        active
          ? 'bg-worktree-sidebar-accent text-worktree-sidebar-accent-foreground'
          : 'text-worktree-sidebar-foreground/60 hover:bg-worktree-sidebar-foreground/8'
      )}
    >
      <Icon
        className={cn('size-4 shrink-0', !active && 'text-worktree-sidebar-foreground/30')}
        strokeWidth={active ? 2.25 : 1.75}
      />
      <span className="flex-1">{item.label}</span>
    </button>
  )
}

/** BW navigation follows the native fixed workspace; ordinary execution has no workflow highlight. */
export function WorkbenchSidebarNav(): React.JSX.Element | null {
  const activeView = useAppStore((s) => s.activeView)
  const projectPage = useProjectPage()
  const activeWorktree = useAppStore((s) =>
    s.activeWorktreeId ? s.getKnownWorktreeById(s.activeWorktreeId) : null
  )
  const openActivityPage = useAppStore((s) => s.openActivityPage)
  const openAutomationsPage = useAppStore((s) => s.openAutomationsPage)
  const openSpacePage = useAppStore((s) => s.openSpacePage)
  const repos = useAppStore((s) => s.repos)
  const activeRepoId = useAppStore((s) => s.activeRepoId ?? s.repos[0]?.id ?? null)
  // Subscribes so version-row highlights follow the shared artifacts slot.
  useCycleView()
  const activeRepo = repos.find((r) => r.id === activeRepoId) ?? repos[0]
  // G3 原型侧栏入口两行:主线当前项目名、副题「项目墙」;无项目可解析时主线直接叫「项目墙」,入口不再退化成产品名。
  const projectName = activeRepo?.displayName?.trim() || null
  const entryName = projectName ?? '项目墙'

  if (!isWorkbenchShell()) {
    return null
  }

  const activeNav = projectPage ? null : resolveWorkbenchNav(activeView, activeWorktree)

  const go = (id: WorkbenchNavId) => {
    if (id === 'overview') {
      openActivityPage()
    } else if (id === 'automations') {
      openAutomationsPage()
    } else {
      openSpacePage()
    }
  }

  return (
    <div className="wb-nav flex flex-col gap-1 px-2 pt-2 pb-1" data-workbench-nav>
      <button
        type="button"
        className="wb-proj flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-worktree-sidebar-foreground/8"
        onClick={() => openProjectWall()}
        title="打开项目墙"
        data-workbench-project-wall
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[var(--color-accent)] text-xs font-semibold text-white">
          {entryName.slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold tracking-tight text-worktree-sidebar-foreground">
            {entryName}
          </span>
          {projectName ? (
            <span className="block truncate text-[10px] tracking-tight text-worktree-sidebar-foreground/55">
              项目墙
            </span>
          ) : null}
        </span>
      </button>

      <nav
        className="flex flex-col gap-0.5"
        aria-label="项目内导航"
        onClickCapture={closeProjectPage}
      >
        {NAV_ITEMS.map((item) => (
          <WorkbenchNavItem key={item.id} item={item} active={activeNav === item.id} onGo={go} />
        ))}
        <WorkbenchVersionNav />
      </nav>
      {/* G2 多候选工作区选择器挂在侧栏层：任务屏、侧栏目标菜单与流程行在任意
          视图触发选择时都可见（Radix portal，不受侧栏布局裁剪）。 */}
      <WorkbenchWorkspaceChoiceDialog />
    </div>
  )
}
