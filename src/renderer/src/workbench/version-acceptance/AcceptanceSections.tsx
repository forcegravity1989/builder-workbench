import { ArrowDownToLine, MessageSquare } from 'lucide-react'
import type { ReactNode } from 'react'
import { BoardActionButton } from '../board-ui'
import { WorkbenchVersionResultHelp } from '../WorkbenchScreenGuide'
import { AutomationConfigureButton } from '../version-cycle/AutomationConfigureButton'
import { ACCEPTANCE_SECTIONS, type AcceptanceSectionId } from './acceptance-sections'

/** Acceptance actions and the version bound to the active workflow tree. */
export function AcceptanceHeader({
  boundVersion = null,
  disabled,
  state,
  sessionCollapsed,
  onSessionToggle,
  onConfigure,
  onRefresh,
  annotateEntry
}: {
  /** G2（#383）：绑定验收树的版本——非空时只读回显，屏内不选版。 */
  boundVersion?: string | null
  disabled: boolean
  state: string
  sessionCollapsed: boolean
  onSessionToggle(): void
  onConfigure(): void
  onRefresh(): void
  /** 批注模式入口（#426：页头右上角常驻）。空板态与无计划时不传，不渲染。 */
  annotateEntry?: ReactNode
}) {
  return (
    <header className="acc-header">
      <div>
        <div className="acc-breadcrumb">
          Builder Workbench <span>/</span>
          <span className="acc-version-bound">{boundVersion ?? '版本未就绪'}</span>
        </div>
        <div className="acc-title-row">
          <h1>版本验收</h1>
          <span className="acc-muted" role="status">
            {state}
          </span>
        </div>
      </div>
      <div className="flex min-w-0 max-w-full items-center gap-2">
        <div className="acc-header-actions" role="group" aria-label="验收操作">
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
        <WorkbenchVersionResultHelp screen="workbench-acceptance" enabled={!disabled} />
      </div>
    </header>
  )
}

/**
 * Same-page section locator over the four meeting steps: numbered tabs, no stage
 * lamps. Highlight follows the scroll spy owned by the board. Not rendered on an
 * empty board — there is nothing to locate yet.
 */
export function AcceptanceJourneyNav({
  active,
  readyToReview,
  onNavigate
}: {
  active: AcceptanceSectionId
  readyToReview: boolean
  onNavigate(id: AcceptanceSectionId): void
}) {
  return (
    <nav className="acc-journey" aria-label="验收旅程">
      {ACCEPTANCE_SECTIONS.map(([id, title, detail], index) => (
        <button
          key={id}
          type="button"
          data-contextual-tour-target={
            id === 'prepare' || readyToReview ? `workbench-acceptance-${id}` : undefined
          }
          onClick={() => onNavigate(id)}
          aria-current={active === id ? 'location' : undefined}
        >
          <span className="acc-stage-number">{index + 1}</span>
          <span className="acc-stage-copy">
            <strong>{title}</strong>
            <small>{detail}</small>
          </span>
        </button>
      ))}
    </nav>
  )
}
