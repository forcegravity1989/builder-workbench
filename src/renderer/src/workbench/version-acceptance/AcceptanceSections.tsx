import { MessageSquare, RefreshCw } from 'lucide-react'
import type { ReactNode } from 'react'
import { BoardActionButton } from '../board-ui'
import { AutomationConfigureButton } from '../version-cycle/AutomationConfigureButton'
import { ACCEPTANCE_SECTIONS, type AcceptanceSectionId } from './acceptance-sections'

/**
 * Acceptance board header, same shape as the plan screen's: breadcrumb version
 * picker (legacy unbound trees only — on a version-bound tree the binding is
 * the single authority and the breadcrumb echoes it read-only, G2 #383), title
 * with save state, session-collapse chip, annotation-mode entry, trunk sync
 * and automation config. Annotation mode lives here at the top-right (#426
 * v0.7 验收会决议, both boards) — the header never scrolls away, so the mode
 * toggle and the unsent-count badge stay reachable mid-meeting. The branch
 * name stays off the board — packaging builds from the trunk while the
 * acceptance JSON lives on the acceptance branch, so neither is the object the
 * user acts on here.
 */
export function AcceptanceHeader({
  currentVersion,
  versions,
  unreadable,
  boundVersion = null,
  disabled,
  state,
  sessionCollapsed,
  onSessionToggle,
  onSelect,
  onConfigure,
  onRefresh,
  annotateEntry
}: {
  currentVersion: string
  versions: string[]
  /** Versions whose *acceptance* material cannot be read; still selectable. */
  unreadable: string[]
  /** G2（#383）：绑定验收树的版本——非空时只读回显，屏内不选版。 */
  boundVersion?: string | null
  disabled: boolean
  state: string
  sessionCollapsed: boolean
  onSessionToggle(): void
  onSelect(version: string): void
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
          {boundVersion ? (
            <span className="acc-version-bound" title="版本由流程树绑定决定，屏内不切换">
              {boundVersion}
            </span>
          ) : (
            <select
              className="acc-version-select"
              aria-label="验收版本"
              value={currentVersion}
              disabled={disabled}
              onChange={(event) => {
                if (event.target.value) {
                  onSelect(event.target.value)
                }
              }}
            >
              <option value="">待选择版本</option>
              {versions.map((version) => (
                // Never disabled: an unreadable version must still be selectable so
                // the board can show the real reason instead of hiding it.
                <option key={version} value={version}>
                  {version}
                  {unreadable.includes(version) ? ' · 验收材料暂无法读取' : ''}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="acc-title-row">
          <h1>版本验收</h1>
          <span className="acc-muted" role="status">
            {state}
          </span>
        </div>
      </div>
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
          <RefreshCw size={13} aria-hidden="true" /> 更新代码
        </BoardActionButton>
        <AutomationConfigureButton className="g3-action-button" onConfigure={onConfigure} />
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
  onNavigate
}: {
  active: AcceptanceSectionId
  onNavigate(id: AcceptanceSectionId): void
}) {
  return (
    <nav className="acc-journey" aria-label="验收旅程">
      {ACCEPTANCE_SECTIONS.map(([id, title, detail], index) => (
        <button
          key={id}
          type="button"
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
