import { React } from 'react'
import { ChevronRight, ClipboardCheck, ExternalLink, ListTodo, MessageSquare } from 'lucide-react'
import { Field, done } from '../../version-planning/prototype/shared.jsx'
import { files, original } from '../../version-planning/prototype/snapshot.js'
import { AcceptanceMetricEvidence } from './metric-evidence.jsx'

function AcceptanceContent({
  disabled = false,
  current,
  goalIssues,
  hasGap,
  openIssues,
  promptConversation,
  refreshMetrics,
  review,
  setModal,
  tasks,
  updateResult,
  version,
  versionTasks
}) {
  return (
    <>
      {!disabled && (
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
      )}
      <div className="section-heading acceptance-goals-heading">
        <h2>本版目标验收</h2>
        <button className="btn btn-secondary" onClick={review} disabled={disabled}>
          <ClipboardCheck />
          预览纪要
        </button>
      </div>
      <section className="acceptance-sheet aligned-goals">
        {disabled && (
          <p className="goal-row">尚未选择版本。新建验收，与 Agent 一起确认要核对的版本。</p>
        )}
        {current.map((g) => {
          const related = goalIssues(g)
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
              <AcceptanceMetricEvidence
                goal={g}
                updateResult={updateResult}
                refreshMetrics={refreshMetrics}
                onWindowChange={(window) =>
                  current.forEach((goal) => updateResult(goal.id, 'acceptanceMetricWindow', window))
                }
              />
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
                  placeholder={
                    hasGap(g)
                      ? '哪些约定未达到，原因是什么'
                      : '判断依据；指标口径变化时说明是否可比'
                  }
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
      {!disabled && versionTasks()}
    </>
  )
}
export { AcceptanceContent }
