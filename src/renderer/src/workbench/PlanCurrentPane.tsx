import React from 'react'
import { PlanText } from './PlanText'
import { newGoal, newTask, type PlanningDocument } from './plan-week-document'
import { PlanGoalList } from './PlanGoalList'

export function PlanCurrentPane({
  data,
  onChange
}: {
  data: PlanningDocument
  onChange: (updater: (current: PlanningDocument) => PlanningDocument) => void
}): React.JSX.Element {
  return (
    <div className="plan-step plan-step-3">
      <section className="sec">
        <div className="block-title">
          <h2>当前版本目标</h2>
        </div>
        <PlanGoalList
          goals={data.plan.goals}
          placeholder="一句 SMART 目标"
          emptyText="还没有当前版本目标，点击下方添加。"
          onChange={(goals) =>
            onChange((current) => ({ ...current, plan: { ...current.plan, goals } }))
          }
        />
        <button
          type="button"
          className="wb-btn wb-btn-ghost wb-btn-sm"
          onClick={() =>
            onChange((current) => ({
              ...current,
              plan: { ...current.plan, goals: [...current.plan.goals, newGoal(current.plan.goals)] }
            }))
          }
        >
          ＋ 添加目标
        </button>
      </section>

      <section className="sec">
        <div className="block-title">
          <h2>目标拆解 · 任务 Issue</h2>
        </div>
        <div className="task-table">
          <div className="task-row plan-task-row head">
            <span>编号</span>
            <span>类型</span>
            <span>任务</span>
            <span>挂目标</span>
            <span />
          </div>
          {data.plan.tasks.length === 0 ? (
            <p className="empty-list">还没有版本任务，点击下方添加。</p>
          ) : (
            data.plan.tasks.map((task, index) => (
              <div className="task-row plan-task-row" key={task.id}>
                {task.url ? (
                  <a className="id" href={task.url} target="_blank" rel="noreferrer">
                    {task.number ? `#${String(task.number).replace(/^#/, '')}` : ''}
                  </a>
                ) : (
                  <span className="id">
                    {task.number ? `#${String(task.number).replace(/^#/, '')}` : ''}
                  </span>
                )}
                <span className="task-kind">{task.kind === 'bug' ? 'Bug' : 'Feature'}</span>
                <PlanText
                  value={task.title}
                  placeholder="Issue 标题"
                  onChange={(title) =>
                    onChange((current) => ({
                      ...current,
                      plan: {
                        ...current.plan,
                        tasks: current.plan.tasks.map((item, i) =>
                          i === index ? { ...item, title } : item
                        )
                      }
                    }))
                  }
                />
                <PlanText
                  value={task.goal}
                  placeholder="所属目标"
                  onChange={(goal) =>
                    onChange((current) => ({
                      ...current,
                      plan: {
                        ...current.plan,
                        tasks: current.plan.tasks.map((item, i) =>
                          i === index ? { ...item, goal } : item
                        )
                      }
                    }))
                  }
                />
                <button
                  type="button"
                  className="wb-btn wb-btn-ghost wb-btn-sm"
                  aria-label="删除版本任务"
                  onClick={() =>
                    onChange((current) => ({
                      ...current,
                      plan: {
                        ...current.plan,
                        tasks: current.plan.tasks.filter((_, i) => i !== index)
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
              plan: { ...current.plan, tasks: [...current.plan.tasks, newTask()] }
            }))
          }
        >
          ＋ 添加任务
        </button>
      </section>
    </div>
  )
}
