import { useEffect, type Ref } from 'react'
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
import type { CycleScope, CycleTaskRead, CycleTaskSnapshot, TaskPort } from '../version-cycle/ports'
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
  scope,
  taskPort,
  onSnapshot,
  onOpenTask,
  onReadings,
  onGoalChange
}: {
  plan: PlanningMaterial
  document: AcceptanceMaterial
  metrics: MetricsPort
  metricScope: MetricScope
  metricWindow: MetricWindow | null
  readOnly: boolean
  sectionRef: Ref<HTMLElement>
  scope: CycleScope | null
  taskPort: TaskPort
  onSnapshot(reads: CycleTaskRead[]): void
  onOpenTask(task: CycleTaskSnapshot): Promise<void>
  onReadings(goalId: string, ref: MetricRef, readings: MetricReadingEvidence[]): void
  onGoalChange(next: AcceptanceMaterial, goalId: string): void
}) {
  const referenceKey = JSON.stringify(plan.tasks)
  useEffect(() => {
    if (readOnly || !scope || !plan.tasks.length || document.taskSnapshot) {
      return
    }
    let active = true
    void taskPort.listVersion(scope, plan.tasks).then(
      (reads) => {
        if (active) {
          onSnapshot(reads)
        }
      },
      () => {
        // Keep the absence of a snapshot visible as Unknown; it is not a zero.
      }
    )
    return () => {
      active = false
    }
  }, [document.taskSnapshot, onSnapshot, plan.tasks, readOnly, referenceKey, scope, taskPort])
  return (
    <section id="acceptance-results" ref={sectionRef} aria-label="展示验收">
      {plan.goals.map((goal, index) => {
        const result = document.results.find((item) => item.goalId === goal.goalId)
        const relatedIssues = plan.tasks.filter((task) => task.goalId === goal.goalId).length
        const markedIssues = Object.values(result?.issueMarks ?? {}).filter(
          (mark) => mark.carry || mark.risk
        ).length
        return (
          <VersionGoalCard
            key={goal.goalId}
            goal={goal}
            index={index}
            readOnly
            defaultOpen={false}
            summary={
              relatedIssues > 0 ? (
                <span className="va-goal-issues" title="关联 Issue 与当前轮标记">
                  Issue {relatedIssues}
                  {markedIssues > 0 ? ` · 标记 ${markedIssues}` : ''}
                </span>
              ) : undefined
            }
            metrics={
              goal.metricTargets.length > 0 ||
              document.results.some(
                (item) => item.goalId === goal.goalId && item.readings.length > 0
              ) ? (
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
              ) : undefined
            }
            result={
              <AcceptanceGoalResult
                decisionSource="验收界面人工确认"
                document={document}
                plan={plan}
                goal={goal}
                disabled={readOnly}
                onChange={(value) => onGoalChange(value, goal.goalId)}
                onOpenTask={onOpenTask}
              />
            }
          />
        )
      })}
    </section>
  )
}
