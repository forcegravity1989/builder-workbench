import React from 'react'
import { PlanText } from './PlanText'
import {
  newDeliverable,
  newGoal,
  type PlanningDocument,
  type PlanningGoal
} from './plan-week-document'
import {
  GOAL_RESULT_OPTIONS,
  GOAL_RESULT_TONES,
  goalProgressWidth,
  visibleResultTasks,
  visibleSessions
} from './plan-week-view'

export function PlanResultsPane({
  data,
  onChange
}: {
  data: PlanningDocument
  onChange: (updater: (current: PlanningDocument) => PlanningDocument) => void
}): React.JSX.Element {
  const tasks = visibleResultTasks(data.results.tasks)
  const sessions = visibleSessions(data.results.sessions)
  return (
    <div className="plan-step plan-step-1">
      <section className="sec">
        <div className="block-title">
          <h2>目标 · 完成情况</h2>
          <span className="wb-tag wb-tag-outline">{data.results.version_label}</span>
        </div>
        <div className="goals">
          {data.results.goals.length === 0 ? (
            <p className="empty-list">还没有上周目标，点击下方添加。</p>
          ) : (
            data.results.goals.map((goal, index) => (
              <ResultGoalCard
                key={goal.id}
                goal={goal}
                onPatch={(next) =>
                  onChange((current) => ({
                    ...current,
                    results: {
                      ...current.results,
                      goals: current.results.goals.map((item, i) => (i === index ? next : item))
                    }
                  }))
                }
                onRemove={() =>
                  onChange((current) => ({
                    ...current,
                    results: {
                      ...current.results,
                      goals: current.results.goals.filter((_, i) => i !== index)
                    }
                  }))
                }
              />
            ))
          )}
        </div>
        <button
          type="button"
          className="wb-btn wb-btn-ghost wb-btn-sm"
          onClick={() =>
            onChange((current) => ({
              ...current,
              results: {
                ...current.results,
                goals: [...current.results.goals, newGoal(current.results.goals)]
              }
            }))
          }
        >
          ＋ 添加目标
        </button>
      </section>

      <section className="sec">
        <div className="block-title">
          <h2>版本交付件</h2>
        </div>
        <div className="task-table">
          <div className="delivery-row head">
            <span>交付内容</span>
            <span>所属目标</span>
            <span>链接</span>
            <span />
          </div>
          {data.results.deliverables.length === 0 ? (
            <p className="empty-list">还没有版本交付件，点击下方添加。</p>
          ) : (
            data.results.deliverables.map((item, index) => (
              <div className="delivery-row" key={item.id}>
                <PlanText
                  value={item.label}
                  placeholder="交付内容"
                  onChange={(label) => patchDeliverable(onChange, index, { ...item, label })}
                />
                <PlanText
                  value={item.goal}
                  placeholder="所属目标"
                  onChange={(goal) => patchDeliverable(onChange, index, { ...item, goal })}
                />
                <PlanText
                  value={item.url}
                  placeholder="链接或仓库内路径"
                  onChange={(url) => patchDeliverable(onChange, index, { ...item, url })}
                />
                <button
                  type="button"
                  className="wb-btn wb-btn-ghost wb-btn-sm"
                  aria-label="删除版本交付件"
                  onClick={() =>
                    onChange((current) => ({
                      ...current,
                      results: {
                        ...current.results,
                        deliverables: current.results.deliverables.filter((_, i) => i !== index)
                      }
                    }))
                  }
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>
        <button
          type="button"
          className="wb-btn wb-btn-ghost wb-btn-sm"
          onClick={() =>
            onChange((current) => ({
              ...current,
              results: {
                ...current.results,
                deliverables: [...current.results.deliverables, newDeliverable()]
              }
            }))
          }
        >
          ＋ 添加交付件
        </button>
      </section>

      <section className="sec">
        <div className="block-title">
          <h2>任务点进展与交付</h2>
        </div>
        <div className="task-table">
          <div className="task-row results-task-row head">
            <span>编号</span>
            <span>类型</span>
            <span>上周要做的事</span>
            <span>实际进展</span>
            <span>挂目标</span>
          </div>
          {tasks.length === 0 ? (
            <p className="empty-list">尚未采集到任务 Issue</p>
          ) : (
            tasks.map((task) => (
              <div className="task-row results-task-row" key={task.id}>
                {task.url ? (
                  <a className="id" href={task.url} target="_blank" rel="noreferrer">
                    #{String(task.number).replace(/^#/, '')}
                  </a>
                ) : (
                  <span className="id">#{String(task.number).replace(/^#/, '')}</span>
                )}
                <span className="task-kind">{task.kind === 'bug' ? 'Bug' : 'Feature'}</span>
                <div className="task-main">{task.title}</div>
                <PlanText
                  value={task.progress_note}
                  placeholder="—"
                  onChange={(progress_note) =>
                    onChange((current) => ({
                      ...current,
                      results: {
                        ...current.results,
                        tasks: current.results.tasks.map((item) =>
                          item.id === task.id ? { ...item, progress_note } : item
                        )
                      }
                    }))
                  }
                />
                {task.goal ? <span className="wb-tag wb-tag-outline">{task.goal}</span> : <span />}
              </div>
            ))
          )}
        </div>
      </section>

      <section className="sec">
        <div className="block-title">
          <h2>会话记录</h2>
          <span className="muted mono">{data.results.session_label}</span>
        </div>
        <div className="wb-card session-log">
          <div className="session-lines">
            {sessions.length === 0 ? (
              <p className="empty-list">尚未取得会话记录</p>
            ) : (
              sessions.map((session) => (
                <div className="session-line" key={session.id ?? session.title}>
                  <span className="txt">{session.title}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

function ResultGoalCard({
  goal,
  onPatch,
  onRemove
}: {
  goal: PlanningGoal
  onPatch: (goal: PlanningGoal) => void
  onRemove: () => void
}): React.JSX.Element {
  const width = goalProgressWidth(goal)
  const statusLabel = GOAL_RESULT_OPTIONS.includes(
    goal.status.label as (typeof GOAL_RESULT_OPTIONS)[number]
  )
    ? goal.status.label
    : '无值'
  return (
    <div className="wb-card goal">
      <span className="card-kicker">{goal.label}</span>
      <PlanText
        value={goal.title}
        placeholder="一句目标"
        ariaLabel="目标"
        onChange={(title) => onPatch({ ...goal, title })}
      />
      <span className="bar" role="progressbar" aria-label="目标进度">
        <i style={{ width: `${width ?? 0}%` }} />
      </span>
      <span className="goal-meta">
        <PlanText
          value={goal.reading}
          placeholder="—"
          ariaLabel="实际读数"
          onChange={(reading) => onPatch({ ...goal, reading })}
        />
        <span aria-hidden="true">/</span>
        <PlanText
          value={goal.target}
          placeholder="—"
          ariaLabel="目标值"
          onChange={(target) => onPatch({ ...goal, target })}
        />
        <select
          className={`wb-tag wb-tag-${GOAL_RESULT_TONES[statusLabel] ?? 'neutral'} goal-result`}
          aria-label="目标结果"
          value={statusLabel}
          onChange={(event) => {
            const label = event.target.value
            onPatch({ ...goal, status: { label, tone: GOAL_RESULT_TONES[label] ?? 'neutral' } })
          }}
        >
          {GOAL_RESULT_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="wb-btn wb-btn-ghost wb-btn-sm"
          aria-label="删除上周目标"
          onClick={onRemove}
        >
          ×
        </button>
      </span>
    </div>
  )
}

function patchDeliverable(
  onChange: (updater: (current: PlanningDocument) => PlanningDocument) => void,
  index: number,
  item: PlanningDocument['results']['deliverables'][number]
): void {
  onChange((current) => ({
    ...current,
    results: {
      ...current.results,
      deliverables: current.results.deliverables.map((row, i) => (i === index ? item : row))
    }
  }))
}
