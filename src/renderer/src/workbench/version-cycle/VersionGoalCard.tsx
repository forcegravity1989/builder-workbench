import { useState } from 'react'
import type { VersionGoalCardProps } from './ports'
import './version-cycle.css'

export function VersionGoalCard({
  goal,
  index,
  readOnly = false,
  onChange,
  metrics,
  result,
  actions
}: VersionGoalCardProps) {
  const [editing, setEditing] = useState(false)
  const editable = !readOnly && Boolean(onChange)
  return (
    <article className="vc-goal" data-goal-id={goal.goalId}>
      <span className="vc-goal-number">G{index + 1}</span>
      <div className="vc-goal-content">
        {editing && editable ? (
          <>
            <label>
              目标
              <textarea
                aria-label={`目标 ${index + 1}`}
                value={goal.title}
                rows={2}
                onChange={(event) => onChange?.({ ...goal, title: event.target.value })}
              />
            </label>
            <label>
              交付件
              <input
                value={goal.deliverable ?? ''}
                onChange={(event) => onChange?.({ ...goal, deliverable: event.target.value })}
              />
            </label>
            <label>
              验收说明
              <textarea
                value={goal.acceptance ?? ''}
                rows={2}
                onChange={(event) => onChange?.({ ...goal, acceptance: event.target.value })}
              />
            </label>
            <button className="wb-btn wb-btn-sm" onClick={() => setEditing(false)}>
              收起编辑
            </button>
          </>
        ) : (
          <>
            <div className="vc-goal-heading">
              <h3>{goal.title || '待明确目标'}</h3>
              {editable && (
                <button
                  className="wb-btn wb-btn-ghost wb-btn-sm"
                  aria-label={`编辑目标 ${index + 1}`}
                  onClick={() => setEditing(true)}
                >
                  编辑
                </button>
              )}
              {actions}
            </div>
            {goal.deliverable && (
              <p>
                <span className="vc-label">交付件</span>
                {goal.deliverable}
              </p>
            )}
            {goal.acceptance && (
              <p>
                <span className="vc-label">验收说明</span>
                {goal.acceptance}
              </p>
            )}
          </>
        )}
        {metrics && <div className="vc-goal-metrics">{metrics}</div>}
        {result && <div className="vc-goal-result">{result}</div>}
      </div>
    </article>
  )
}
