import { ChevronDown, ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { VersionGoalCardProps } from './ports'
import './version-cycle.css'

export function VersionGoalCard({
  goal,
  index,
  readOnly = false,
  onChange,
  metrics,
  result,
  actions,
  defaultOpen = !readOnly,
  expanded,
  summary,
  extra
}: VersionGoalCardProps) {
  const editable = !readOnly && Boolean(onChange)
  const [open, setOpen] = useState(expanded ?? defaultOpen)
  const previousExpanded = useRef(expanded)
  useEffect(() => {
    if (expanded !== undefined && expanded !== previousExpanded.current) {
      setOpen(expanded)
    }
    previousExpanded.current = expanded
  }, [expanded])
  return (
    <article className={`vc-goal${open ? ' is-open' : ' is-collapsed'}`} data-goal-id={goal.goalId}>
      <div className="vc-goal-content">
        <div className="vc-goal-heading">
          <button
            type="button"
            className="vc-goal-toggle"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span className="vc-goal-number">G{index + 1}</span>
            <strong>{goal.title || '待明确目标'}</strong>
          </button>
          {summary}
          {actions}
        </div>
        {open && editable ? (
          <div className="vc-goal-story">
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
            <label>
              <span>计划完成</span>
              <input
                aria-label={`G${index + 1} 计划完成`}
                placeholder="可选日期或版本"
                value={goal.deadline ?? ''}
                onChange={(event) => onChange?.({ ...goal, deadline: event.target.value })}
              />
            </label>
            <label>
              <span>负责人</span>
              <input
                aria-label={`G${index + 1} 负责人`}
                placeholder="可选"
                value={goal.owner ?? ''}
                onChange={(event) => onChange?.({ ...goal, owner: event.target.value })}
              />
            </label>
          </div>
        ) : open ? (
          <div className="vc-goal-story">
            {goal.deliverable?.trim() && (
              <div className="vc-story-cell">
                <span className="vc-label">约定交付</span>
                <p>{goal.deliverable}</p>
              </div>
            )}
            {goal.acceptance && (
              <div className="vc-story-cell">
                <span className="vc-label">验收标准</span>
                <p>{goal.acceptance}</p>
              </div>
            )}
            {(goal.deadline || goal.owner) && (
              <div className="vc-story-cell">
                <span className="vc-label">计划</span>
                <p>{[goal.deadline, goal.owner].filter(Boolean).join(' · ')}</p>
              </div>
            )}
          </div>
        ) : null}
        {open && extra}
        {open && metrics && <div className="vc-goal-metrics">{metrics}</div>}
        {open && result && <div className="vc-goal-result">{result}</div>}
      </div>
    </article>
  )
}
