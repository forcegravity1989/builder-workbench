import { React, useState } from 'react'
import {
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  ExternalLink,
  History,
  ListTodo,
  MessageSquare
} from 'lucide-react'
import { Field, Lamp, done, titleForTask } from '../../version-planning/prototype/shared.jsx'
import { files, original } from '../../version-planning/prototype/snapshot.js'
import { AcceptanceMetricEvidence } from './metric-evidence.jsx'
import { PackagePanel } from './package-panel.jsx'

// 周次演示数据¹：跨周版本每周五做一次验收——「进展刷新」周不出包、只刷新进展，
// 最终周做展示验收。界面按周呈现；「轮次」只作为材料协议层的记录维度，不上界面。
// 历史周只读（正式界面从材料轮次记录读回），供回看既往进展与纪要。
const WEEKS = {
  'v0.5': [
    {
      id: 'v0.5:w40',
      label: '2026-W40（本周 · 展示验收）',
      short: '2026-W40 · 本周',
      current: true
    },
    {
      id: 'v0.5:w39',
      label: '2026-W39（进展刷新 · 历史）',
      short: '2026-W39 · 历史',
      current: false
    }
  ],
  // 已归档版本只有历史周：只读回看，演示「不改写已归档记录」。
  'v0.4': [
    {
      id: 'v0.4:w38',
      label: '2026-W38（已归档 · 历史）',
      short: '2026-W38 · 已归档',
      current: false
    }
  ]
}

const readableState = (t) =>
  t.state === 'CLOSED'
    ? '已关闭'
    : t.labels?.some((l) => l.name === 'bw:status:inreview')
      ? '待评审'
      : t.labels?.some((l) => l.name === 'bw:status:inprogress')
        ? '进行中'
        : '开放'
const decisionTone = (g) =>
  g.decision === '达成' ? 'green' : g.decision === '未达' ? 'red' : 'yellow'

