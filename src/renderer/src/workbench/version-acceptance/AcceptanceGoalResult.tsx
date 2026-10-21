import { useEffect, useRef, useState, type ReactNode } from 'react'
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
import { useCycleWorkspace } from '../version-cycle/cycle-workspace-context'
import { openAcceptanceMaterial } from './open-acceptance-material'
import {
  isClosedIssueState,
  issueKey,
  issueMarkFor,
  issueNoteFor,
  updateIssueMark,
  updateIssueNote
} from './acceptance-issue-annotations'

const ISSUE_GROUPS = [
  { key: 'bug', label: 'Bug 类' },
  { key: 'feature', label: 'Feature 类' },
  { key: 'unclassified', label: '未分类' }
] as const

function readableTaskState(state: string): string {
  switch (state.trim().toLowerCase()) {
    case 'open':
    case 'opened':
      return '开放'
    case 'in_progress':
    case 'in-progress':
      return '进行中'
    case 'closed':
    case 'merged':
      return '已关闭'
    case 'unknown':
      return 'Unknown'
    default:
      return state.trim() || 'Unknown'
  }
}

function issueClass(labels: string[] | undefined): (typeof ISSUE_GROUPS)[number]['key'] {
  const normalized = labels?.map((label) => label.trim()).filter(Boolean) ?? []
  if (normalized.some((label) => /^(bug|缺陷)/i.test(label))) {
    return 'bug'
  }
  if (normalized.length) {
    return 'feature'
  }
  return 'unclassified'
}

export function AcceptanceGoalResult({
  document,
  plan,
  goal,
  decisionSource,
  disabled,
  onChange,
  onOpenTask,
  metrics
}: {
  document: AcceptanceMaterial
  plan: PlanningMaterial
  goal: VersionGoal
  decisionSource: string
  disabled: boolean
  onChange(document: AcceptanceMaterial): void
  onOpenTask(task: CycleTaskSnapshot): Promise<void>
  metrics?: ReactNode
}) {
  const workspace = useCycleWorkspace()
  const openMaterial = async (location: string) => {
    if (!workspace) {
      throw new Error('验收工作区尚未就绪。')
    }
    await openAcceptanceMaterial(location, workspace.context)
  }
  const result =
    document.results.find((item) => item.goalId === goal.goalId) ??
    emptyGoalResult(goal.goalId, document)
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
  const editIssueNote = (reference: PlanningMaterial['tasks'][number], note: string) => {
    edit({ issueNotes: updateIssueNote(result, reference, plan.tasks, note) })
  }
  const editIssueMark = (
    reference: PlanningMaterial['tasks'][number],
    mark: 'carry' | 'risk',
    value: boolean
  ) => {
    edit({ issueMarks: updateIssueMark(result, reference, plan.tasks, mark, value) })
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
        <div className="va-story-cell">
          <span className="va-label">约定交付</span>
          <p>{goal.deliverable?.trim() || '未约定交付件'}</p>
        </div>
        <label className="va-story-cell">
          <span>进展</span>
          <textarea
            rows={2}
            value={result.progress ?? ''}
            placeholder="本轮实际进展；没有读数时保持事实描述"
            onChange={(event) => edit({ progress: event.target.value })}
          />
        </label>
        <div className="va-story-cell va-material-cell">
          <span className="va-label">材料</span>
          {(result.materials ?? []).map((material) => (
            <a
              key={`${material.label}:${material.url}`}
              href={material.url}
              title={material.url}
              onClick={(event) => {
                event.preventDefault()
                void openMaterial(material.url).catch((reason) =>
                  setError(reason instanceof Error ? reason.message : String(reason))
                )
              }}
            >
              {material.label || material.url}
            </a>
          ))}
          {!result.materials?.length && !result.deliveries.length && (
            <span className="va-muted">暂无材料链接</span>
          )}
        </div>
      </div>
      {freshness === 'changed' && (
        <div className="va-decision-row">
          <button
            className="wb-btn wb-btn-sm"
            onClick={() => void decide(result.decision?.outcome ?? 'pending')}
          >
            重新确认此结论
          </button>
        </div>
      )}
      {goal.acceptance?.trim() && (
        <div className="va-acceptance-criteria">
          <span className="va-label">验收标准</span>
          <p>{goal.acceptance}</p>
        </div>
      )}
      {metrics && <div className="vc-goal-metrics">{metrics}</div>}
      <label className={gap ? 'va-note va-gap' : 'va-note'}>
        {gap ? '未达项' : '验收依据'}
        <span className="va-readonly-note">{result.note || 'Unknown；请在进展中补充事实依据'}</span>
      </label>
      {result.deliveries.length > 0 && (
        <AcceptanceDeliveryDetails result={result} onOpenMaterial={openMaterial} />
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
      <details className="va-issue-blocks" aria-label={`${goal.title} 关联 Issue`}>
        <summary className="va-issue-blocks-summary">关联 Issue · {relatedIssues.length}</summary>
        {!relatedIssues.length && <p className="va-muted">暂无关联 Issue</p>}
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
            <details className="va-issue-group" key={group.key}>
              <summary>
                {group.label} · {items.length}
              </summary>
              {items.map((reference) => {
                const key = issueKey(reference)
                const snapshot = snapshotByKey.get(key)
                const task = snapshot?.kind === 'ready' ? snapshot : undefined
                const unavailableReason = snapshot?.kind === 'unavailable' ? snapshot.error : null
                const mark = issueMarkFor(result, reference, plan.tasks)
                const note = issueNoteFor(result, reference, plan.tasks)
                const closed = isClosedIssueState(task?.state)
                const issueTone = closed
                  ? ''
                  : mark?.risk
                    ? ' is-risk'
                    : mark?.carry || task !== undefined
                      ? ' is-carry'
                      : ''
                return (
                  <div className={`va-issue-row${issueTone}`} key={key}>
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
                        {task ? readableTaskState(task.state) : 'Unknown'}
                        {task?.assignee ? ` · ${task.assignee}` : ''}
                      </span>
                    </div>
                    {closed ? (
                      <span className="va-muted">{note || '无备注'}</span>
                    ) : (
                      <input
                        aria-label={`Issue ${reference.number} 备注`}
                        value={note ?? ''}
                        placeholder="本轮进展/备注"
                        onChange={(event) => editIssueNote(reference, event.target.value)}
                      />
                    )}
                    {!closed && (
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
                            disabled={disabled || !mark?.carry}
                            onChange={(event) =>
                              editIssueMark(reference, 'risk', event.target.checked)
                            }
                          />
                          风险
                        </label>
                      </div>
                    )}
                  </div>
                )
              })}
            </details>
          )
        })}
      </details>
    </fieldset>
  )
}
