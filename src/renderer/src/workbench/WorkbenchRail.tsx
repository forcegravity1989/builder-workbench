import React from 'react'
import {
  BookOpen,
  CalendarClock,
  LayoutDashboard,
  LayoutGrid,
  ListTodo,
  PackageCheck
} from 'lucide-react'
import { useAppStore } from '@/store'
import { cn } from '@/lib/utils'
import { getTaskEligibleRepos } from '@/components/task-page-default-repo-selection'
import { SidebarSettingsHelpMenu } from '@/components/sidebar/SidebarSettingsHelpMenu'
import { TooltipProvider } from '@/components/ui/tooltip'
import { isWorkbenchShell } from './is-workbench-shell'
import { closeProjectPage, openProjectWall, useProjectPage } from './project-page-state'
import { useWorkbenchObjectContext } from './workbench-object-context'

// #475 A 定稿：窄 Rail（64px）承载全局入口，第二列只留对象上下文。
// 入口命名与图标沿用既有 BW 导航；项目墙按钮图标化，不再显示项目首字母。

type RailEntry = {
  id: string
  label: string
  icon: typeof LayoutDashboard
  active: boolean
  onSelect: () => void
}

function RailButton({ entry }: { entry: RailEntry }): React.JSX.Element {
  const Icon = entry.icon
  return (
    <button
      type="button"
      onClick={entry.onSelect}
      aria-label={entry.label}
      aria-current={entry.active ? 'page' : undefined}
      title={entry.label}
      className={cn(
        'relative grid size-10 place-items-center rounded-lg transition-colors',
        entry.active
          ? 'bg-worktree-sidebar-accent text-worktree-sidebar-foreground'
          : 'text-worktree-sidebar-foreground/60 hover:bg-worktree-sidebar-accent'
      )}
    >
      {entry.active ? (
        <span
          aria-hidden
          className="absolute top-2.5 -left-3 bottom-2.5 w-0.5 rounded-full bg-worktree-sidebar-foreground"
        />
      ) : null}
      <Icon className="size-4.5" strokeWidth={entry.active ? 2.25 : 1.75} />
    </button>
  )
}

export function WorkbenchRail(): React.JSX.Element | null {
  const activeView = useAppStore((s) => s.activeView)
  const repos = useAppStore((s) => s.repos)
  const activeRepoId = useAppStore((s) => s.activeRepoId ?? s.repos[0]?.id ?? null)
  const taskScope = useAppStore((s) => s.taskPageData.workbenchTaskScope ?? null)
  const openActivityPage = useAppStore((s) => s.openActivityPage)
  const openAutomationsPage = useAppStore((s) => s.openAutomationsPage)
  const openSpacePage = useAppStore((s) => s.openSpacePage)
  const openTaskPage = useAppStore((s) => s.openTaskPage)
  const setActiveView = useAppStore((s) => s.setActiveView)
  const projectPage = useProjectPage()
  const objectContext = useWorkbenchObjectContext()

  if (!isWorkbenchShell()) {
    return null
  }

  const leaveProjectPage =
    (navigate: () => void): (() => void) =>
    () => {
      closeProjectPage()
      navigate()
    }

  const openProjectTasks = (): void => {
    closeProjectPage()
    const repoId =
      activeRepoId && getTaskEligibleRepos(repos).some((repo) => repo.id === activeRepoId)
        ? activeRepoId
        : null
    if (repoId) {
      openTaskPage({ preselectedRepoId: repoId })
    } else {
      openTaskPage()
    }
  }

  const enterObjectContext = (): void => {
    if (objectContext) {
      return
    }
    closeProjectPage()
    setActiveView('terminal')
  }

  const entries: RailEntry[] = [
    {
      id: 'version-workspace',
      label: '版本工作区',
      icon: PackageCheck,
      active: objectContext,
      onSelect: enterObjectContext
    },
    {
      id: 'overview',
      label: '项目总览',
      icon: LayoutDashboard,
      active: activeView === 'activity' && projectPage === null,
      onSelect: leaveProjectPage(openActivityPage)
    },
    {
      id: 'tasks',
      label: '任务',
      icon: ListTodo,
      active: activeView === 'tasks' && !taskScope?.version,
      onSelect: openProjectTasks
    },
    {
      id: 'automations',
      label: '自动化',
      icon: CalendarClock,
      active: activeView === 'automations',
      onSelect: leaveProjectPage(openAutomationsPage)
    },
    {
      id: 'knowledge',
      label: '知识库',
      icon: BookOpen,
      active: activeView === 'space',
      onSelect: leaveProjectPage(openSpacePage)
    }
  ]

  return (
    <aside
      aria-label="Workbench 导航"
      className="flex w-16 shrink-0 flex-col items-center border-r border-worktree-sidebar-border bg-worktree-sidebar py-2.5"
      data-workbench-rail
    >
      <button
        type="button"
        onClick={() => openProjectWall()}
        aria-label="项目墙"
        aria-current={projectPage?.kind === 'wall' ? 'page' : undefined}
        title="项目墙"
        className="mb-1 grid size-9 place-items-center rounded-[9px] bg-foreground text-background"
      >
        <LayoutGrid className="size-4" strokeWidth={2} />
      </button>
      <nav
        aria-label="Workbench 导航"
        className="flex w-full flex-col items-center gap-1 border-t border-worktree-sidebar-border pt-2"
      >
        {entries.map((entry) => (
          <RailButton key={entry.id} entry={entry} />
        ))}
      </nav>
      <div className="flex-1" />
      <TooltipProvider delayDuration={400}>
        <div className="flex flex-col items-center gap-0.5 [&>div]:flex-col">
          <SidebarSettingsHelpMenu />
        </div>
      </TooltipProvider>
    </aside>
  )
}