function AcceptanceContent({
  disabled = false,
  current,
  goalIssues,
  hasGap,
  latestPackage,
  marks,
  setMarks,
  openIssue,
  openIssues,
  promptConversation,
  query,
  setQuery,
  refreshMetrics,
  review,
  weekId,
  setWeekId,
  setModal,
  tasks,
  triggerPackage,
  downloadPackage,
  updateResult,
  version,
  versionTasks
}) {
  // marks/weekId/query 由 layout 持有：跳 Issue 详情或切屏返回后，人工标记与周次选择保留。
  const weeks = WEEKS[version] ?? WEEKS['v0.5']
  const week = weeks.find((w) => w.id === weekId) ?? weeks[0]
  const readOnly = disabled || !week.current
  // 卡片开合记忆用户意图；默认 = 未填写结论与材料时展开、已填写时收起（key 含版本与周次）。
  const [openGoals, setOpenGoals] = useState({})
  const cardKey = (g) => `${version}:${week.id}:${g.id}`
  const isCardOpen = (g) =>
    openGoals[cardKey(g)] ??
    !(g.actualDelivery?.trim() || g.reason?.trim() || g.decision !== '待核对')
  const toggleCard = (g) => setOpenGoals((s) => ({ ...s, [cardKey(g)]: !isCardOpen(g) }))
  const setAllCards = (open) =>
    setOpenGoals((s) => {
      const next = { ...s }
      current.forEach((g) => {
        next[cardKey(g)] = open
      })
      return next
    })
  const q = query.trim().toLowerCase()
  const matches = (text) =>
    String(text ?? '')
      .toLowerCase()
      .includes(q)
  const goalMatches = (g) =>
    [
      g.label,
      g.title,
      g.delivery,
      g.criteria,
      g.metric,
      g.note,
      g.actualDelivery,
      g.reason,
      g.next
    ].some((v) => v && matches(v)) || goalIssues(g).some((t) => matches(`#${t.number} ${t.title}`))
  const visibleGoals = disabled || !q ? current : current.filter(goalMatches)
  const carryover = tasks.filter((t) => t.state !== 'CLOSED' && marks[t.number]?.carry)
  function toggleMark(number, key) {
    setMarks((m) => {
      const next = { ...m[number], [key]: !m[number]?.[key] }
      if (key === 'carry' && !next.carry) {
        next.risk = false
      }
      return { ...m, [number]: next }
    })
  }
  return (
    <>
      {!disabled && (
        <div className="board-toolbar">
          <label className="week-picker" title="跨周版本按周查看；历史周只读（演示数据¹）">
            <History />
            <select
              className="input"
              aria-label="验收周次"
              value={week.id}
              onChange={(event) => setWeekId(event.target.value)}
            >
              {weeks.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.label}
                </option>
              ))}
            </select>
          </label>
          <input
            className="input board-search"
            type="search"
            aria-label="板内搜索目标与 Issue"
            placeholder="搜索目标 / Issue…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {q && (
            <span className="search-hit">
              命中 {visibleGoals.length} 项目标（仅过滤卡片呈现，不改材料）
            </span>
          )}
          <span className="toolbar-spacer" />
          <button className="btn btn-ghost" disabled={readOnly} onClick={() => setAllCards(true)}>
            全部展开
          </button>
          <button className="btn btn-ghost" onClick={() => setAllCards(false)}>
            全部收起
          </button>
        </div>
      )}
      {!disabled && !week.current && (
        <p className="week-readonly" role="status">
          历史周为只读快照；继续编辑请切回本周。
        </p>
      )}
      {!disabled && (
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
            </button>
            <span className="pending-count">
              {current.filter((g) => g.decision === '待核对').length} 项待核对
              {current.some(hasGap) ? ` · ${current.filter(hasGap).length} 项未达` : ''}
              {carryover.length ? ` · ${carryover.length} 条人工标记遗留` : ''}
            </span>
          </div>
          <div className="section-heading package-heading">
            <h2>出包</h2>
            <span>CloudDragon</span>
          </div>
          <PackagePanel
            disabled={readOnly}
            latest={latestPackage}
            onPackage={triggerPackage}
            onDownload={downloadPackage}
          />
        </>
      )}
      <div className="section-heading acceptance-goals-heading">
        <h2>本版目标验收</h2>
        <span className="goals-heading-week">{week.short}</span>
        <button className="btn btn-secondary" onClick={review} disabled={disabled}>
          <ClipboardCheck />
          预览纪要
        </button>
      </div>
      <section className="acceptance-sheet goal-cards" key={`${version}-${week.id}`}>
        {disabled && (
          <p className="goal-row">尚未选择版本。新建验收，与 Agent 一起确认要核对的版本。</p>
        )}
        {!disabled && visibleGoals.length === 0 && (
          <p className="goal-row search-empty">
            没有匹配「{query}」的目标或 Issue；清空搜索恢复全部。
          </p>
        )}
        {visibleGoals.map((g) => {
          const related = goalIssues(g)
          const shownRelated = q
            ? related.filter((t) => matches(`#${t.number} ${t.title}`))
            : related
          const carry = related.filter((t) => t.state !== 'CLOSED' && marks[t.number]?.carry)
          const risky = carry.filter((t) => marks[t.number]?.risk)
          const open = isCardOpen(g)
          return (
            <article className="goal-card" data-goal={g.id} data-decision={g.decision} key={g.id}>
              <div className="goal-card-head">
                <button
                  className="goal-card-toggle"
                  aria-expanded={open}
                  aria-label={`${open ? '收起' : '展开'} ${g.label} 目标卡`}
                  onClick={() => toggleCard(g)}
                >
                  {open ? <ChevronDown /> : <ChevronRight />}
                </button>
                <Lamp tone={decisionTone(g)} label={`验收结论：${g.decision}`} />
                <span className="goal-id">{g.label}</span>
                <h3 onClick={() => toggleCard(g)}>{g.title}</h3>
                <select
                  className="input decision-inline"
                  aria-label={`${g.label} 验收结论`}
                  value={g.decision}
                  disabled={readOnly}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(e) => updateResult(g.id, 'decision', e.target.value)}
                >
                  {['待核对', '达成', '未达'].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
                <span className="head-chips">
                  <button
                    className="head-chip"
                    title="定位到 Issue 快照区"
                    onClick={() => openIssues(g)}
                  >
                    <ListTodo />
                    {done(related)} / {related.length}
                  </button>
                  {carry.length > 0 && (
                    <span className={`head-chip carry${risky.length ? ' risk' : ''}`}>
                      遗留 {carry.length}
                      {risky.length ? ` · 风险 ${risky.length}` : ''}
                    </span>
                  )}
                </span>
              </div>
              {open && (
                <div className="goal-card-body">
                  <div className="delivery-row agreed-delivery">
                    <span>约定交付</span>
                    <p>{version === 'v0.4' ? g.metric : g.delivery || '未约定交付件'}</p>
                  </div>
                  <div className="goal-issues">
                    <span className="goal-issues-label">
                      <ListTodo />
                      关联 Issue{' '}
                      <strong>
                        {done(related)} / {related.length}
                      </strong>{' '}
                      已关闭
                    </span>
                    {shownRelated.map((t) => (
                      <div className="goal-issue-row" key={t.number}>
                        <span className={`task-state ${t.state === 'CLOSED' ? 'closed' : 'open'}`}>
                          {t.state === 'CLOSED' ? <Check /> : <span className="open-circle" />}
                        </span>
                        <button className="goal-issue-link" onClick={() => openIssue(t)}>
                          <span className="task-number">#{t.number}</span>
                          <span className="task-title">{titleForTask(t)}</span>
                        </button>
                        <span className="task-readable-state">{readableState(t)}</span>
                        {t.state !== 'CLOSED' && (
                          <span className="issue-flags">
                            <button
                              className={`flag-chip${marks[t.number]?.carry ? ' on' : ''}`}
                              aria-pressed={Boolean(marks[t.number]?.carry)}
                              disabled={readOnly}
                              title="人工判断：验收后是否遗留"
                              onClick={() => toggleMark(t.number, 'carry')}
                            >
                              遗留
                            </button>
                            <button
                              className={`flag-chip risk${marks[t.number]?.risk ? ' on' : ''}`}
                              aria-pressed={Boolean(marks[t.number]?.risk)}
                              disabled={readOnly || !marks[t.number]?.carry}
                              title="人工判断：遗留是否带风险"
                              onClick={() => toggleMark(t.number, 'risk')}
                            >
                              风险
                            </button>
                          </span>
                        )}
                      </div>
                    ))}
                    {!q && related.length === 0 && (
                      <p className="goal-issues-empty">该目标暂无关联 Issue。</p>
                    )}
                  </div>
                  <fieldset disabled={readOnly}>
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
                        current.forEach((goal) =>
                          updateResult(goal.id, 'acceptanceMetricWindow', window)
                        )
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
                              `请处理 ${version} ${g.label} 的未达项：${
                                g.reason || '待补充'
                              }。下一步：${
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
                  </fieldset>
                </div>
              )}
            </article>
          )
        })}
      </section>
      {!disabled && (
        <section className="carryover-card" aria-label="遗留与风险">
          <h3>
            <ListTodo />
            遗留与风险（人工标记）
          </h3>
          {carryover.length === 0 ? (
            <p className="carryover-empty">本周没有标记遗留的 Issue。</p>
          ) : (
            carryover.map((t) => {
              const g = current.find((x) => x.label === t.goal)
              return (
                <div className="carryover-row" key={t.number}>
                  <span className={`flag-chip static${marks[t.number]?.risk ? ' risk on' : ' on'}`}>
                    {marks[t.number]?.risk ? '遗留 · 风险' : '遗留'}
                  </span>
                  <button onClick={() => openIssue(t)}>
                    #{t.number} {titleForTask(t)}
                  </button>
                  <span className="carryover-goal">{t.goal}</span>
                  <span className="carryover-next">{g?.next || '下一步待会话安排'}</span>
                </div>
              )
            })
          )}
          <p className="carryover-note">
            标记由人在目标卡内逐条判断；关闭 Issue 不自动等于目标达成，开放 Issue
            也不自动判为遗留。进展与依据等自然语言内容由人主导填写，模型经人确认后才写入材料，不代笔结论。
          </p>
        </section>
      )}
      {!disabled && versionTasks()}
    </>
  )
}
export { AcceptanceContent }
