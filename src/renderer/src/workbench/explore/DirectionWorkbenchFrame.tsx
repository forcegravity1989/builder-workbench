import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import {
  Bell,
  FolderPlus,
  BookOpen,
  CalendarClock,
  CircleHelp,
  FolderGit2,
  GitBranch,
  Kanban,
  Layers,
  LayoutDashboard,
  LayoutGrid,
  List,
  Minus,
  PackageCheck,
  PanelLeft,
  Plus,
  Settings2,
  Square,
  X
} from 'lucide-react'
import { WORKBENCH_RAIL_WIDTH, WorkbenchRailButton } from '../WorkbenchRail'
import { WorkbenchProjectIdentity } from '../WorkbenchSidebarNav'
import { WorkbenchSidebarSectionHeader } from '../WorkbenchSidebarSectionHeader'

const ignore = () => {}
const railItems = [
  { id: 'workspace', label: '版本工作区', icon: PackageCheck },
  { id: 'overview', label: '项目总览', icon: LayoutDashboard },
  { id: 'tasks', label: '任务', icon: List },
  { id: 'automations', label: '自动化', icon: CalendarClock },
  { id: 'knowledge', label: '知识库', icon: BookOpen }
] as const

export function DirectionWorkbenchFrame({
  active,
  location,
  children
}: {
  active: 'wall' | 'overview'
  location: string
  children: ReactNode
}) {
  const frame = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  useLayoutEffect(() => {
    const surface = frame.current
    if (!surface) {
      return
    }
    const observer = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / 1180))
    observer.observe(surface)
    return () => observer.disconnect()
  }, [])
  return (
    <div ref={frame} className="direction-workbench-frame" aria-label="Workbench 示例窗口">
      <div className="direction-frame-viewport" style={{ transform: `scale(${scale})` }}>
        <header className="direction-frame-titlebar">
          <PanelLeft size={15} />
          <span className="direction-frame-title">Workbench · 运营看板</span>
          <Minus size={14} />
          <Square size={12} />
          <X size={15} />
        </header>
        <div className="direction-frame-body">
          <aside
            className="flex shrink-0 flex-col items-center border-r border-worktree-sidebar-border bg-worktree-sidebar py-2.5"
            style={{ width: WORKBENCH_RAIL_WIDTH }}
          >
            <button
              type="button"
              className="mb-1 grid size-9 place-items-center rounded-[9px] bg-foreground text-background"
              aria-label="项目墙"
            >
              <LayoutGrid className="size-4" strokeWidth={2} />
            </button>
            <nav className="flex w-full flex-col items-center gap-1 border-t border-worktree-sidebar-border pt-2">
              {railItems.map((item) => (
                <WorkbenchRailButton
                  key={item.id}
                  entry={{ ...item, active: active === item.id, onSelect: ignore }}
                />
              ))}
            </nav>
            <div className="flex-1" />
            <Settings2 size={18} className="my-3 text-worktree-sidebar-foreground/60" />
            <CircleHelp size={18} className="my-3 text-worktree-sidebar-foreground/60" />
          </aside>
          <aside className="direction-frame-sidebar bg-worktree-sidebar text-worktree-sidebar-foreground">
            <div className="flex h-14 items-center gap-2 px-3">
              <WorkbenchProjectIdentity projectName="运营看板" />
              <Bell size={14} className="text-muted-foreground" />
              <FolderPlus size={14} className="text-muted-foreground" />
            </div>
            <WorkbenchSidebarSectionHeader icon={Layers} action={<Plus size={14} />}>
              版本
            </WorkbenchSidebarSectionHeader>
            <p className="px-9 py-2 text-xs text-worktree-sidebar-foreground/40">还没有版本</p>
            <div className="h-3" />
            <WorkbenchSidebarSectionHeader icon={FolderGit2} action={<Plus size={14} />}>
              工作区
            </WorkbenchSidebarSectionHeader>
            <div className="mx-2 mt-1 rounded-md px-3 py-2 text-[13px]">
              <div className="flex items-center gap-2">
                <GitBranch size={15} />
                <span>运营看板</span>
              </div>
              <p className="ml-6 mt-1 text-[11px] text-worktree-sidebar-foreground/45">main</p>
            </div>
            <div className="flex-1" />
            <div className="flex justify-end border-t border-worktree-sidebar-border p-2">
              <Kanban size={16} className="text-worktree-sidebar-foreground/60" />
            </div>
          </aside>
          <main className="direction-frame-main">
            <div className="direction-frame-location">{location}</div>
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}
