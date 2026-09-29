import { React, useEffect, useState } from 'react'
import { Field, ModelSessionIcon } from './shared.jsx'
import {
  ChartNoAxesCombined,
  ChevronRight,
  GitPullRequest,
  Presentation,
  RefreshCw
} from 'lucide-react'
import { metrics } from './snapshot.js'

function PlanningContent({
  disabled,
  goals,
  metricPrep,
  progress,
  promptConversation,
  refreshMetrics,
  review,
  risk,
  sessionAvailable,
  setNotice,
  setProgress,
  setRisk,
  openSource,
  update,
  versionTasks
}) {
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
        <h2>当前版本目标</h2>
        <span>Top 3</span>
        <button className="btn btn-secondary" onClick={review} disabled={disabled}>
          <Presentation />
          预览纪要
        </button>
      </div>
      <section className="goal-sheet">
        {disabled && <p className="goal-row">选择已有版本，或在左侧“新建计划”中明确本版目标。</p>}
        {goals.map((g) => {
          const m = metrics.find((x) => x.id === g.metricId)
          return (
            <article className="goal-row" data-goal={g.id} key={g.id}>
              <div className="goal-heading">
                <span className="goal-id">{g.label}</span>
                <Field
                  label={`${g.label} 目标`}
                  value={g.title}
                  onChange={(v) => update(g.id, 'title', v)}
                />
              </div>
              <div className="delivery-row">
                <span>交付件</span>
                <Field
                  label={`${g.label} 交付件`}
                  value={g.delivery}
                  onChange={(v) => update(g.id, 'delivery', v)}
                  placeholder="交付什么"
                />
              </div>
              <div className="criteria-row">
                <span>验收标准</span>
                <Field
                  label={`${g.label} 验收标准`}
                  value={g.criteria}
                  onChange={(value) => update(g.id, 'criteria', value)}
                  placeholder="可选，补充如何验收交付件"
                />
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
                  <button className="btn btn-secondary metric-collect" onClick={refreshMetrics}>
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
              <div className="metric-add">
                <button
                  className="btn btn-secondary"
                  title="刷新指标目录"
                  aria-label="刷新指标目录"
                  onClick={refreshMetrics}
                >
                  <RefreshCw />
                </button>
                <button
                  className="btn btn-secondary"
                  title="新建会话，配置指标"
                  onClick={() => metricPrep(null)}
                >
                  <ModelSessionIcon />
                  配置指标
                </button>
              </div>
            </article>
          )
        })}
      </section>
      {versionTasks(prepareRequest, disabled)}
      <section className="card planning-archive" aria-label="计划归档">
        <GitPullRequest />
        <p>核对目标与 Issue，发起 PR 供 Leader 评审。</p>
        <button
          className="btn btn-secondary"
          disabled={disabled}
          onClick={() => {
            prepareRequest(
              '请核对当前 v0.5 计划是否已由 Builder 评审、目标对应的 Issue 是否拆解完毕，列出待确认项；经我确认后保存计划材料并发起归档 PR，提供 PR 链接供 Leader 检视合入。不要替人确认评审通过或合入 PR。'
            )
          }}
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
