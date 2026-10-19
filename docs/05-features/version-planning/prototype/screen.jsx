import { React, useEffect, useState } from 'react'
import {
  CLASS_LABELS,
  Field,
  Lamp,
  ModelSessionIcon,
  assigneeOf,
  issueClass,
  readableState,
  titleForTask
} from './shared.jsx'
import {
  ChartNoAxesCombined,
  Check,
  ChevronDown,
  ChevronRight,
  GitPullRequest,
  ListTodo,
  Presentation,
  RefreshCw,
  X
} from 'lucide-react'
import { metrics } from './snapshot.js'

// 计划与验收共用同一套目标卡语言：收起=结论行，展开=完整内容。
// 计划卡展开态承载「制定」：目标句、交付件、验收标准、指标承诺、计划完成/负责人、关联 Issue 与拆解。
function planTone(g) {
  if (!g.title.trim()) {
    return 'gray'
  }
  return g.delivery.trim() || g.metricId ? 'green' : 'yellow'
}

function PlanningContent({
  disabled,
  goals,
  goalIssues,
  metricPrep,
  openIssue,
  progress,
  promptConversation,
  refreshMetrics,
  removeGoal,
  review,
  risk,
  sessionAvailable,
  setNotice,
  setProgress,
  setRisk,
  openSource,
  update,
  version
}) {
  // 计划以编辑为主：卡片默认展开，收起是用户动作。
  const [openGoals, setOpenGoals] = useState({})
  const isOpen = (g) => openGoals[g.id] ?? true
  const setAll = (open) => setOpenGoals(Object.fromEntries(goals.map((g) => [g.id, open])))
  function changeMetric(goal, metricId) {
    if (metricId === goal.metricId) {
      return
    }
    update(goal.id, 'metricId', metricId)
    update(goal.id, 'target', '')
  }
  function prepareRequest(text) {
    if (!sessionAvailable) {
      setNotice('请先在左侧新建或打开会话，再准备请求。')
      return
    }
    promptConversation(text)
  }
  return (
    <>
      <section className="card planning-brief">
        <div className="planning-field">
          <div className="planning-brief-head">
            <label htmlFor="planning-progress">版本进展</label>
            <button className="btn btn-secondary" disabled={disabled} onClick={openSource}>
              上版验收
              <ChevronRight />
            </button>
          </div>
          <Field
            id="planning-progress"
            className="input"
            label="版本进展"
            value={progress}
            onChange={setProgress}
            rows={2}
            disabled={disabled}
          />
        </div>
        <div className="planning-field">
          <label htmlFor="planning-risk">风险上报</label>
          <Field
            id="planning-risk"
            className="input"
            label="风险上报"
            value={risk}
            onChange={setRisk}
            placeholder="有风险时填写"
            rows={2}
            disabled={disabled}
          />
        </div>
      </section>
      <div className="section-heading">
        <h2>当前版本 Top 3 目标</h2>
        <span className="section-heading-actions">
          <button
            className="btn btn-ghost btn-icon"
            title="全部展开"
            aria-label="全部展开"
            disabled={disabled}
            onClick={() => setAll(true)}
          >
            <ChevronDown />
          </button>
          <button
            className="btn btn-ghost btn-icon"
            title="全部收起"
            aria-label="全部收起"
            disabled={disabled}
            onClick={() => setAll(false)}
          >
            <ChevronRight />
          </button>
          <button
            className="btn btn-secondary planning-configure-metrics"
            title="新建会话，配置指标"
            onClick={() => metricPrep(null)}
          >
            <ModelSessionIcon />
            配置指标
          </button>
          <button className="btn btn-secondary" onClick={review} disabled={disabled}>
            <Presentation />
            预览纪要
          </button>
        </span>
      </div>
      <section className="goal-cards">
        {disabled && (
          <p className="goal-row">尚未选择版本。新建计划，与 Agent 一起明确本版目标。</p>
        )}
        {goals.map((g) => {
          const m = metrics.find((x) => x.id === g.metricId)
          const related = goalIssues(g)
          const open = isOpen(g)
          const groups = ['bug', 'feature', 'unclassified']
            .map((cls) => [cls, related.filter((t) => issueClass(t) === cls)])
            .filter(([, rows]) => rows.length > 0)
          return (
            <article className="goal-card" data-goal={g.id} key={g.id}>
              <div className="goal-card-head">
                <button
                  className="goal-card-toggle"
                  aria-expanded={open}
                  aria-label={`${open ? '收起' : '展开'} ${g.label} 目标卡`}
                  onClick={() => setOpenGoals((s) => ({ ...s, [g.id]: !open }))}
                >
                  {open ? <ChevronDown /> : <ChevronRight />}
                </button>
                <Lamp tone={planTone(g)} label={`目标内容：${planTone(g)}`} />
                <span className="goal-id">{g.label}</span>
                <h3 onClick={() => setOpenGoals((s) => ({ ...s, [g.id]: !open }))}>
                  {g.title.trim() || '待明确目标'}
                </h3>
                <span className="head-chips">
                  <span className="head-chip" title="关联 Issue 数">
                    <ListTodo />
                    关联 Issue · {related.length}
                  </span>
                </span>
                <button
                  className="btn btn-ghost btn-icon goal-delete"
                  title="删除目标"
                  aria-label={`删除目标 ${g.label}`}
                  disabled={disabled}
                  onClick={() => removeGoal(g.id)}
                >
                  <X />
                </button>
              </div>
              {open && (
                <div className="goal-card-body">
                  <fieldset disabled={disabled}>
                    <div className="plan-field">
                      <span className="story-label">目标句</span>
                      <Field
                        label={`${g.label} 目标`}
                        value={g.title}
                        onChange={(v) => update(g.id, 'title', v)}
                      />
                    </div>
                    <div className="card-story-row plan-story">
                      <div className="story-cell">
                        <span className="story-label">交付件</span>
                        <Field
                          label={`${g.label} 交付件`}
                          value={g.delivery}
                          onChange={(v) => update(g.id, 'delivery', v)}
                          placeholder="交付什么"
                        />
                      </div>
                      <div className="story-cell">
                        <span className="story-label">验收标准</span>
                        <Field
                          label={`${g.label} 验收标准`}
                          value={g.criteria}
                          onChange={(value) => update(g.id, 'criteria', value)}
                          placeholder="可选，补充如何验收交付件"
                        />
                      </div>
                      <div className="story-cell">
                        <span className="story-label">计划完成 / 负责人</span>
                        <div className="plan-meta-row">
                          <input
                            className="input"
                            aria-label={`${g.label} 计划完成`}
                            value={g.deadline ?? ''}
                            onChange={(e) => update(g.id, 'deadline', e.target.value)}
                            placeholder="可选，如 2026-10-17"
                          />
                          <input
                            className="input"
                            aria-label={`${g.label} 负责人`}
                            value={g.owner ?? ''}
                            onChange={(e) => update(g.id, 'owner', e.target.value)}
                            placeholder="可选"
                          />
                        </div>
                        <p className="plan-meta-hint">写入计划材料既有字段；验收屏只读展示。</p>
                      </div>
                    </div>
                    {m ? (
                      <div className="metric-row">
                        <label>
                          <ChartNoAxesCombined />
                          <select
                            aria-label={`${g.label} 指标`}
                            value={g.metricId}
                            onChange={(e) => changeMetric(g, e.target.value)}
                          >
                            <option value="">移除指标承诺</option>
                            {metrics
                              .filter((x) => x.kind === 'script')
                              .map((x) => (
                                <option key={x.id} value={x.id}>
                                  {x.name}
                                </option>
                              ))}
                          </select>
                        </label>
                        <div className="metric-value">
                          <span>当前</span>
                          <strong title="本期尚未采集">{m.current ?? '—'}</strong>
                        </div>
                        <div className="metric-target">
                          <label htmlFor={`target-${g.id}`}>
                            {m.current === null ? '目标草案' : '目标'}
                          </label>
                          <input
                            id={`target-${g.id}`}
                            aria-label={`${g.label} 指标目标`}
                            value={g.target}
                            onChange={(e) => update(g.id, 'target', e.target.value)}
                          />
                        </div>
                        <button
                          className="btn btn-secondary metric-collect"
                          onClick={refreshMetrics}
                        >
                          <RefreshCw />
                          采集
                        </button>
                      </div>
                    ) : (
                      <div className="metric-add">
                        <select
                          className="input"
                          aria-label={`${g.label} 添加指标承诺（可选）`}
                          value=""
                          onChange={(event) => changeMetric(g, event.target.value)}
                        >
                          <option value="">添加指标承诺（可选）</option>
                          {metrics
                            .filter((metric) => metric.kind === 'script')
                            .map((metric) => (
                              <option key={metric.id} value={metric.id}>
                                {metric.name}
                              </option>
                            ))}
                        </select>
                      </div>
                    )}
                  </fieldset>
                  <details className="issue-subblock">
                    <summary>
                      <ListTodo />
                      关联 Issue · {related.length}
                      <button
                        className="btn btn-ghost subblock-action"
                        disabled={disabled}
                        onClick={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          prepareRequest(
                            `请针对 ${version} ${g.label} 核对任务拆解，与我确认后创建或更新 Issue，关联版本及目标，并逐条打上 bug 或 feature 分类标签。`
                          )
                        }}
                      >
                        在会话中拆解
                      </button>
                    </summary>
                    {related.length === 0 ? (
                      <p className="goal-issues-empty">
                        该目标暂无关联 Issue；在会话中拆解并关联。
                      </p>
                    ) : (
                      groups.map(([cls, rows]) => (
                        <div className="issue-group" key={cls}>
                          <span className="issue-group-label">{CLASS_LABELS[cls]}</span>
                          {rows.map((t) => (
                            <div className="goal-issue-row" key={t.number}>
                              <span
                                className={`task-state ${t.state === 'CLOSED' ? 'closed' : 'open'}`}
                              >
                                {t.state === 'CLOSED' ? (
                                  <Check />
                                ) : (
                                  <span className="open-circle" />
                                )}
                              </span>
                              <button className="goal-issue-link" onClick={() => openIssue(t)}>
                                <span className="task-number">#{t.number}</span>
                                <span className="task-title">{titleForTask(t)}</span>
                              </button>
                              {assigneeOf(t) && (
                                <span className="task-owner" title="责任人（Issue 原生 assignee）">
                                  {assigneeOf(t)}
                                </span>
                              )}
                              <span className="task-readable-state">{readableState(t)}</span>
                            </div>
                          ))}
                        </div>
                      ))
                    )}
                  </details>
                </div>
              )}
            </article>
          )
        })}
      </section>
      <section className="card planning-archive" aria-label="计划归档">
        <GitPullRequest />
        <p>核对目标与 Issue，发起 PR 供 Leader 评审。</p>
        <button
          className="btn btn-secondary"
          disabled={disabled}
          onClick={() =>
            prepareRequest(
              '请核对当前 v0.5 计划是否已由 Builder 评审、目标对应的 Issue 是否拆解完毕，列出待确认项；经我确认后保存计划材料并发起归档 PR，提供 PR 链接供 Leader 检视合入。不要替人确认评审通过或合入 PR。'
            )
          }
        >
          归档
        </button>
      </section>
    </>
  )
}

function usePlanningDemo({ setModal, setNotice }) {
  const [source, setSource] = useState(null)
  const [editRevision, setEditRevision] = useState(0)
  const [saveState, setSaveState] = useState('已保存')
  useEffect(() => {
    if (!editRevision) {
      return
    }
    setSaveState('编辑中…')
    const timer = setTimeout(() => setSaveState('已保存'), 700)
    return () => clearTimeout(timer)
  }, [editRevision])
  const edited =
    (write) =>
    (...args) => {
      write(...args)
      setEditRevision((value) => value + 1)
    }
  const openSource = () =>
    setModal({
      type: 'planning-source',
      title: '上版验收',
      source,
      onSource: (selected) => {
        setSource(selected)
        setEditRevision((value) => value + 1)
        setNotice('原型示意：已明确选择进展来源；原有进展未改写，未保存真实文件。')
        setModal(null)
      }
    })
  return { saveState, edited, openSource }
}
export { PlanningContent, usePlanningDemo }
