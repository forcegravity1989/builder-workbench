import React from 'react'
import { BookOpen, CalendarClock, LayoutDashboard, LayoutGrid, PackageCheck } from 'lucide-react'
import { useAppStore } from '@/store'
import { cn } from '@/lib/utils'
import { SidebarSettingsHelpMenu } from '@/components/sidebar/SidebarSettingsHelpMenu'
import { SshStatusSegment } from '@/components/status-bar/SshStatusSegment'
import { SidebarTaskNavButton } from '@/components/sidebar/SidebarTaskNavButton'
import { TooltipProvider } from '@/components/ui/tooltip'
import { isWorkbenchShell } from './is-workbench-shell'
import { closeProjectPage, openProjectWall, useProjectPage } from './project-page-state'
import { useWorkbenchObjectContext } from './workbench-object-context'
import { applyProjectSourcePair } from './switch-active-project'
import { resolveProjectSourcePair, type ProjectSourcePolicy } from './project-source-resolution'

export const WORKBENCH_RAIL_WIDTH = 64

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
  const taskScope = useAppStore((s) => s.taskPageData.workbenchTaskScope ?? null)
  const openActivityPage = useAppStore((s) => s.openActivityPage)
  const openAutomationsPage = useAppStore((s) => s.openAutomationsPage)
  const openSpacePage = useAppStore((s) => s.openSpacePage)
  const setActiveView = useAppStore((s) => s.setActiveView)
  const setSidebarBody = useAppStore((s) => s.setSidebarBody)
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen)
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

  const enterObjectContext = (): void => {
    setSidebarOpen(true)
    setSidebarBody('workspaces')
    if (objectContext) {
      return
    }
    closeProjectPage()
    setActiveView('terminal')
  }

  // Why: 项目级入口点击时现算来源，不沿用上一个工作树写下的主机；本机有该项目
  // 就落本机，本机没有才降级到其他已登记主机。
  const enterProjectLevelPage = (policy: ProjectSourcePolicy, navigate: () => void): void => {
    const state = useAppStore.getState()
    const pair = resolveProjectSourcePair(state.repos, state.activeRepoId, policy, {
      runtimeEnvironments: state.runtimeEnvironments
    })
    if (pair) {
      applyProjectSourcePair(pair)
    }
    closeProjectPage()
    navigate()
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
      active:
        activeView === 'activity' &&
        (projectPage === null || projectPage.kind === 'project-overview'),
      onSelect: () => enterProjectLevelPage('local-first', openActivityPage)
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
      // 知识库只读写本机文件；本机没有该项目时不降级到远端路径。
      onSelect: () => enterProjectLevelPage('local-only', openSpacePage)
    }
  ]

  return (
    <aside
      aria-label="Workbench 导航"
      className="flex shrink-0 flex-col items-center border-r border-worktree-sidebar-border bg-worktree-sidebar py-2.5"
      style={{ width: WORKBENCH_RAIL_WIDTH }}
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
        {entries.slice(0, 2).map((entry) => (
          <RailButton key={entry.id} entry={entry} />
        ))}
        <SidebarTaskNavButton
          variant="rail"
          active={activeView === 'tasks' && !taskScope?.version}
          onBeforeNavigate={closeProjectPage}
        />
        {entries.slice(2).map((entry) => (
          <RailButton key={entry.id} entry={entry} />
        ))}
      </nav>
      <div className="flex-1" />
      <TooltipProvider delayDuration={400}>
        <div className="flex flex-col items-center gap-0.5 [&>div]:flex-col [&>div>button]:size-10 [&>div>button>svg]:size-4.5">
          <SshStatusSegment compact iconOnly variant="rail" />
          <SidebarSettingsHelpMenu />
        </div>
      </TooltipProvider>
    </aside>
  )
}
