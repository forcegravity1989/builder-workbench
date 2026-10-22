import { MessageSquare, RefreshCw } from 'lucide-react'
import type { ReactNode, Ref } from 'react'
import { AutomationConfigureButton } from '../version-cycle/AutomationConfigureButton'
import { ACCEPTANCE_SECTIONS, type AcceptanceSectionId } from './acceptance-sections'

/**
 * Acceptance board header, same shape as the plan screen's: breadcrumb version
 * picker (until G2 moves selection into the sidebar), title with save state,
 * session-collapse chip, trunk sync, automation config and annotation mode. The
 * branch name stays off the board — packaging builds from the trunk while the
 * acceptance JSON lives on the acceptance branch, so neither is the object the
 * user acts on here.
 */
export function AcceptanceHeader({
  currentVersion,
  versions,
  unreadable,
  disabled,
  state,
  sessionCollapsed,
  onSessionToggle,
  onSelect,
  onConfigure,
  onRefresh,
  extraActions
}: {
  currentVersion: string
  versions: string[]
  /** Versions whose material cannot be read; listed but not selectable. */
  unreadable: string[]
  disabled: boolean
  state: string
  sessionCollapsed: boolean
  onSessionToggle(): void
  onSelect(version: string): void
  onConfigure(): void
  onRefresh(): void
  /** Trailing action slot (annotation-mode button). */
  extraActions?: ReactNode
}) {
  return (
    <header className="acc-header">
      <div>
        <div className="acc-breadcrumb">
          Builder Workbench <span>/</span>
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
              <option
                key={version}
                value={version}
                disabled={unreadable.includes(version) && version !== currentVersion}
              >
                {version}
                {unreadable.includes(version) ? ' · 暂无法读取' : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="acc-title-row">
          <h1>版本验收</h1>
          <span className="acc-muted" role="status">
            {state}
          </span>
        </div>
      </div>
      <div className="acc-header-actions">
        <button
          type="button"
          className="acc-session-chip"
          aria-expanded={!sessionCollapsed}
          aria-label={sessionCollapsed ? '展开会话栏' : '收折会话栏'}
          title={sessionCollapsed ? '展开会话栏' : '收折会话栏'}
          onClick={onSessionToggle}
        >
          <MessageSquare size={13} aria-hidden="true" />
          {sessionCollapsed ? '展开会话' : '收起会话'}
        </button>
        <button type="button" className="acc-text-button" disabled={disabled} onClick={onRefresh}>
          <RefreshCw size={13} aria-hidden="true" /> 更新代码
        </button>
        <AutomationConfigureButton className="acc-text-button" onConfigure={onConfigure} />
        {extraActions}
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

/** Section shell: numbered locator target with a title row and a trailing action slot. */
export function AcceptanceSection({
  id,
  label,
  title,
  detail,
  actions,
  sectionRef,
  children
}: {
  id: AcceptanceSectionId
  label: string
  title: string
  detail?: string
  actions?: ReactNode
  sectionRef: Ref<HTMLElement>
  children: ReactNode
}) {
  return (
    <section id={id} ref={sectionRef} aria-label={label}>
      <div className="acc-section-title">
        <h2>
          {title}
          {detail && <small>{detail}</small>}
        </h2>
        {actions && <span className="acc-title-actions">{actions}</span>}
      </div>
      {children}
    </section>
  )
}
