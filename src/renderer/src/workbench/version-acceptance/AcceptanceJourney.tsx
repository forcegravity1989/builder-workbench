import type { RefObject } from 'react'
import { GitPullRequest, PackageCheck, Presentation } from 'lucide-react'
import {
  ACCEPTANCE_WORKFLOW_STAGES,
  workflowStageIndex,
  type AcceptanceWorkflowStage
} from '../../../../shared/workbench/version-workflow'

/**
 * The rail locates body sections and mirrors the model-recorded SOP stage:
 * green at or before workflow.stage, gray otherwise. Steps must stay in
 * ACCEPTANCE_WORKFLOW_STAGES order.
 */
export function AcceptanceJourney({
  stage,
  startRef,
  resultsRef,
  archiveRef
}: {
  stage: AcceptanceWorkflowStage | undefined
  startRef: RefObject<HTMLElement | null>
  resultsRef: RefObject<HTMLElement | null>
  archiveRef: RefObject<HTMLElement | null>
}) {
  const reached = workflowStageIndex(ACCEPTANCE_WORKFLOW_STAGES, stage)
  const steps = [
    { id: 'preparation', title: '准备交付', Icon: PackageCheck, ref: startRef },
    { id: 'results', title: '展示验收', Icon: Presentation, ref: resultsRef },
    { id: 'archive', title: '归档', Icon: GitPullRequest, ref: archiveRef }
  ]
  return (
    <nav className="va-journey" aria-label="验收流程">
      {steps.map(({ id, title, Icon, ref }, index) => (
        <button
          key={id}
          type="button"
          title={`${title} · ${index <= reached ? '模型已记录完成' : '尚未记录完成'}`}
          onClick={() => ref.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })}
        >
          <span className={`va-step-icon ${index <= reached ? 'done' : ''}`}>
            <Icon size={16} aria-hidden="true" />
          </span>
          <span>{title}</span>
        </button>
      ))}
    </nav>
  )
}
