import { React, useState } from 'react'
import {
  Check,
  ChartNoAxesCombined,
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
import {
  CLASS_LABELS,
  Field,
  Lamp,
  assigneeOf,
  issueClass,
  readableState,
  titleForTask
} from '../../version-planning/prototype/shared.jsx'
import { files, original } from '../../version-planning/prototype/snapshot.js'
import { acceptanceMetric } from './metric-evidence.jsx'
import { PackagePanel } from './package-panel.jsx'

// 周次演示数据¹：跨周版本每周五做一次验收——「进展刷新」周不出包、只刷新进展，
// 最终周做展示验收。界面按周呈现，材料轮次在这里以“当前/历史 + 周次”选择器读回。
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

const decisionTone = (g) =>
  g.decision === '达成' ? 'green' : g.decision === '未达' ? 'red' : 'yellow'
// 处置标记：本次能解决的进本次验收/计划，解决不了的记录遗留。
const DIRECTIVE_TAGS = ['本次验收已解决', '纳入下周计划', '记录遗留']

function AcceptanceContent({
  disabled = false,
  current,
  goalIssues,
  hasGap,
  latestPackage,
  marks,
  setMarks,
  notes,
  setNotes,
  directives,
  setDirectives,
  openIssue,
  refreshMetrics,
  review,
  weekId,
  setWeekId,
  setModal,
  setNotice,
  triggerPackage,
  downloadPackage,
  updateResult,
  version
}) {
  // marks/notes/weekId/directives 由 layout 持有：跳 Issue 详情或切屏返回后保留。
  const weeks = WEEKS[version] ?? WEEKS['v0.5']
  const week = weeks.find((w) => w.id === weekId) ?? weeks[0]
  const readOnly = disabled || !week.current
  // 卡片开合记忆用户意图；默认 = 未填写结论与进展时展开、已填写时收起（key 含版本与周次）。
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
    setDirectives((list) => [
      ...list,
      { ...directiveDraft, id: Date.now(), status: '已确认', source: '人工补记' }
    ])
    setDirectiveDraft(null)
  }
  // 材料独立成块：正式界面经 Orca 内置浏览器打开链接，或打开 .bw 目录下的交付件。
  const materialsOf = (g) =>
    version === 'v0.4'
      ? original.results.deliverables
          .filter((d) => d.goal === g.label)
          .map((d) => ({ label: d.label, url: files[d.id] }))
      : (g.materials ?? [])
  const issueRow = (t) => {
    const open = t.state !== 'CLOSED'
    const tone = !open ? 'closed' : marks[t.number]?.risk ? 'risk' : 'open'
    return (
      <div className="goal-issue-row" data-tone={tone} key={t.number}>
        <span className={`task-state ${open ? 'open' : 'closed'}`}>
          {open ? <span className="open-circle" /> : <Check />}
        </span>
        <span className="task-readable-state">{readableState(t)}</span>
        <button className="goal-issue-link" onClick={() => openIssue(t)}>
          <span className="task-number">#{t.number}</span>
          <span className="task-title">{titleForTask(t)}</span>
        </button>
        {assigneeOf(t) && (
          <span className="task-owner" title="责任人（Issue 原生 assignee）">
            {assigneeOf(t)}
          </span>
        )}
        {open && (
          <>
            <input
              className="issue-note-input"
              aria-label={`#${t.number} 进展/备注`}
              value={notes[t.number] ?? ''}
              disabled={readOnly}
              placeholder="进展/备注（遗留或风险原因会前写在这里）"
              onChange={(event) => setNotes((m) => ({ ...m, [t.number]: event.target.value }))}
            />
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
          </>
        )}
      </div>
    )
  }
  return (
    <>
      {!disabled && (
        <div className="board-toolbar">
          <button
            className="btn btn-ghost btn-icon"
            title="全部展开"
            aria-label="全部展开"
            disabled={readOnly}
            onClick={() => setAllCards(true)}
          >
            <ChevronDown />
          </button>
          <button
            className="btn btn-ghost btn-icon"
            title="全部收起"
            aria-label="全部收起"
            onClick={() => setAllCards(false)}
          >
            <ChevronRight />
          </button>
          <button
            className="btn btn-ghost btn-icon"
            title="刷新 Issue"
            aria-label="刷新 Issue"
            disabled={readOnly}
            onClick={() => setNotice('原型未连接远端；保留上次读取的 Issue 状态。')}
          >
            <RefreshCw />
          </button>
          <button
            className="btn btn-secondary btn-icon"
            title="预览纪要"
            aria-label="预览纪要"
            disabled={readOnly}
            onClick={review}
          >
            <ClipboardCheck />
          </button>
        </div>
      )}
      {!disabled && (
        <section className="va-round-block" aria-label="验收轮次">
          <div className="va-round-picker">
            <strong>
              <History />
              验收轮次
            </strong>
            <select
              className="input"
              aria-label="验收周次"
              value={week.id}
              onChange={(event) => setWeekId(event.target.value)}
            >
              {weeks.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.current ? '当前' : '历史'} · {w.short}
                </option>
              ))}
            </select>
            <span className="va-muted">{readOnly ? '历史轮只读' : '当前轮可编辑'}</span>
          </div>
        </section>
      )}
      {!disabled && !week.current && (
        <p className="week-readonly" role="status">
          历史周为只读快照；继续编辑请切回本周。
        </p>
      )}
      {!disabled && (
        <section className="package-block">
          <button
            className="package-toggle"
            aria-expanded={pkgOpen}
            onClick={() => setPkgOpen((v) => !v)}
          >
            {pkgOpen ? <ChevronDown /> : <ChevronRight />}
            <h2>出包</h2>
            <span className="package-vendor">CloudDragon</span>
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
      )}
      <div className="section-heading acceptance-goals-heading">
        <h2>本版目标验收</h2>
        <span className="goals-heading-week">{week.short}</span>
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
          const m = acceptanceMetric(g)
          const materials = materialsOf(g)
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
                <span className="head-chips">
                  <span className="head-chip owner" title="负责人（计划材料 owner 字段）">
                    负责人 {g.owner?.trim() || '未指派'}
                  </span>
                  <span className="head-chip" title="关联 Issue 数">
                    <ListTodo />
                    关联 Issue · {related.length}
                  </span>
                  {carry.length > 0 && (
                    <span className={`head-chip carry${risky.length ? ' risk' : ''}`}>
                      遗留 {carry.length}
                      {risky.length ? ` · 风险 ${risky.length}` : ''}
                    </span>
                  )}
                </span>
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
              </div>
              {open && (
                <div className="goal-card-body">
                  <div className="card-story-row">
                    <div className="story-cell">
                      <span className="story-label">约定交付</span>
                      <p>{version === 'v0.4' ? g.metric : g.delivery || '未约定交付件'}</p>
                      {version === 'v0.4' && (
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
                      )}
                    </div>
                    <div className="story-cell">
                      <span className="story-label">进展</span>
                      <fieldset disabled={readOnly}>
                        <Field
                          label={`${g.label} 进展`}
                          value={g.actualDelivery}
                          rows={2}
                          onChange={(v) => updateResult(g.id, 'actualDelivery', v)}
                          placeholder="本周进展与实际交付；未达时原因直接写在这里（人主导，模型不代笔）"
                        />
                      </fieldset>
                      {g.reason?.trim() && (
                        <p className="legacy-reason">既有未达原因（旧字段读回）：{g.reason}</p>
                      )}
                    </div>
                    <div className="story-cell">
                      <span className="story-label">材料</span>
                      {materials.length ? (
                        materials.map((item) => (
                          <a
                            className="material-chip"
                            key={item.label}
                            href={item.url}
                            target="_blank"
                            rel="noreferrer"
                            title="正式界面经 Orca 内置浏览器打开链接，或打开 .bw 目录下的交付件"
                          >
                            {item.label}
                            <ExternalLink />
                          </a>
                        ))
                      ) : (
                        <p>暂无材料</p>
                      )}
                    </div>
                  </div>
                  {m && (
                    <div className="metric-strip">
                      <ChartNoAxesCombined />
                      <span>
                        指标 {m.name} · 目标 {g.target || '未约定'} · 实测 {m.current ?? '未取得'}
                      </span>
                      <button
                        className="btn btn-ghost metric-refresh"
                        disabled={readOnly}
                        title="重新采集本期实测读数"
                        onClick={refreshMetrics}
                      >
                        <RefreshCw />
                        刷新
                      </button>
                    </div>
                  )}
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
                      关联 Issue · {related.length}
                      {carry.length > 0 ? ` · 遗留 ${carry.length}` : ''}
                      {risky.length > 0 ? ` · 风险 ${risky.length}` : ''}
                    </summary>
                    {related.length === 0 ? (
                      <p className="goal-issues-empty">该目标暂无关联 Issue。</p>
                    ) : (
                      groups.map(([cls, rows]) => (
                        <details className="issue-group" key={cls}>
                          <summary>
                            <ChevronRight />
                            <span className="issue-group-label">{CLASS_LABELS[cls]}</span>
                            <span className="issue-group-count">{rows.length}</span>
                          </summary>
                          {rows.map(issueRow)}
                        </details>
                      ))
                    )}
                  </details>
                  {hasGap(g) && (
                    <fieldset disabled={readOnly}>
                      <div className="followup next-step">
                        <label>下一步</label>
                        <Field
                          label={`${g.label} 下一步`}
                          value={g.next}
                          onChange={(v) => updateResult(g.id, 'next', v)}
                          placeholder="本版补齐、带入下版或停止，并说明安排"
                        />
                      </div>
                    </fieldset>
                  )}
                </div>
              )}
            </article>
          )
        })}
      </section>
      {!disabled && (
        <section className="directives-card" aria-label="会议指导与遗留">
          <h3>
            <MessageSquare />
            会议指导与遗留
            <span className="directives-provenance">会后 SOP · AI 转写总结 · 人确认后生效</span>
            {!readOnly && (
              <button
                className="btn btn-ghost btn-add-directive"
                onClick={() => setDirectiveDraft({ text: '', tag: DIRECTIVE_TAGS[0] })}
              >
                <Plus />
                补记
              </button>
            )}
          </h3>
          {directiveDraft && (
            <div className="directive-form-row">
              <input
                className="input directive-text-input"
                aria-label="补记内容"
                value={directiveDraft.text}
                placeholder="指导或遗留问题要点（一行）"
                onChange={(event) =>
                  setDirectiveDraft({ ...directiveDraft, text: event.target.value })
                }
              />
              <select
                className="input"
                aria-label="处置"
                value={directiveDraft.tag}
                onChange={(event) =>
                  setDirectiveDraft({ ...directiveDraft, tag: event.target.value })
                }
              >
                {DIRECTIVE_TAGS.map((tag) => (
                  <option key={tag}>{tag}</option>
                ))}
              </select>
              <button className="btn btn-secondary" onClick={saveDirective}>
                <Check />
                添加
              </button>
              <button className="btn btn-ghost" onClick={() => setDirectiveDraft(null)}>
                取消
              </button>
            </div>
          )}
          {directives.length === 0 && !directiveDraft && (
            <p className="directives-empty">
              暂无记录。会后 SOP 会话按会议 ID
              从转写稿总结本项目议题的指导与遗留，结果出现在这里待人逐条确认；本次验收或本次计划能解决的标注处置，解决不了的记录遗留。
            </p>
          )}
          {directives.map((d) => (
            <div className="directive-row" key={d.id}>
              <p className="directive-text-cell">
                {d.goal && <span className="directive-goal">{d.goal}</span>}
                {d.text}
                {d.source && <small className="directive-source">来源：{d.source}</small>}
              </p>
              <span className="directive-right">
                <span
                  className={`directive-tag${
                    d.tag === '记录遗留' ? ' danger' : d.tag === '纳入下周计划' ? ' warning' : ''
                  }`}
                >
                  {d.tag}
                </span>
                <span className={`directive-status${d.status === '待确认' ? ' pending' : ''}`}>
                  {d.status}
                </span>
                {d.status === '待确认' && (
                  <button
                    className="btn btn-icon btn-ghost"
                    aria-label="确认该条指导"
                    title="人确认后写入材料"
                    disabled={readOnly}
                    onClick={() =>
                      setDirectives((list) =>
                        list.map((x) => (x.id === d.id ? { ...x, status: '已确认' } : x))
                      )
                    }
                  >
                    <Check />
                  </button>
                )}
                <button
                  className="btn btn-icon btn-ghost"
                  aria-label="删除该条指导"
                  disabled={readOnly}
                  onClick={() => setDirectives((list) => list.filter((x) => x.id !== d.id))}
                >
                  <X />
                </button>
              </span>
            </div>
          ))}
          <p className="directives-note">
            总结由会后 SOP 流程生成（验收 Skill 承载会议转写总结步骤，链路见 issue #374，经
            subagent），界面不设注入会话按钮；逐条经人确认后才随轮次写入材料，模型不代签、不代表态。会后发布判断与下周计划会话可读回。
          </p>
        </section>
      )}
    </>
  )
}
export { AcceptanceContent }
