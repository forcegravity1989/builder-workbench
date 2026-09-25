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

export function AcceptanceGoalResult({
  document,
  plan,
  goal,
  decisionSource,
  disabled,
  onChange,
  onFollowUp
}: {
  document: AcceptanceMaterial
  plan: PlanningMaterial
  goal: VersionGoal
  decisionSource: string
  disabled: boolean
  onChange(document: AcceptanceMaterial): void
  onFollowUp(text: string): void
}) {
  const result =
    document.results.find((item) => item.goalId === goal.goalId) ?? emptyGoalResult(goal.goalId)
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
      <div className="va-result-row">
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
      <label className="va-note">
        验收依据
        <input
          value={result.note}
          placeholder="判断依据、未达原因或待补证内容"
          onChange={(event) => edit({ note: event.target.value })}
        />
      </label>
      <AcceptanceDeliveryDetails
        title={goal.title}
        result={result}
        onChange={(deliveries) => edit({ deliveries })}
      />
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
      {result.nextStep && (
        <button
          className="wb-btn wb-btn-ghost wb-btn-sm"
          onClick={() =>
            onFollowUp(
              `请继续讨论 ${document.version} 的目标「${goal.title}」。原承诺：${goal.deliverable ?? goal.title}。验收说明：${result.note}。后续候选：${result.nextStep}。先核对安排，不自动承诺下版、排期或确认 Issue 完成。`
            )
          }
        >
          带入本次会话
        </button>
      )}
      {error && (
        <p role="alert" className="va-error">
          {error}
        </p>
      )}
    </fieldset>
  )
}
