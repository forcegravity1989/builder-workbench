import {
  BrainCircuit,
  ClipboardList,
  GitBranch,
  GitPullRequest,
  Presentation,
  Target
} from 'lucide-react'
import type { RefObject } from 'react'
import type { VersionMaterialCandidate } from '../../../../shared/workbench/version-material-request'
import {
  PLAN_WORKFLOW_STAGES,
  workflowStageIndex
} from '../../../../shared/workbench/version-workflow'
import type { PlanWorkflowStage } from '../../../../shared/workbench/version-workflow'
import { AutomationConfigureButton } from '../version-cycle/AutomationConfigureButton'
export function PlanningHeader({
  currentVersion,
  versions,
  disabled,
  state,
  branch,
  onSelect,
  onConfigure,
  onRefresh
}: {
  currentVersion: string
  versions: VersionMaterialCandidate[]
  disabled: boolean
  state: string
  branch: string
  onSelect(version: string): void
  onConfigure(): void
  onRefresh(): void
}) {
  return (
    <header className="vp-header">
      <h1>版本计划</h1>
      <select
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
      <button className="wb-btn wb-btn-ghost wb-btn-sm" disabled={disabled} onClick={onRefresh}>
        更新代码
      </button>
      <span className="vp-muted" role="status">
        {state}
      </span>
      <span className="vc-branch" title={branch}>
        <GitBranch size={13} aria-hidden="true" />
        <span>{branch}</span>
      </span>
      <AutomationConfigureButton onConfigure={onConfigure} />
    </header>
  )
}
/**
 * The rail locates sections and mirrors the model-recorded SOP stage: a lamp is
 * green iff its position is at or before workflow.stage, gray otherwise — one
 * comparison, no content heuristics. Steps must stay in PLAN_WORKFLOW_STAGES order.
 */
export function PlanningJourneyNav({
  stage,
  preparationRef,
  goalsRef,
  tasksRef,
  archiveRef
}: {
  stage: PlanWorkflowStage | undefined
  preparationRef: RefObject<HTMLElement | null>
  goalsRef: RefObject<HTMLElement | null>
  tasksRef: RefObject<HTMLElement | null>
  archiveRef: RefObject<HTMLElement | null>
}) {
  const reached = workflowStageIndex(PLAN_WORKFLOW_STAGES, stage)
  const steps = [
    { label: '准备', Icon: ClipboardList, ref: preparationRef },
    { label: '目标', Icon: Target, ref: goalsRef },
    { label: '评审', Icon: Presentation, ref: goalsRef },
    { label: '拆解', Icon: BrainCircuit, ref: tasksRef },
    { label: '归档', Icon: GitPullRequest, ref: archiveRef }
  ]
  return (
    <nav className="vp-journey" aria-label="计划流程">
      {steps.map(({ label, Icon, ref }, index) => (
        <button
          key={label}
          title={`${label} · ${index <= reached ? '模型已记录完成' : '尚未记录完成'}`}
          onClick={() => ref.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })}
        >
          <span className={`vp-step-icon ${index <= reached ? 'done' : ''}`}>
            <Icon size={16} />
          </span>
          <span>{label}</span>
        </button>
      ))}
    </nav>
  )
}
