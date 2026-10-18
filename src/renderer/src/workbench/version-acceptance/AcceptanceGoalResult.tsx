/* eslint-disable max-lines -- Goal result owns the card's human decision, round and Issue controls. */
import { useEffect, useRef, useState } from 'react'
import type {
  AcceptanceMaterial,
  PlanningMaterial,
  VersionGoal
} from '../../../../shared/workbench/version-material'
import {
  decisionFreshness,
  recordHumanDecision,
  type DecisionFreshness
} from './acceptance-decision'
import { emptyGoalResult, type GoalResult } from './acceptance-model'
import { AcceptanceDeliveryDetails } from './AcceptanceDeliveryDetails'
import type { CycleTaskSnapshot } from '../version-cycle/ports'

const ISSUE_GROUPS = [
  { key: 'bug', label: 'Bug 类' },
  { key: 'feature', label: 'Feature 类' },
  { key: 'unclassified', label: '未分类' }
] as const

function issueClass(labels: string[] | undefined): (typeof ISSUE_GROUPS)[number]['key'] {
  if (labels?.some((label) => /^(bug|缺陷)/i.test(label))) {
    return 'bug'
  }
  if (labels?.some((label) => /^(feature|功能)/i.test(label))) {
    return 'feature'
  }
  return 'unclassified'
}

function issueKey(reference: PlanningMaterial['tasks'][number]): string {
  return `${reference.provider}:${reference.repository}:${reference.number}`
}

