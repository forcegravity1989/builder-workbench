import { ArrowDownToLine, GitBranch, MessageSquare, MessageSquarePlus } from 'lucide-react'
import type { ReactNode } from 'react'
import { BoardActionButton } from '../board-ui'
import { AutomationConfigureButton } from '../version-cycle/AutomationConfigureButton'

export type PlanningSectionId = 'context' | 'goals' | 'minutes' | 'archive'

/**
 * Top journey navigation copy. 第一步按 #426（v0.7 验收会决议）从「上版回顾」改名
 * 「计划准备」，与验收屏「验收准备」口径一致；区块内容仍是上版两行遗留的回显。
 */
export const PLANNING_SECTIONS: [PlanningSectionId, string, string][] = [
  ['context', '计划准备', '核对上版遗留'],
  ['goals', '本版目标', '明确结果与验收标准'],
  ['minutes', '会议纪要', '按需整理并人工确认'],
  ['archive', '归档 PR', '查看评审与合入状态']
]

export function PlanningHeader({
  boundVersion,
  disabled,
  state,
  branch,
  sessionCollapsed,
  onSessionToggle,
  onConfigure,
  onRefresh,
  annotateEntry,
  helpEntry
}: {
  /** G2（#383）：绑定树的绑定版本；非 null 时面包屑只读回显，不提供屏内选版。 */
  boundVersion: string | null
  disabled: boolean
  state: string
  branch: string
  sessionCollapsed: boolean
  onSessionToggle(): void
  onConfigure(): void
  onRefresh(): void
  /** 批注模式入口（#426 验收会决议：页头右上角常驻，不随内容滚动）。计划未建时不传。 */
  annotateEntry?: ReactNode
  helpEntry?: ReactNode
}) {
  return (
    <header className="vp-header">
      <div>
        <div className="g3-breadcrumb">
          Monica <span>/</span>
          <span className="g3-version-bound">{boundVersion ?? '版本未就绪'}</span>
        </div>
        <div className="vp-title-row">
          <h1>版本计划</h1>
          <span className="vp-muted" role="status">
            {state}
          </span>
        </div>
      </div>
      <div className="g3-header-actions">
        <span className="g3-branch" title="固定工作树分支">
          <GitBranch size={13} aria-hidden="true" />
          <span>{branch}</span>
        </span>
        <div className="g3-header-tools" role="group" aria-label="计划操作">
          <BoardActionButton
            aria-expanded={!sessionCollapsed}
            aria-label={sessionCollapsed ? '展开会话栏' : '收折会话栏'}
            title={sessionCollapsed ? '展开会话栏' : '收折会话栏'}
            onClick={onSessionToggle}
          >
            <MessageSquare size={13} aria-hidden="true" />
            {sessionCollapsed ? '展开会话' : '收起会话'}
          </BoardActionButton>
          {annotateEntry}
          <BoardActionButton disabled={disabled} onClick={onRefresh}>
            <ArrowDownToLine size={13} aria-hidden="true" /> 更新代码
          </BoardActionButton>
          <AutomationConfigureButton className="g3-action-button" onConfigure={onConfigure} />
        </div>
        {helpEntry}
      </div>
    </header>
  )
}

export function PlanningAnnotationButton({
  active,
  count,
  shortcut,
  onToggle
}: {
  active: boolean
  count: number
  shortcut?: string | null
  onToggle(): void
}) {
  return (
    <BoardActionButton
      className={`g3-annotate-entry${active ? ' g3-mode-on' : ''}`}
      data-contextual-tour-target="workbench-plan-annotations"
      aria-pressed={active}
      title={
        active
          ? `退出批注模式${shortcut ? `（${shortcut}）` : ''}`
          : `批注模式：点击目标句、验收标准、指标承诺或 Issue 行记录评审意见${shortcut ? `（${shortcut} 进入）` : ''}`
      }
      onClick={onToggle}
    >
      <MessageSquarePlus size={13} aria-hidden="true" /> 批注模式
      {count > 0 && <span className="g3-annotate-count">{count}</span>}
    </BoardActionButton>
  )
}

/**
 * Same-page section locator: four numbered tabs over the scroll area, no stage
 * lamps (decision B — workflow.stage stays a session contract, the plan screen
 * no longer renders it). Highlight follows the scroll spy owned by the board.
 */
export function PlanningJourneyNav({
  active,
  onNavigate
}: {
  active: PlanningSectionId
  onNavigate(id: PlanningSectionId): void
}) {
  return (
    <nav className="g3-journey" aria-label="计划旅程">
      {PLANNING_SECTIONS.map(([id, title, detail], index) => (
        <button
          key={id}
          type="button"
          onClick={() => onNavigate(id)}
          data-contextual-tour-target={
            id === 'goals'
              ? 'workbench-plan-goals'
              : id === 'archive'
                ? 'workbench-plan-archive'
                : undefined
          }
          aria-current={active === id ? 'location' : undefined}
        >
          <span className="g3-stage-number">{index + 1}</span>
          <span className="g3-stage-copy">
            <strong>{title}</strong>
            <small>{detail}</small>
          </span>
        </button>
      ))}
    </nav>
  )
}
