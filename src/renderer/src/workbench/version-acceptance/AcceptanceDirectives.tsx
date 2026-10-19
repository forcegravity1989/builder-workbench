import { useState } from 'react'
import type {
  AcceptanceMeetingDirective,
  AcceptanceMaterial,
  PlanningMaterial
} from '../../../../shared/workbench/version-material'
import { emptyGoalResult } from './acceptance-model'

export function AcceptanceDirectives({
  document,
  plan,
  disabled,
  onChange
}: {
  document: AcceptanceMaterial
  plan: PlanningMaterial
  disabled: boolean
  onChange(document: AcceptanceMaterial, goalId: string): void
}) {
  const [targetGoalId, setTargetGoalId] = useState(plan.goals[0]?.goalId ?? '')
  const entries = document.results.flatMap((result) =>
    (result.meetingDirectives ?? []).map((directive) => ({ goalId: result.goalId, directive }))
  )
  const update = (goalId: string, directives: AcceptanceMeetingDirective[]) => {
    const results = document.results.some((result) => result.goalId === goalId)
      ? document.results
      : [...document.results, emptyGoalResult(goalId, document)]
    onChange(
      {
        ...document,
        results: results.map((result) =>
          result.goalId === goalId ? { ...result, meetingDirectives: directives } : result
        )
      },
      goalId
    )
  }
  const add = () => {
    if (!plan.goals.some((goal) => goal.goalId === targetGoalId)) {
      return
    }
    const current =
      document.results.find((result) => result.goalId === targetGoalId) ??
      emptyGoalResult(targetGoalId, document)
    let sequence = (current.meetingDirectives ?? []).length + 1
    while ((current.meetingDirectives ?? []).some((item) => item.id === `manual-${sequence}`)) {
      sequence += 1
    }
    update(targetGoalId, [
      ...(current.meetingDirectives ?? []),
      {
        id: `manual-${sequence}`,
        text: '',
        tag: 'record-remaining',
        status: 'pending',
        source: 'manual'
      }
    ])
  }
  const directivesFor = (goalId: string) =>
    document.results.find((result) => result.goalId === goalId)?.meetingDirectives ?? []
  return (
    <section className="va-directives" aria-label="会议指导与遗留">
      <div className="va-directives-head">
        <strong>会议指导与遗留</strong>
        <button
          type="button"
          className="wb-btn wb-btn-ghost wb-btn-sm"
          disabled={disabled || plan.goals.length === 0}
          onClick={add}
        >
          人工补记
        </button>
        <label className="va-directive-target">
          <span>关联目标</span>
          <select
            aria-label="人工补记关联目标"
            value={targetGoalId}
            disabled={disabled || plan.goals.length === 0}
            onChange={(event) => setTargetGoalId(event.target.value)}
          >
            {plan.goals.map((goal) => (
              <option key={goal.goalId} value={goal.goalId}>
                {goal.title || goal.goalId}
              </option>
            ))}
          </select>
        </label>
      </div>
      {entries.length === 0 && <span className="va-muted">暂无待确认指导</span>}
      {entries.map(({ goalId, directive }) => {
        const currentDirectives = directivesFor(goalId)
        const replace = (next: AcceptanceMeetingDirective[]) => update(goalId, next)
        return (
          <div className="va-directive-row" key={`${goalId}:${directive.id}`}>
            <span className="va-muted">
              {plan.goals.find((goal) => goal.goalId === goalId)?.title ?? '未关联目标'} ·{' '}
              {directive.source === 'transcript-summary'
                ? 'AI 总结'
                : directive.sourceRef?.startsWith('conversation:')
                  ? '人工提供 · AI 整理'
                  : '人工补记'}
              {directive.sourceRef ? ` · ${directive.sourceRef}` : ''}
            </span>
            <input
              aria-label="会议指导"
              value={directive.text}
              readOnly={disabled || directive.status === 'confirmed'}
              placeholder="记录会议指导或遗留"
              onChange={(event) =>
                replace(
                  currentDirectives.map((item) =>
                    item.id === directive.id ? { ...item, text: event.target.value } : item
                  )
                )
              }
            />
            <select
              aria-label="会议指导标签"
              value={directive.tag}
              disabled={disabled || directive.status === 'confirmed'}
              onChange={(event) =>
                replace(
                  currentDirectives.map((item) =>
                    item.id === directive.id
                      ? { ...item, tag: event.target.value as AcceptanceMeetingDirective['tag'] }
                      : item
                  )
                )
              }
            >
              <option value="resolved-this-acceptance">本次验收已解决</option>
              <option value="next-week-plan">纳入下周计划</option>
              <option value="record-remaining">记录遗留</option>
            </select>
            {directive.status === 'confirmed' ? (
              <span className="va-confirmed">已确认</span>
            ) : (
              <button
                type="button"
                className="wb-btn wb-btn-secondary wb-btn-sm"
                disabled={disabled || !directive.text.trim()}
                onClick={() =>
                  replace(
                    currentDirectives.map((item) =>
                      item.id === directive.id
                        ? { ...item, status: 'confirmed', confirmedAt: new Date().toISOString() }
                        : item
                    )
                  )
                }
              >
                确认
              </button>
            )}
            <button
              type="button"
              className="wb-btn wb-btn-ghost wb-btn-sm"
              disabled={disabled}
              onClick={() => replace(currentDirectives.filter((item) => item.id !== directive.id))}
            >
              删除
            </button>
          </div>
        )
      })}
    </section>
  )
}
