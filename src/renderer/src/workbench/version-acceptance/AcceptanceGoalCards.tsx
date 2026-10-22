import { useEffect, useRef, useState, type Ref } from 'react'
import { ChevronsDownUp, ChevronsUpDown, ClipboardCheck, RefreshCw } from 'lucide-react'
import type {
  AcceptanceMaterial,
  MetricReadingEvidence,
  PlanningMaterial
} from '../../../../shared/workbench/version-material'
import type { MetricRef, MetricScope, MetricsPort } from '../../../../shared/workbench/metrics'
import { VersionGoalCard } from '../version-cycle/VersionGoalCard'
import { goalCardViewKey } from '../cycle-view-state'
import { acceptanceRoundState } from '../../../../shared/workbench/acceptance-rounds'
import type { CycleScope, CycleTaskRead, CycleTaskSnapshot, TaskPort } from '../version-cycle/ports'
import { AcceptanceMetrics } from './AcceptanceMetrics'
import { AcceptanceGoalResult } from './AcceptanceGoalResult'
import { AcceptanceDirectives } from './AcceptanceDirectives'
import { isClosedIssueState, issueKey, issueMarkFor } from './acceptance-issue-annotations'
import {
  decisionFreshness,
  recordHumanDecision,
  type DecisionFreshness
} from './acceptance-decision'

type AcceptanceOutcome = NonNullable<AcceptanceMaterial['results'][number]['decision']>['outcome']

