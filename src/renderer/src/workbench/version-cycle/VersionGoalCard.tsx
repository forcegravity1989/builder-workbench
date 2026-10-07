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
  const editable = !readOnly && Boolean(onChange)
  return (
    <article className="vc-goal" data-goal-id={goal.goalId}>
      <span className="vc-goal-number">G{index + 1}</span>
      <div className="vc-goal-content">
        {editable ? (
          <>
            <label className="vc-goal-title">
              <span>目标</span>
              <textarea
                aria-label={`目标 ${index + 1}`}
                value={goal.title}
                rows={1}
                placeholder="明确本版要达成的结果"
                onChange={(event) => onChange?.({ ...goal, title: event.target.value })}
              />
            </label>
            <label>
              <span>交付件</span>
              <textarea
                rows={1}
                aria-label={`G${index + 1} 交付件`}
                placeholder="交付什么"
                value={goal.deliverable ?? ''}
                onChange={(event) => onChange?.({ ...goal, deliverable: event.target.value })}
              />
            </label>
            <label>
              <span>验收标准</span>
              <textarea
                aria-label={`G${index + 1} 验收标准`}
                placeholder="可选，补充如何验收交付件"
                value={goal.acceptance ?? ''}
                rows={1}
                onChange={(event) => onChange?.({ ...goal, acceptance: event.target.value })}
              />
            </label>
          </>
        ) : (
          <>
            <div className="vc-goal-heading">
              <h3>{goal.title || '待明确目标'}</h3>
              {actions}
            </div>
            {goal.deliverable?.trim() && (
              <p>
                <span className="vc-label">约定交付</span>
                {goal.deliverable}
              </p>
            )}
            {goal.acceptance && (
              <p>
                <span className="vc-label">验收标准</span>
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
