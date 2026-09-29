import { ChevronRight, ListTodo } from 'lucide-react'
import type { Ref } from 'react'
import type {
  AcceptanceMaterial,
  MetricReadingEvidence,
  PlanningMaterial
} from '../../../../shared/workbench/version-material'
import type {
  MetricRef,
  MetricScope,
  MetricsPort,
  MetricWindow
} from '../../../../shared/workbench/metrics'
import { VersionGoalCard } from '../version-cycle/VersionGoalCard'
import { AcceptanceMetrics } from './AcceptanceMetrics'
import { AcceptanceGoalResult } from './AcceptanceGoalResult'

/**
 * The goal sheet: read-only promises, actually collected metrics and the human
 * decision per goal. The per-goal Issue chip counts real references only — it
 * never derives a done-fraction (A05) — and locates the snapshot section.
 */
export function AcceptanceGoalCards({
  plan,
  document,
  metrics,
  metricScope,
  metricWindow,
  readOnly,
  sectionRef,
  onScrollToTasks,
  onReadings,
  onGoalChange,
  onFollowUp
}: {
  plan: PlanningMaterial
  document: AcceptanceMaterial
  metrics: MetricsPort
  metricScope: MetricScope
  metricWindow: MetricWindow | null
  readOnly: boolean
  sectionRef: Ref<HTMLElement>
  onScrollToTasks(): void
  onReadings(goalId: string, ref: MetricRef, readings: MetricReadingEvidence[]): void
  onGoalChange(next: AcceptanceMaterial, goalId: string): void
  onFollowUp(text: string): void
}) {
  return (
    <section id="acceptance-results" ref={sectionRef} aria-label="展示验收">
      {plan.goals.map((goal, index) => {
        const relatedIssues = plan.tasks.filter((task) => task.goalId === goal.goalId).length
        return (
          <VersionGoalCard
            key={goal.goalId}
            goal={goal}
            index={index}
            readOnly
            actions={
              relatedIssues > 0 ? (
                <button
                  className="va-goal-issues"
                  title="核对关联 Issue 状态"
                  onClick={onScrollToTasks}
                >
                  <ListTodo size={13} aria-hidden="true" />
                  Issue {relatedIssues}
                  <ChevronRight size={13} aria-hidden="true" />
                </button>
              ) : undefined
            }
            metrics={
              <AcceptanceMetrics
                goal={goal}
                materialKey={JSON.stringify([
                  document.version,
                  document.cycleId,
                  document.planRef,
                  document.candidateRef
                ])}
                readings={
                  document.results.find((item) => item.goalId === goal.goalId)?.readings ?? []
                }
                port={metrics}
                scope={metricScope}
                window={metricWindow}
                disabled={readOnly}
                onReadings={(ref, readings) => onReadings(goal.goalId, ref, readings)}
              />
            }
            result={
              <AcceptanceGoalResult
                decisionSource="验收界面人工确认"
                document={document}
                plan={plan}
                goal={goal}
                disabled={readOnly}
                onChange={(value) => onGoalChange(value, goal.goalId)}
                onFollowUp={onFollowUp}
              />
            }
          />
        )
      })}
    </section>
  )
}
