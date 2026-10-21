import type { RefObject } from 'react'
import { ArrowUpRight, GitPullRequest, PackageCheck, Presentation } from 'lucide-react'
import {
  ACCEPTANCE_WORKFLOW_STAGES,
  workflowStageIndex,
  type AcceptanceWorkflowStage
} from '../../../../shared/workbench/version-workflow'

/**
 * The rail locates body sections and mirrors the model-recorded SOP stage:
 * green at or before workflow.stage, gray otherwise. 出包 is not a recorded
 * stage — its lamp follows live package data (green only once the latest
 * artifact was actually read), never the stage chain.
 */
export function AcceptanceJourney({
  stage,
  startRef,
  packageRef,
  packageReady,
  resultsRef,
  archiveRef
}: {
  stage: AcceptanceWorkflowStage | undefined
  startRef: RefObject<HTMLElement | null>
  packageRef: RefObject<HTMLElement | null>
  packageReady: boolean
  resultsRef: RefObject<HTMLElement | null>
  archiveRef: RefObject<HTMLElement | null>
}) {
  const reached = workflowStageIndex(ACCEPTANCE_WORKFLOW_STAGES, stage)
  const recorded = (index: number) =>
    index <= reached ? '模型已记录完成' : '尚未记录完成'
  const steps = [
    {
      id: 'preparation',
      title: '准备交付',
      Icon: PackageCheck,
      ref: startRef,
      done: reached >= 0,
      hint: recorded(0)
    },
    {
      id: 'package',
      title: '出包',
      Icon: ArrowUpRight,
      ref: packageRef,
      done: packageReady,
      hint: packageReady ? '已读到最新制品包' : '尚未读到制品包'
    },
    {
      id: 'results',
      title: '展示验收',
      Icon: Presentation,
      ref: resultsRef,
      done: reached >= 1,
      hint: recorded(1)
    },
    {
      id: 'archive',
      title: '归档',
      Icon: GitPullRequest,
      ref: archiveRef,
      done: reached >= 2,
      hint: recorded(2)
    }
  ]
  return (
    <nav className="va-journey" aria-label="验收流程">
      {steps.map(({ id, title, Icon, ref, done, hint }) => (
        <button
          key={id}
          type="button"
          title={`${title} · ${hint}`}
          onClick={() => ref.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })}
        >
          <span className={`va-step-icon ${done ? 'done' : ''}`}>
            <Icon size={16} aria-hidden="true" />
          </span>
          <span>{title}</span>
        </button>
      ))}
    </nav>
  )
}
