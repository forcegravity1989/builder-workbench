import { ChevronDown, ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { VersionGoalCardProps } from './ports'
import { readGoalCardExpanded, writeGoalCardExpanded } from '../cycle-view-state'
import './version-cycle.css'

/**
 * Read-only goal card skeleton for the acceptance screen (the plan screen uses
 * the G3 PlanningGoalCard). Plan editing branches and the deliverable textarea
 * retired with the G3 rebuild; acceptance keeps its own result/summary slots.
 */
export function VersionGoalCard({
  goal,
  index,
  metrics,
  result,
  actions,
  defaultOpen = false,
  expanded,
  expandedSignal,
  summary,
  extra,
  hideReadOnlyStory = false,
  viewStateKey
}: VersionGoalCardProps) {
  const [open, setOpen] = useState(() =>
    readGoalCardExpanded(viewStateKey, expanded ?? defaultOpen)
  )
  const previousStateKey = useRef(viewStateKey)
  const previousExpanded = useRef(expanded)
  const previousExpandedSignal = useRef(expandedSignal)
  useEffect(() => {
    const signalChanged = expandedSignal !== previousExpandedSignal.current
    const valueChanged = expanded !== previousExpanded.current
    if (viewStateKey !== previousStateKey.current) {
      setOpen(readGoalCardExpanded(viewStateKey, expanded ?? defaultOpen))
    } else if (expanded !== undefined && (signalChanged || valueChanged)) {
      setOpen(expanded)
      writeGoalCardExpanded(viewStateKey, expanded)
    }
    previousStateKey.current = viewStateKey
    previousExpanded.current = expanded
    previousExpandedSignal.current = expandedSignal
  }, [expanded, expandedSignal, viewStateKey, defaultOpen])
  return (
    <article className={`vc-goal${open ? ' is-open' : ' is-collapsed'}`} data-goal-id={goal.goalId}>
      <div className="vc-goal-content">
        <div className="vc-goal-heading">
          <button
            type="button"
            className="vc-goal-toggle"
            aria-expanded={open}
            onClick={() => {
              const next = !open
              setOpen(next)
              writeGoalCardExpanded(viewStateKey, next)
            }}
          >
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span className="vc-goal-number">G{index + 1}</span>
            <strong>{goal.title || '待明确目标'}</strong>
          </button>
          {summary}
          {actions}
        </div>
        {open && !hideReadOnlyStory ? (
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
        {open && metrics && <div className="vc-goal-metrics">{metrics}</div>}
        {open && extra}
        {open && result && <div className="vc-goal-result">{result}</div>}
      </div>
    </article>
  )
}
