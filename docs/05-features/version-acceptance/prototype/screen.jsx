import { React, useState } from 'react'
import {
  ChartNoAxesCombined,
  ChevronRight,
  ExternalLink,
  ListTodo,
  MessageSquare,
  PackageCheck,
  RefreshCw
} from 'lucide-react'
import { Field, done } from '../../version-planning/prototype/shared.jsx'
import { files, metrics, original } from '../../version-planning/prototype/snapshot.js'

function AcceptanceContent({
  current,
  goalIssues,
  hasGap,
  openIssues,
  prepareDelivery,
  promptConversation,
  refreshMetrics,
  setModal,
  tasks,
  updateResult,
  version,
  versionTasks
}) {
  const [chosenMetrics, setChosenMetrics] = useState({})
  return (
    <>
      <div className="acceptance-summary">
        <span>
          <strong>{current.length}</strong> 项目标
        </span>
        <button onClick={() => openIssues()}>
          <ListTodo />
          Issue 完成{' '}
          <strong>
            {done(tasks)} / {tasks.length}
          </strong>
          <ChevronRight />
        </button>
        <span className="pending-count">
          {current.filter((g) => g.decision === '待核对').length} 项待核对
          {current.some(hasGap) ? ` · ${current.filter(hasGap).length} 项未达` : ''}
        </span>
      </div>
      <section className="preparation-strip" aria-label="交付准备">
        <div className="preparation-title">
          <strong>
            <PackageCheck />
            交付准备
          </strong>
          <button className="btn btn-ghost" onClick={prepareDelivery}>
            <MessageSquare />
            准备交付
          </button>
        </div>
        <div className="preparation-items">
          <div>
            <span>候选提交</span>
            <b>待固定</b>
          </div>
          <div>
            <span>交付 / 出包</span>
            <b>待准备</b>
          </div>
          <div>
            <span>验证报告</span>
            <b>待关联</b>
          </div>
          <div>
            <span>Showcase</span>
            <b>待关联</b>
          </div>
        </div>
      </section>
      <section className="acceptance-sheet aligned-goals">
        {current.map((g) => {
          const m = metrics.find((x) => x.id === (chosenMetrics[g.id] || g.metricId)),
            related = goalIssues(g)
          return (
            <article className="acceptance-row" data-goal={g.id} key={g.id}>
              <div className="acceptance-heading">
                <span className="goal-id">{g.label}</span>
                <h3>{g.title}</h3>
                <button onClick={() => openIssues(g)} title="核对关联 Issue 状态">
                  <ListTodo />
                  {done(related)} / {related.length}
                  <ChevronRight />
                </button>
              </div>
              <div className="delivery-row agreed-delivery">
                <span>约定交付</span>
                <p>{version === 'v0.4' ? g.metric : g.delivery || '未约定交付件'}</p>
              </div>
              {g.criteria && (
                <div className="criteria-row">
                  <span>验收标准</span>
                  <p>{g.criteria}</p>
                </div>
              )}
              <div className="metric-row acceptance-metric">
                <label>
                  <ChartNoAxesCombined />
                  <select
                    aria-label={`${g.label} 验收指标`}
                    value={m?.id || ''}
                    onChange={(event) =>
                      setChosenMetrics((current) => ({ ...current, [g.id]: event.target.value }))
                    }
                  >
                    <option value="">选择验收指标</option>
                    {metrics.map((metric) => (
                      <option key={metric.id} value={metric.id}>
                        {metric.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="metric-target">
                  <span>
                    计划目标 ·{' '}
                    {metrics.find((metric) => metric.id === g.metricId)?.name || '未约定'}
                  </span>
                  <strong>{g.target || '未约定'}</strong>
                </div>
                <div className="metric-value">
                  <span>实际</span>
                  <strong title="本期尚未采集">{m?.current ?? '—'}</strong>
                </div>
                <button
                  className="btn btn-ghost metric-collect"
                  aria-label={`${g.label} 刷新指标`}
                  onClick={refreshMetrics}
                >
                  <RefreshCw />
                  刷新
                </button>
              </div>
              {version === 'v0.4' && (
                <div className="historic-reading">
                  历史约定 {g.target} · 原记录 {g.reading}
                </div>
              )}
              <div className="result-delivery">
                <label>实际交付</label>
                <div className="actual">
                  {version === 'v0.4' ? (
                    <>
                      {original.results.deliverables
                        .filter((d) => d.goal === g.label)
                        .map((d) => (
                          <a key={d.id} href={files[d.id]} target="_blank" rel="noreferrer">
                            {d.label}
                            <ExternalLink />
                          </a>
                        ))}
                      <button
                        className="history-source"
                        onClick={() =>
                          setModal({
                            type: 'text',
                            title: `${g.label} · 历史依据`,
                            text: g.note
                          })
                        }
                      >
                        原始依据
                        <ChevronRight />
                      </button>
                    </>
                  ) : (
                    <Field
                      label={`${g.label} 实际交付`}
                      value={g.actualDelivery}
                      onChange={(v) => updateResult(g.id, 'actualDelivery', v)}
                      placeholder="填写交付结果或材料链接"
                    />
                  )}
                </div>
                <div className="decision">
                  <select
                    className="input"
                    aria-label={`${g.label} 验收结论`}
                    value={g.decision}
                    onChange={(e) => updateResult(g.id, 'decision', e.target.value)}
                  >
                    {['待核对', '达成', '未达'].map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className={`followup ${hasGap(g) ? 'has-gap' : ''}`}>
                <label>{hasGap(g) ? '未达项' : '验收依据'}</label>
                <Field
                  label={`${g.label} 验收说明`}
                  value={g.reason}
                  onChange={(v) => updateResult(g.id, 'reason', v)}
                  placeholder={hasGap(g) ? '哪些约定未达到，原因是什么' : '判断依据'}
                />
              </div>
              {hasGap(g) && (
                <div className="followup next-step">
                  <label>下一步</label>
                  <Field
                    label={`${g.label} 下一步`}
                    value={g.next}
                    onChange={(v) => updateResult(g.id, 'next', v)}
                    placeholder="本版补齐、带入下版或停止，并说明安排"
                  />
                  <button
                    className="btn btn-ghost"
                    onClick={() =>
                      promptConversation(
                        `请处理 ${version} ${g.label} 的未达项：${g.reason || '待补充'}。下一步：${
                          g.next || '请与我讨论安排'
                        }。核对关联 Issue，与我确认后再更新，不自动标为完成。`
                      )
                    }
                  >
                    <MessageSquare />
                    交给会话
                  </button>
                </div>
              )}
            </article>
          )
        })}
      </section>
      {versionTasks()}
    </>
  )
}
export { AcceptanceContent }
