import type { Ref } from 'react'
import type { PlanningMaterial, VersionGoal } from '../../../../shared/workbench/version-material'
import { VersionGoalCard } from '../version-cycle/VersionGoalCard'
import { PlanGoalMetrics } from './PlanGoalMetrics'
import type { usePlanMetrics } from './use-plan-metrics'
export function PlanningGoals({
  plan,
  edit,
  metrics,
  prepare,
  sectionRef
}: {
  plan: PlanningMaterial
  edit(plan: PlanningMaterial): void
  metrics: ReturnType<typeof usePlanMetrics>
  prepare(): void
  sectionRef: Ref<HTMLElement>
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
        <h2>当前版本 Top3 目标</h2>
        <button
          className="wb-btn wb-btn-ghost wb-btn-sm"
          onClick={() =>
            edit({
              ...plan,
              goals: [...plan.goals, { goalId: crypto.randomUUID(), title: '', metricTargets: [] }]
            })
          }
        >
          添加目标
        </button>
      </div>
      <div className="vp-goals">
        {plan.goals.length === 0 && (
          <p className="vp-muted vp-empty-goals">从一条清楚的结果目标开始。</p>
        )}
        {plan.goals.map((goal, index) => (
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
      </div>
    </section>
  )
}
