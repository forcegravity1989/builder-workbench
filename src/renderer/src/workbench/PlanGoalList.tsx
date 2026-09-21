import React from 'react'
import { PlanText } from './PlanText'
import type { PlanningGoal } from './plan-week-document'

export function PlanGoalList({
  goals,
  placeholder,
  emptyText,
  onChange
}: {
  goals: PlanningGoal[]
  placeholder: string
  emptyText: string
  onChange: (goals: PlanningGoal[]) => void
}): React.JSX.Element {
  if (goals.length === 0) {
    return <p className="empty-list">{emptyText}</p>
  }
  return (
    <div className="goals">
      {goals.map((goal, index) => (
        <div className="wb-card goal" key={goal.id}>
          <span className="card-kicker">{goal.label}</span>
          <PlanText
            value={goal.title}
            placeholder={placeholder}
            ariaLabel="目标"
            onChange={(title) =>
              onChange(goals.map((item, i) => (i === index ? { ...item, title } : item)))
            }
          />
          <button
            type="button"
            className="wb-btn wb-btn-ghost wb-btn-sm"
            aria-label="删除目标"
            onClick={() => onChange(goals.filter((_, i) => i !== index))}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
