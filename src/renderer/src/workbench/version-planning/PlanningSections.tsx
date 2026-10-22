import { GitBranch, MessageSquare, RefreshCw } from 'lucide-react'
import type { ReactNode } from 'react'
import type { VersionMaterialCandidate } from '../../../../shared/workbench/version-material-request'
import { AutomationConfigureButton } from '../version-cycle/AutomationConfigureButton'

export type PlanningSectionId = 'context' | 'goals' | 'minutes' | 'archive'

/** Top journey navigation copy, verbatim from the approved G3 production list. */
export const PLANNING_SECTIONS: [PlanningSectionId, string, string][] = [
  ['context', '上版回顾', '从延期与遗留开始'],
  ['goals', '本版目标', '明确结果与验收标准'],
  ['minutes', '会议纪要', '批注与转写稿生成'],
  ['archive', '归档 PR', 'Leader 在原生 PR 页再审']
]

export function PlanningHeader({
  currentVersion,
  boundVersion,
  versions,
  disabled,
  state,
  branch,
  sessionCollapsed,
  onSessionToggle,
  onSelect,
  onConfigure,
  onRefresh,
  extraActions
}: {
  currentVersion: string
  /** G2（#383）：绑定树的绑定版本；非 null 时面包屑只读回显，不提供屏内选版。 */
  boundVersion: string | null
  versions: VersionMaterialCandidate[]
  disabled: boolean
  state: string
  branch: string
  sessionCollapsed: boolean
  onSessionToggle(): void
  onSelect(version: string): void
  onConfigure(): void
  onRefresh(): void
  /** Trailing action slot (annotation-mode button). */
  extraActions?: ReactNode
}) {
  return (
    <header className="vp-header">
      <div>
        <div className="g3-breadcrumb">
          Builder Workbench <span>/</span>
          {boundVersion ? (
            /* G2（#383）：绑定树版本由绑定决定，屏内不再选版；旧无绑定固定树保留下拉。 */
            <span className="g3-version-bound" title="版本由流程树绑定决定，屏内不切换">
              {boundVersion}
            </span>
          ) : (
            <select
              className="g3-version-select"
              aria-label="计划版本"
              value={currentVersion}
              disabled={disabled}
              onChange={(event) => {
                if (event.target.value) {
                  onSelect(event.target.value)
                }
              }}
            >
              <option value="">待选择版本</option>
              {versions.map((item) => (
                <option key={item.version} value={item.version} disabled={item.state !== 'ready'}>
                  {item.version}
                  {item.state !== 'ready' ? ' · 暂无法读取' : ''}
                </option>
              ))}
              {currentVersion && !versions.some((item) => item.version === currentVersion) && (
                <option value={currentVersion}>{currentVersion}</option>
              )}
            </select>
          )}
        </div>
        <div className="vp-title-row">
          <h1>版本计划</h1>
          <span className="vp-muted" role="status">
            {state}
          </span>
        </div>
      </div>
      <div className="g3-header-actions">
        <button
          type="button"
          className="g3-session-chip"
          aria-expanded={!sessionCollapsed}
          aria-label={sessionCollapsed ? '展开会话栏' : '收折会话栏'}
          title={sessionCollapsed ? '展开会话栏' : '收折会话栏'}
          onClick={onSessionToggle}
        >
          <MessageSquare size={13} aria-hidden="true" />
          {sessionCollapsed ? '展开会话' : '收起会话'}
        </button>
        <span className="g3-branch" title="固定工作树分支">
          <GitBranch size={13} aria-hidden="true" />
          <span>{branch}</span>
        </span>
        <button type="button" className="g3-text-button" disabled={disabled} onClick={onRefresh}>
          <RefreshCw size={13} aria-hidden="true" /> 更新代码
        </button>
        <AutomationConfigureButton className="g3-text-button" onConfigure={onConfigure} />
        {extraActions}
      </div>
    </header>
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
