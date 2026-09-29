import { Plus, Presentation } from 'lucide-react'
import type { Ref } from 'react'
import type { PlanningMaterial, VersionGoal } from '../../../../shared/workbench/version-material'
import { VersionGoalCard } from '../version-cycle/VersionGoalCard'
import { PlanGoalMetrics } from './PlanGoalMetrics'
import type { usePlanMetrics } from './use-plan-metrics'
export function PlanningGoals({
  plan,
  disabled,
  edit,
  metrics,
  prepare,
  sectionRef,
  onMinutes
}: {
  plan?: PlanningMaterial
  disabled: boolean
  edit(plan: PlanningMaterial): void
  metrics: ReturnType<typeof usePlanMetrics>
  prepare(): void
  sectionRef: Ref<HTMLElement>
  onMinutes(): void
}) {
  const changeGoal = (goal: VersionGoal) => {
    if (plan) {
      edit({
        ...plan,
        goals: plan.goals.map((item) => (item.goalId === goal.goalId ? goal : item))
      })
    }
  }
  return (
    <section ref={sectionRef}>
      <div className="vp-section-heading">
        <h2>当前版本目标</h2>
        <span className="vp-muted">Top 3</span>
        <button className="wb-btn wb-btn-sm" disabled={!plan} onClick={onMinutes}>
          <Presentation size={14} />
          预览纪要
        </button>
      </div>
      <fieldset disabled={disabled} className="vp-goals">
        {(plan?.goals.length ?? 0) === 0 && (
          <p className="vp-empty-goals vp-muted">
            {plan
              ? '从一条清楚的结果目标开始。'
              : '选择已有版本，或在左侧“新建计划”中明确本版目标。'}
          </p>
        )}
        {plan?.goals.map((goal, index) => (
          <VersionGoalCard
            key={goal.goalId}
            goal={goal}
            index={index}
            onChange={changeGoal}
            metrics={
              <PlanGoalMetrics
                goal={goal}
                onChange={changeGoal}
                metrics={metrics}
                prepare={prepare}
              />
            }
          />
        ))}
        {plan && (
          <div className="vp-add-goal">
            <button
              className="wb-btn wb-btn-sm"
              onClick={() =>
                edit({
                  ...plan,
                  goals: [
                    ...plan.goals,
                    { goalId: crypto.randomUUID(), title: '', metricTargets: [] }
                  ]
                })
              }
            >
              <Plus size={14} />
              添加目标
            </button>
          </div>
        )}
      </fieldset>
    </section>
  )
}
