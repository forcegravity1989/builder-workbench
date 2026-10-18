import { useEffect, useRef, useState, type Ref } from 'react'
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
import { AcceptanceDirectives, AcceptanceRounds } from './AcceptanceRounds'

function issueKey(reference: PlanningMaterial['tasks'][number]): string {
  return `${reference.provider}:${reference.repository}:${reference.number}`
}

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
  const snapshotRequested = useRef<string | null>(null)
  const snapshotMatchesPlan =
    document.taskSnapshot !== undefined &&
    document.taskSnapshot.length === plan.tasks.length &&
    plan.tasks.every((reference) =>
      document.taskSnapshot?.some(
        (item) =>
          item.reference.provider === reference.provider &&
          item.reference.repository === reference.repository &&
          item.reference.number === reference.number
      )
    )
  const initialExpanded = plan.goals.some((goal) => {
    const result = document.results.find((item) => item.goalId === goal.goalId)
    return !result?.decision && !result?.progress && !result?.deliveries.length
  })
  const [expanded, setExpanded] = useState(initialExpanded)
  const [refreshing, setRefreshing] = useState(false)
  const [snapshotError, setSnapshotError] = useState<string | null>(null)
  useEffect(() => {
    if (readOnly || !scope || !plan.tasks.length || snapshotMatchesPlan) {
      return
    }
    if (snapshotRequested.current === referenceKey) {
      return
    }
    snapshotRequested.current = referenceKey
    let active = true
    void taskPort.listVersion(scope, plan.tasks).then(
      (reads) => {
        if (active) {
          onSnapshot(reads)
          setSnapshotError(null)
        }
      },
      (reason) => {
        snapshotRequested.current = null
        // Keep the absence of a snapshot visible as Unknown; it is not a zero.
        if (active) {
          setSnapshotError(reason instanceof Error ? reason.message : String(reason))
        }
      }
    )
    return () => {
      active = false
    }
  }, [onSnapshot, plan.tasks, readOnly, referenceKey, scope, snapshotMatchesPlan, taskPort])
  const refreshIssues = async () => {
    if (!scope || !plan.tasks.length || refreshing) {
      return
    }
    setRefreshing(true)
    setSnapshotError(null)
    try {
      onSnapshot(await taskPort.refresh(scope, plan.tasks))
    } catch (reason) {
      // Keep the last good snapshot; a failed refresh is Unknown, not zero.
      setSnapshotError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setRefreshing(false)
    }
  }
  return (
    <section id="acceptance-results" ref={sectionRef} aria-label="展示验收">
      <div className="va-goal-toolbar">
        <button className="wb-btn wb-btn-ghost wb-btn-sm" onClick={() => setExpanded(true)}>
          全部展开
        </button>
        <button className="wb-btn wb-btn-ghost wb-btn-sm" onClick={() => setExpanded(false)}>
          全部收起
        </button>
        <button
          type="button"
          className="wb-btn wb-btn-ghost wb-btn-sm"
          disabled={readOnly || !scope || !plan.tasks.length || refreshing}
          onClick={() => void refreshIssues()}
        >
          {refreshing ? '刷新中…' : '刷新 Issue'}
        </button>
        {snapshotError && (
          <span className="va-muted" role="status">
            Issue 状态未知：{snapshotError}
          </span>
        )}
      </div>
      {plan.goals.map((goal, index) => {
        const result = document.results.find((item) => item.goalId === goal.goalId)
        const relatedIssues = plan.tasks.filter((task) => task.goalId === goal.goalId).length
        const marks = plan.tasks
          .filter((task) => task.goalId === goal.goalId)
          .map(
            (task) =>
              result?.issueMarks?.[issueKey(task)] ?? result?.issueMarks?.[String(task.number)]
          )
          .filter((mark): mark is NonNullable<typeof mark> => Boolean(mark))
        const carryCount = marks.filter((mark) => mark.carry).length
        const riskCount = marks.filter((mark) => mark.risk).length
        const outcome = result?.decision?.outcome
        const outcomeLabel =
          outcome === 'met'
            ? '已达成'
            : outcome === 'not-met'
              ? '未达成'
              : outcome === 'pending'
                ? '待核'
                : 'Unknown'
        const issueCountLabel = !snapshotMatchesPlan ? 'Unknown' : relatedIssues
        return (
          <VersionGoalCard
            key={goal.goalId}
            goal={goal}
            index={index}
            readOnly
            defaultOpen={false}
            expanded={expanded}
            summary={
              <span className={`va-goal-summary va-status-${outcome ?? 'unknown'}`}>
                <span aria-label={`状态：${outcomeLabel}`}>● {outcomeLabel}</span>
                <span>人的结论：{outcomeLabel}</span>
                <span>负责人 {goal.owner || '未指派'}</span>
                {relatedIssues > 0 && <span>Issue {issueCountLabel}</span>}
                {carryCount > 0 && <span>遗留 {carryCount}</span>}
                {riskCount > 0 && <span>风险 {riskCount}</span>}
              </span>
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
      <AcceptanceRounds document={document} />
      <AcceptanceDirectives
        document={document}
        plan={plan}
        disabled={readOnly}
        onChange={(next, goalId) => onGoalChange(next, goalId)}
      />
    </section>
  )
}