export function AcceptanceGoalResult({
  document,
  plan,
  goal,
  decisionSource,
  disabled,
  onChange,
  onOpenTask
}: {
  document: AcceptanceMaterial
  plan: PlanningMaterial
  goal: VersionGoal
  decisionSource: string
  disabled: boolean
  onChange(document: AcceptanceMaterial): void
  onOpenTask(task: CycleTaskSnapshot): Promise<void>
}) {
  const result =
    document.results.find((item) => item.goalId === goal.goalId) ?? emptyGoalResult(goal.goalId)
  const relatedIssues = plan.tasks.filter((task) => task.goalId === goal.goalId)
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
  const snapshotByKey = new Map(
    (snapshotMatchesPlan ? (document.taskSnapshot ?? []) : []).map((item) => [
      issueKey(item.reference),
      item
    ])
  )
  const gap = result.decision?.outcome === 'not-met'
  const [assessment, setAssessment] = useState<{
    document: AcceptanceMaterial
    freshness: DecisionFreshness
  } | null>(null)
  const freshness = assessment?.document === document ? assessment.freshness : null
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const latest = useRef(document)
  latest.current = document
  useEffect(() => {
    let current = true
    void decisionFreshness(document, plan, goal.goalId)
      .then((value) => {
        if (current) {
          setAssessment({ document, freshness: value })
        }
      })
      .catch((reason) => {
        if (current) {
          setError(String(reason))
        }
      })
    return () => {
      current = false
    }
  }, [document, plan, goal.goalId])
  const edit = (patch: Partial<GoalResult>) =>
    onChange({
      ...document,
      results: [
        ...document.results.filter((item) => item.goalId !== goal.goalId),
        { ...result, ...patch }
      ]
    })
  const editIssueNote = (reference: PlanningMaterial['tasks'][number], note: string) =>
    edit({ issueNotes: { ...result.issueNotes, [issueKey(reference)]: note } })
  const editIssueMark = (
    reference: PlanningMaterial['tasks'][number],
    mark: 'carry' | 'risk',
    value: boolean
  ) => {
    const key = issueKey(reference)
    const nextMarks = {
      ...result.issueMarks,
      [key]: {
        ...result.issueMarks?.[key],
        [mark]: value
      }
    }
    const legacyKey = String(reference.number)
    if (legacyKey !== key) {
      delete nextMarks[legacyKey]
    }
    edit({ issueMarks: nextMarks })
  }
  async function decide(outcome: NonNullable<GoalResult['decision']>['outcome']) {
    setConfirming(true)
    try {
      const next = await recordHumanDecision({
        document,
        plan,
        goalId: goal.goalId,
        outcome,
        source: decisionSource,
        reason: result.note,
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
      setConfirming(false)
    }
  }
  return (
    <fieldset className="va-result" disabled={disabled || confirming}>
      <legend className="sr-only">{goal.title} 验收结果</legend>
      <div className="va-story-row">
        <label>
          进展
          <textarea
            rows={2}
            value={(result as GoalResult & { progress?: string }).progress ?? ''}
            placeholder="本轮实际进展；没有读数时保持事实描述"
            onChange={(event) => edit({ progress: event.target.value } as Partial<GoalResult>)}
          />
        </label>
        {(goal.deliverable?.trim() || result.deliveries.length > 0) && (
          <label className="va-primary-delivery">
            实际交付
            <input
              aria-label={`${goal.title} 实际交付 1`}
              value={result.deliveries[0]?.title ?? ''}
              placeholder="填写实际交付结果或材料说明"
              onChange={(event) =>
                edit({
                  deliveries: [
                    { ...(result.deliveries[0] ?? { location: '' }), title: event.target.value },
                    ...result.deliveries.slice(1)
                  ]
                })
              }
            />
          </label>
        )}
        <label>
          <span className="sr-only">人的结论</span>
          <select
            className={
              result.decision
                ? freshness === 'current'
                  ? `va-outcome-${result.decision.outcome}`
                  : 'va-outcome-pending'
                : undefined
            }
            aria-label={`${goal.title} 人的结论`}
            value={result.decision?.outcome ?? ''}
            onChange={(event) =>
              void decide(event.target.value as NonNullable<GoalResult['decision']>['outcome'])
            }
          >
            <option value="" disabled>
              待核对
            </option>
            <option value="pending">待核</option>
            <option value="met">达成</option>
            <option value="not-met">未达</option>
          </select>
        </label>
        {freshness === 'changed' && (
          <button
            className="wb-btn wb-btn-sm"
            onClick={() => void decide(result.decision?.outcome ?? 'pending')}
          >
            重新确认此结论
          </button>
        )}
      </div>
      <div className="va-material-block">
        <strong>材料</strong>
        {(result.materials ?? []).map((material) => (
          <a
            key={`${material.label}:${material.url}`}
            href={material.url}
            target="_blank"
            rel="noreferrer"
          >
            {material.label || material.url}
          </a>
        ))}
        {!result.materials?.length && !result.deliveries.length && (
          <span className="va-muted">暂无材料链接</span>
        )}
      </div>
      <label className={gap ? 'va-note va-gap' : 'va-note'}>
        {gap ? '未达项' : '验收依据'}
        <span className="va-readonly-note">{result.note || 'Unknown；请在进展中补充事实依据'}</span>
      </label>
      {(goal.deliverable?.trim() || result.deliveries.length > 0) && (
        <AcceptanceDeliveryDetails
          title={goal.title}
          result={result}
          onChange={(deliveries) => edit({ deliveries })}
        />
      )}
      {result.decision && (
        <p className={freshness === 'changed' ? 'va-warning' : 'va-muted'}>
          {freshness === 'changed'
            ? '证据已变化，原结论保留，请重新核对。'
            : freshness === null
              ? '原结论已保留，正在核对证据…'
              : '已记录结论。'}{' '}
        </p>
      )}
      {(result.decision?.outcome === 'not-met' || result.nextStep) && (
        <label>
          后续安排
          <textarea
            value={result.nextStep}
            placeholder="缺口如何处理；带入下版先作为候选"
            rows={2}
            onChange={(event) => edit({ nextStep: event.target.value })}
          />
        </label>
      )}
      {result.decision?.outcome === 'not-met' && !result.nextStep.trim() && (
        <p className="va-warning">未达项的后续安排待补充</p>
      )}
      {error && (
        <p role="alert" className="va-error">
          {error}
        </p>
      )}
      {relatedIssues.length > 0 && (
        <section className="va-issue-blocks" aria-label={`${goal.title} 关联 Issue`}>
          {ISSUE_GROUPS.map((group) => {
            const items = relatedIssues.filter((reference) => {
              const snapshot = snapshotByKey.get(issueKey(reference))
              return snapshot?.kind === 'ready'
                ? issueClass(snapshot.labels) === group.key
                : group.key === 'unclassified'
            })
            if (!items.length) {
              return null
            }
            return (
              <details className="va-issue-group" key={group.key} open>
                <summary>
                  {group.label} · {items.length}
                </summary>
                {items.map((reference) => {
                  const key = issueKey(reference)
                  const snapshot = snapshotByKey.get(key)
                  const task = snapshot?.kind === 'ready' ? snapshot : undefined
                  const unavailableReason = snapshot?.kind === 'unavailable' ? snapshot.error : null
                  const mark =
                    result.issueMarks?.[key] ?? result.issueMarks?.[String(reference.number)]
                  const note =
                    result.issueNotes?.[key] ?? result.issueNotes?.[String(reference.number)]
                  return (
                    <div className="va-issue-row" key={key}>
                      <div className="va-issue-head">
                        {task ? (
                          <button
                            type="button"
                            className="va-issue-link"
                            onClick={() => void onOpenTask(task)}
                          >
                            #{reference.number} {task.title}
                          </button>
                        ) : (
                          <span>#{reference.number}</span>
                        )}
                        {!task && (
                          <strong>
                            {unavailableReason
                              ? `读取失败：${unavailableReason}`
                              : '状态未知，打开原生 Issue 核对'}
                          </strong>
                        )}
                        <span className="va-muted">
                          {task?.state ?? 'Unknown'}
                          {task?.assignee ? ` · ${task.assignee}` : ''}
                        </span>
                      </div>
                      <input
                        aria-label={`Issue ${reference.number} 备注`}
                        value={note ?? ''}
                        placeholder="本轮进展/备注"
                        onChange={(event) => editIssueNote(reference, event.target.value)}
                      />
                      <div className="va-issue-marks">
                        <label>
                          <input
                            type="checkbox"
                            checked={Boolean(mark?.carry)}
                            onChange={(event) =>
                              editIssueMark(reference, 'carry', event.target.checked)
                            }
                          />
                          遗留
                        </label>
                        <label>
                          <input
                            type="checkbox"
                            checked={Boolean(mark?.risk)}
                            onChange={(event) =>
                              editIssueMark(reference, 'risk', event.target.checked)
                            }
                          />
                          风险
                        </label>
                      </div>
                    </div>
                  )
                })}
              </details>
            )
          })}
        </section>
      )}
    </fieldset>
  )
}
