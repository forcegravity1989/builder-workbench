import { React, useState } from 'react'
import {
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  ExternalLink,
  History,
  ListTodo,
  MessageSquare,
  Plus,
  RefreshCw,
  X
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

// Issue 分类：分组展示依赖提单时的 bug/feature 分类标签（配套小需求，见 spec）；
// 无分类标签的如实归入「未分类」，不猜测。
const issueClass = (t) =>
  t.labels?.some((l) => /^(bug|缺陷)/i.test(l.name))
    ? 'bug'
    : t.labels?.some((l) => /^(feature|功能)/i.test(l.name))
      ? 'feature'
      : 'unclassified'
const CLASS_LABELS = { bug: 'Bug 类', feature: 'Feature 类', unclassified: '未分类' }

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

const DIRECTIVE_TAGS = ['影响会后发布', '纳入下周计划', '本版跟进']

function AcceptanceContent({
  disabled = false,
  current,
  goalIssues,
  hasGap,
  latestPackage,
  marks,
  setMarks,
  directives,
  setDirectives,
  openIssue,
  promptConversation,
  refreshMetrics,
  review,
  weekId,
  setWeekId,
  setModal,
  setNotice,
  tasks,
  triggerPackage,
  downloadPackage,
  updateResult,
  version
}) {
  // marks/weekId/directives 由 layout 持有：跳 Issue 详情或切屏返回后保留。
  const weeks = WEEKS[version] ?? WEEKS['v0.5']
  const week = weeks.find((w) => w.id === weekId) ?? weeks[0]
  const readOnly = disabled || !week.current
  // 卡片开合记忆用户意图；默认 = 未填写结论与材料时展开、已填写时收起（key 含版本与周次）。
  const [openGoals, setOpenGoals] = useState({})
  // 出包区块属会前，默认收起；收起态保留一行最新包摘要，会中不占视野。
  const [pkgOpen, setPkgOpen] = useState(false)
  const [directiveDraft, setDirectiveDraft] = useState(null)
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
  function toggleMark(number, key) {
    setMarks((m) => {
      const next = { ...m[number], [key]: !m[number]?.[key] }
      if (key === 'carry' && !next.carry) {
        next.risk = false
      }
      return { ...m, [number]: next }
    })
  }
  function saveDirective() {
    if (!directiveDraft?.text.trim()) {
      return
    }
    setDirectives((list) => [...list, { ...directiveDraft, id: Date.now() }])
    setDirectiveDraft(null)
    setNotice('指导已记录（原型内存演示）；正式界面随轮次写入材料，下周计划会话可读回')
  }
  const issueRow = (t) => (
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
  )
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
            <span className="summary-issues">
              <ListTodo />
              Issue 完成{' '}
              <strong>
                {done(tasks)} / {tasks.length}
              </strong>
            </span>
            <button
              className="summary-refresh"
              title="刷新 Issue 状态"
              onClick={() => setNotice('原型未连接远端；保留上次读取的 Issue 状态。')}
            >
              <RefreshCw />
              刷新状态
            </button>
            <span className="pending-count">
              {current.filter((g) => g.decision === '待核对').length} 项待核对
              {current.some(hasGap) ? ` · ${current.filter(hasGap).length} 项未达` : ''}
              {tasks.filter((t) => t.state !== 'CLOSED' && marks[t.number]?.carry).length
                ? ` · ${tasks.filter((t) => t.state !== 'CLOSED' && marks[t.number]?.carry).length} 条人工标记遗留`
                : ''}
            </span>
          </div>
          <section className="package-block">
            <button
              className="section-heading package-heading package-toggle"
              aria-expanded={pkgOpen}
              onClick={() => setPkgOpen((v) => !v)}
            >
              {pkgOpen ? <ChevronDown /> : <ChevronRight />}
              <h2>出包</h2>
              <span>CloudDragon</span>
              {!pkgOpen && latestPackage && (
                <span className="package-digest" title={latestPackage.version}>
                  最新包 {latestPackage.version.slice(0, 28)}… · {latestPackage.created}
                </span>
              )}
            </button>
            {pkgOpen && (
              <PackagePanel
                disabled={readOnly}
                latest={latestPackage}
                onPackage={triggerPackage}
                onDownload={downloadPackage}
              />
            )}
          </section>
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
        {current.map((g) => {
          const related = goalIssues(g)
          const carry = related.filter((t) => t.state !== 'CLOSED' && marks[t.number]?.carry)
          const risky = carry.filter((t) => marks[t.number]?.risk)
          const open = isCardOpen(g)
          const groups = ['bug', 'feature', 'unclassified']
            .map((cls) => [cls, related.filter((t) => issueClass(t) === cls)])
            .filter(([, rows]) => rows.length > 0)
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
                  <span className="head-chip" title="关联 Issue 完成数">
                    <ListTodo />
                    {done(related)} / {related.length}
                  </span>
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
                  <div className="card-story-row">
                    <div className="story-cell">
                      <span className="story-label">约定交付</span>
                      <p>{version === 'v0.4' ? g.metric : g.delivery || '未约定交付件'}</p>
                    </div>
                    <div className="story-cell">
                      <span className="story-label">实际交付</span>
                      {version === 'v0.4' ? (
                        <div className="actual">
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
                        </div>
                      ) : (
                        <Field
                          label={`${g.label} 实际交付`}
                          value={g.actualDelivery}
                          rows={2}
                          onChange={(v) => updateResult(g.id, 'actualDelivery', v)}
                          placeholder="交付结果或材料链接（人主导填写）"
                        />
                      )}
                    </div>
                    <div className="story-cell">
                      <span className="story-label">指标实测</span>
                      <fieldset disabled={readOnly} className="story-metric">
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
                      </fieldset>
                    </div>
                  </div>
                  {g.criteria && (
                    <div className="criteria-row">
                      <span>验收标准</span>
                      <p>{g.criteria}</p>
                    </div>
                  )}
                  {version === 'v0.4' && (
                    <div className="historic-reading">
                      历史约定 {g.target} · 原记录 {g.reading}
                    </div>
                  )}
                  <details className="issue-subblock">
                    <summary>
                      <ListTodo />
                      关联 Issue {done(related)} / {related.length} 已关闭
                      {carry.length > 0 ? ` · 遗留 ${carry.length}` : ''}
                      {risky.length > 0 ? ` · 风险 ${risky.length}` : ''}
                    </summary>
                    {related.length === 0 ? (
                      <p className="goal-issues-empty">该目标暂无关联 Issue。</p>
                    ) : (
                      groups.map(([cls, rows]) => (
                        <div className="issue-group" key={cls}>
                          <span className="issue-group-label">{CLASS_LABELS[cls]}</span>
                          {rows.map(issueRow)}
                        </div>
                      ))
                    )}
                  </details>
                  <fieldset disabled={readOnly}>
                    <div className={`followup ${hasGap(g) ? 'has-gap' : ''}`}>
                      <label>{hasGap(g) ? '未达项与原因' : '进展 / 备注'}</label>
                      <Field
                        label={`${g.label} ${hasGap(g) ? '未达项' : '进展备注'}`}
                        value={g.reason}
                        rows={2}
                        onChange={(v) => updateResult(g.id, 'reason', v)}
                        placeholder={
                          hasGap(g)
                            ? '哪些约定未达到，原因是什么（会前必须写好）'
                            : '可填可不填；遗留或风险的原因会前写在这里（人主导，模型不代笔）'
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
        <section className="directives-card" aria-label="领导会上指导">
          <h3>
            <MessageSquare />
            领导会上指导（人记录）
            <button
              className="btn btn-ghost btn-add-directive"
              disabled={readOnly}
              onClick={() => setDirectiveDraft({ text: '', tag: DIRECTIVE_TAGS[0], goal: '' })}
            >
              <Plus />
              记录指导
            </button>
          </h3>
          {directiveDraft && (
            <div className="directive-form">
              <Field
                label="指导内容"
                value={directiveDraft.text}
                rows={2}
                placeholder="会上领导的关键指导原文或要点；人记录，模型不代笔"
                onChange={(v) => setDirectiveDraft({ ...directiveDraft, text: v })}
              />
              <div className="directive-form-row">
                <select
                  className="input"
                  aria-label="影响标签"
                  value={directiveDraft.tag}
                  onChange={(event) =>
                    setDirectiveDraft({ ...directiveDraft, tag: event.target.value })
                  }
                >
                  {DIRECTIVE_TAGS.map((tag) => (
                    <option key={tag}>{tag}</option>
                  ))}
                </select>
                <select
                  className="input"
                  aria-label="关联目标（可选）"
                  value={directiveDraft.goal}
                  onChange={(event) =>
                    setDirectiveDraft({ ...directiveDraft, goal: event.target.value })
                  }
                >
                  <option value="">不关联目标</option>
                  {current.map((g) => (
                    <option key={g.id} value={g.label}>
                      {g.label}
                    </option>
                  ))}
                </select>
                <button className="btn btn-secondary" onClick={saveDirective}>
                  <Check />
                  保存
                </button>
                <button className="btn btn-ghost" onClick={() => setDirectiveDraft(null)}>
                  取消
                </button>
              </div>
            </div>
          )}
          {directives.length === 0 && !directiveDraft && (
            <p className="directives-empty">
              暂无记录。会上领导的关键指导可能影响会后发布与下周计划，由人逐条记录。
            </p>
          )}
          {directives.map((d) => (
            <div className="directive-row" key={d.id}>
              <span
                className={`directive-tag${
                  d.tag === '影响会后发布' ? ' danger' : d.tag === '纳入下周计划' ? ' warning' : ''
                }`}
              >
                {d.tag}
              </span>
              {d.goal && <span className="directive-goal">{d.goal}</span>}
              <p>{d.text}</p>
              <button
                className="btn btn-icon btn-ghost"
                aria-label="删除该条指导"
                disabled={readOnly}
                onClick={() => setDirectives((list) => list.filter((x) => x.id !== d.id))}
              >
                <X />
              </button>
            </div>
          ))}
          <p className="directives-note">
            指导随轮次写入材料（草案）：会后发布判断与下周计划会话可读回；人记录原文要点，模型不代笔、不自动生成。
          </p>
        </section>
      )}
    </>
  )
}
export { AcceptanceContent }
