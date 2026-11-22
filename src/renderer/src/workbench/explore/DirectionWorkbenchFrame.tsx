import type { ReactNode } from 'react'
import {
  BookOpen,
  CalendarClock,
  List,
  LayoutDashboard,
  LayoutGrid,

  Settings2
} from 'lucide-react'
import { cn } from '@/lib/utils'

type ActiveView = 'wall' | 'overview' | 'tasks' | 'automations' | 'knowledge'

const railItems: Array<{ id: ActiveView; label: string; Icon: typeof LayoutDashboard }> = [
  { id: 'overview', label: '项目总览', Icon: LayoutDashboard },
  { id: 'tasks', label: '任务', Icon: List },
  { id: 'automations', label: '自动化', Icon: CalendarClock },
  { id: 'knowledge', label: '知识库', Icon: BookOpen }
]

export function DirectionWorkbenchFrame({
  active,
  location,
  children
}: {
  active: ActiveView
  location: string
  children: ReactNode
}) {
  return (
    <div className="direction-workbench-frame" aria-label="Workbench 示例窗口">
      <header className="direction-frame-titlebar">
        <span className="direction-frame-project">运营看板</span>
        <span className="direction-frame-title">Workbench</span>
        <span className="direction-frame-command">⌘ K</span>
      </header>
      <div className="direction-frame-body">
        <aside className="direction-frame-rail" aria-label="Workbench 导航">
          <button type="button" className="direction-frame-mark" aria-label="项目墙">
            <LayoutGrid size={17} />
          </button>
          <nav>
            <span className={cn('direction-frame-rail-button', active === 'overview' && 'is-active')}>
              <LayoutDashboard size={18} />
            </span>
            {railItems.slice(1).map(({ id, label, Icon }) => (
              <span
                key={id}
                className={cn('direction-frame-rail-button', active === id && 'is-active')}
                title={label}
              >
                <Icon size={18} />
              </span>
            ))}
          </nav>
          <div className="direction-frame-rail-spacer" />
          <Settings2 size={17} className="direction-frame-muted-icon" />
        </aside>
        <aside className="direction-frame-sidebar">
          <div className="direction-frame-sidebar-head">
            <span className="direction-frame-avatar">运</span>
            <span><strong>运营看板</strong><small>当前项目</small></span>
          </div>
          <div className="direction-frame-sidebar-section">
            <small>工作区</small>
            <span className={cn(active === 'wall' && 'is-active')}><i />项目墙</span>
            <span className={cn(active === 'overview' && 'is-active')}><i />项目总览</span>
          </div>
          <div className="direction-frame-sidebar-section">
            <small>项目导航</small>
            <span className={cn(location.includes('阶段') && 'is-active')}><i />阶段安排</span>
            <span className={cn(location.includes('设置') && 'is-active')}><i />项目信息</span>
          </div>
        </aside>
        <main className="direction-frame-main">
          <div className="direction-frame-location">来源 · {location}</div>
          {children}
        </main>
      </div>
    </div>
  )
}