function AcceptanceDecisionSelect({
  document,
  plan,
  goalId,
  disabled,
  onChange
}: {
  document: AcceptanceMaterial
  plan: PlanningMaterial
  goalId: string
  disabled: boolean
  onChange(document: AcceptanceMaterial): void
}) {
  const result = document.results.find((item) => item.goalId === goalId)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const latest = useRef(document)
  latest.current = document
  const decide = async (outcome: AcceptanceOutcome) => {
    setBusy(true)
    try {
      const next = await recordHumanDecision({
        document,
        plan,
        goalId,
        outcome,
        source: '验收界面人工确认',
        reason: result?.note ?? '',
        recordedAt: new Date().toISOString()
      })
      if (latest.current !== document) {
        throw new Error('记录结论期间材料已变化，请核对后重新确认。')
      }
      onChange(next)
      setError(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }
  return (
    <label className="va-decision-select">
      <span>人的结论</span>
      <select
        aria-label="人的结论"
        value={result?.decision?.outcome ?? ''}
        disabled={disabled || busy}
        onChange={(event) => void decide(event.target.value as AcceptanceOutcome)}
      >
        <option value="" disabled>
          待核对
        </option>
        <option value="pending">待核</option>
        <option value="met">达成</option>
        <option value="not-met">未达</option>
      </select>
      {error && (
        <span className="va-error" role="alert" title={error}>
          结论未保存
        </span>
      )}
    </label>
  )
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
  readOnly,
  sectionRef,
  scope,
  taskPort,
  onSnapshot,
  onOpenTask,
  onReadings,
  onGoalChange,
  onReport
}: {
  plan: PlanningMaterial
  document: AcceptanceMaterial
  metrics: MetricsPort
  metricScope: MetricScope
  readOnly: boolean
  sectionRef: Ref<HTMLElement>
  scope: CycleScope | null
  taskPort: TaskPort
  onSnapshot(reads: CycleTaskRead[]): void
  onOpenTask(task: CycleTaskSnapshot): Promise<void>
  onReadings(goalId: string, ref: MetricRef, readings: MetricReadingEvidence[]): void
  onGoalChange(next: AcceptanceMaterial, goalId: string): void
  onReport(): void
}) {
  const referenceKey = JSON.stringify(plan.tasks)
  const roundId = acceptanceRoundState(document).current?.id
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
  const [expandedSignal, setExpandedSignal] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [snapshotError, setSnapshotError] = useState<string | null>(null)
  const [freshnessByGoal, setFreshnessByGoal] = useState<Record<string, DecisionFreshness>>({})
  const viewReadOnly = readOnly
  useEffect(() => {
    let active = true
    void Promise.all(
      plan.goals.map(
        async (goal) => [goal.goalId, await decisionFreshness(document, plan, goal.goalId)] as const
      )
    ).then((entries) => {
      if (active) {
        setFreshnessByGoal(Object.fromEntries(entries))
      }
    })
    return () => {
      active = false
    }
  }, [document, plan])
  useEffect(() => {
    if (viewReadOnly || !scope || !plan.tasks.length || snapshotMatchesPlan) {
      setSnapshotError(null)
      return
    }
    if (snapshotRequested.current === referenceKey) {
      return
    }
    snapshotRequested.current = referenceKey
    let active = true
    void taskPort
      .listVersion(scope, plan.tasks)
      .then((reads) => {
        if (!active) {
          return
        }
        try {
          onSnapshot(reads)
          setSnapshotError(null)
        } catch (reason) {
          snapshotRequested.current = null
          setSnapshotError(reason instanceof Error ? reason.message : String(reason))
        }
      })
      .catch((reason) => {
        snapshotRequested.current = null
        if (active) {
          setSnapshotError(reason instanceof Error ? reason.message : String(reason))
        }
      })
    return () => {
      active = false
      if (snapshotRequested.current === referenceKey) {
        snapshotRequested.current = null
      }
    }
  }, [onSnapshot, plan.tasks, referenceKey, scope, snapshotMatchesPlan, taskPort, viewReadOnly])
  const refreshIssues = async () => {
    if (viewReadOnly || !scope || !plan.tasks.length || refreshing) {
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
        <button
          type="button"
          className="wb-btn wb-btn-ghost wb-btn-sm va-icon-btn"
          title="全部展开"
          aria-label="全部展开"
          onClick={() => {
            setExpanded(true)
            setExpandedSignal((value) => value + 1)
          }}
        >
          <ChevronsDownUp size={15} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="wb-btn wb-btn-ghost wb-btn-sm va-icon-btn"
          title="全部收起"
          aria-label="全部收起"
          onClick={() => {
            setExpanded(false)
            setExpandedSignal((value) => value + 1)
          }}
        >
          <ChevronsUpDown size={15} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="wb-btn wb-btn-ghost wb-btn-sm va-icon-btn"
          title={refreshing ? '正在刷新 Issue' : '刷新 Issue'}
          aria-label={refreshing ? '正在刷新 Issue' : '刷新 Issue'}
          disabled={viewReadOnly || !scope || !plan.tasks.length || refreshing}
          onClick={() => void refreshIssues()}
        >
          <RefreshCw
            size={15}
            aria-hidden="true"
            className={refreshing ? 'is-spinning' : undefined}
          />
        </button>
        <button
          type="button"
          className="wb-btn wb-btn-secondary wb-btn-sm va-icon-btn"
          title="预览纪要"
          aria-label="预览纪要"
          onClick={onReport}
        >
          <ClipboardCheck size={15} aria-hidden="true" />
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
          .filter((task) => {
            const snapshot = snapshotMatchesPlan
              ? document.taskSnapshot?.find((item) => issueKey(item.reference) === issueKey(task))
              : undefined
            return snapshot?.kind !== 'ready' || !isClosedIssueState(snapshot.state)
          })
          .map((task) => (result ? issueMarkFor(result, task, plan.tasks) : undefined))
          .filter((mark): mark is NonNullable<typeof mark> => Boolean(mark))
        const carryCount = marks.filter((mark) => mark.carry).length
        const riskCount = marks.filter((mark) => mark.risk).length
        const outcome = result?.decision?.outcome
        const freshness = freshnessByGoal[goal.goalId]
        const outcomeLabel =
          freshnessByGoal[goal.goalId] === 'changed'
            ? '待核（证据已变化）'
            : outcome === 'met'
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
            viewStateKey={goalCardViewKey(scope, document.version, goal.goalId, roundId)}
            goal={goal}
            index={index}
            defaultOpen={false}
            expanded={expanded}
            expandedSignal={expandedSignal}
            hideReadOnlyStory
            summary={
              <span
                className={`va-goal-summary va-status-${freshness === 'changed' ? 'pending' : (outcome ?? 'unknown')}`}
              >
                <span aria-label={`状态：${outcomeLabel}`}>●</span>
                {freshness === 'changed' && (
                  <span className="va-warning">证据已变化，请重新核对</span>
                )}
                <AcceptanceDecisionSelect
                  document={document}
                  plan={plan}
                  goalId={goal.goalId}
                  disabled={viewReadOnly}
                  onChange={(next) => onGoalChange(next, goal.goalId)}
                />
                <span>负责人 {goal.owner || '未指派'}</span>
                {relatedIssues > 0 && <span>Issue {issueCountLabel}</span>}
                {carryCount > 0 && <span>遗留 {carryCount}</span>}
                {riskCount > 0 && <span>风险 {riskCount}</span>}
              </span>
            }
            result={
              <AcceptanceGoalResult
                decisionSource="验收界面人工确认"
                document={document}
                plan={plan}
                goal={goal}
                disabled={viewReadOnly}
                onChange={(value) => onGoalChange(value, goal.goalId)}
                onOpenTask={onOpenTask}
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
                        document.candidateRef,
                        roundId
                      ])}
                      readings={
                        document.results.find((item) => item.goalId === goal.goalId)?.readings ?? []
                      }
                      port={metrics}
                      scope={metricScope}
                      disabled={viewReadOnly}
                      onReadings={(ref, readings) => onReadings(goal.goalId, ref, readings)}
                    />
                  ) : undefined
                }
              />
            }
          />
        )
      })}
      <AcceptanceDirectives
        document={document}
        plan={plan}
        disabled={viewReadOnly}
        onChange={(next, goalId) => onGoalChange(next, goalId)}
      />
    </section>
  )
}
