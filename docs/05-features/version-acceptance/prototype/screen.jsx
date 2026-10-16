import { React, useState } from 'react'
import {
  Check,
  ClipboardCheck,
  Download,
  ExternalLink,
  History,
  ListTodo,
  MessageSquare,
  Pencil,
  Presentation
} from 'lucide-react'
import { Field, Lamp, done, titleForTask } from '../../version-planning/prototype/shared.jsx'
import { files, original, remote } from '../../version-planning/prototype/snapshot.js'
import { AcceptanceMetricEvidence, acceptanceMetric } from './metric-evidence.jsx'
import { PackagePanel } from './package-panel.jsx'

// 轮次演示数据¹：跨周版本每周五一轮；「进展刷新」轮不出包、只刷新进展并可导出该周周报，
// 最终轮做展示验收。正式界面轮次记录来自验收材料，历史轮次从 Git 读回、只读。
const ROUNDS = {
  'v0.5': [
    {
      id: 'r2',
      label: '第2轮 · 2026-W40 · 展示验收（本轮）',
      short: '第2轮（W40）',
      current: true
    },
    {
      id: 'r1',
      label: '第1轮 · 2026-W39 · 进展刷新（历史）',
      short: '第1轮（W39）',
      current: false
    }
  ],
  'v0.4': [{ id: 'r1', label: '第1轮 · 2026-W38 · 已归档', short: '第1轮（W38）', current: true }]
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
const oneLine = (s, n = 40) => (s.length > n ? `${s.slice(0, n)}…` : s)

function AcceptanceContent({
  disabled = false,
  current,
  face,
  setFace,
  goalIssues,
  hasGap,
  latestPackage,
  openIssue,
  openIssues,
  promptConversation,
  refreshMetrics,
  review,
  setModal,
  tasks,
  triggerPackage,
  downloadPackage,
  updateResult,
  version,
  versionTasks
}) {
  const rounds = ROUNDS[version] ?? ROUNDS['v0.5']
  const [roundId, setRoundId] = useState(rounds[0].id)
  const round = rounds.find((r) => r.id === roundId) ?? rounds[0]
  const readOnly = disabled || !round.current
  // 遗留/风险是人工判断（演示默认：#255 随 G3 未达标记遗留+风险）；
  // 开放 Issue 不自动判遗留，关闭 Issue 不自动判目标达成。
  const [marks, setMarks] = useState({ 255: { carry: true, risk: true } })
  const [query, setQuery] = useState('')
  // 材料折叠记忆用户开合意图；默认值 = 未填写时展开、已填写时收起（key 含版本与轮次，切换即重置）。
  const [openGoals, setOpenGoals] = useState({})
  const detailKey = (g) => `${version}:${round.id}:${g.id}`
  const isDetailOpen = (g) =>
    openGoals[detailKey(g)] ??
    !(g.actualDelivery?.trim() || g.reason?.trim() || g.decision !== '待核对')
  const q = query.trim().toLowerCase()
  const matches = (text) =>
    String(text ?? '')
      .toLowerCase()
      .includes(q)
  const goalMatches = (g) =>
    [g.label, g.title, g.delivery, g.criteria, g.actualDelivery, g.reason, g.next].some(
      (v) => v && matches(v)
    ) || goalIssues(g).some((t) => matches(`#${t.number} ${t.title}`))
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
  function openWeeklyExport() {
    setModal({
      type: 'weekly-export',
      title: `导出周报 · ${version} · ${round.short}`,
      version,
      roundLabel: round.short,
      goals: current,
      tasks,
      hasGap,
      marks,
      latestPackage
    })
  }
  return (
    <>
      {!disabled && (
        <div className="face-toolbar">
          <div className="face-switch" role="tablist" aria-label="验收视图">
            <button
              role="tab"
              aria-selected={face === 'prepare'}
              onClick={() => setFace('prepare')}
              title="Builders 与工作模型准备材料、逐目标核对"
            >
              <Pencil />
              准备
            </button>
            <button
              role="tab"
              aria-selected={face === 'showcase'}
              onClick={() => setFace('showcase')}
              title="拿着验收屏与准备的材料向 Leader/Owner 展示"
            >
              <Presentation />
              Showcase
            </button>
          </div>
          <label className="round-picker" title="轮次为整改草案新增（演示数据¹）：历史轮次只读">
            <History />
            <select
              className="input"
              aria-label="刷新轮次"
              value={round.id}
              onChange={(event) => setRoundId(event.target.value)}
            >
              {rounds.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
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
          {q && <span className="search-hit">命中 {visibleGoals.length} 项目标</span>}
        </div>
      )}
      {!disabled && !round.current && (
        <p className="round-readonly" role="status">
          历史轮次为只读快照（正式界面从 Git 读回该轮记录）；继续编辑请切回本轮。
        </p>
      )}
      {face === 'prepare' && !disabled && (
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
      {face === 'prepare' ? (
        <>
          <div className="section-heading acceptance-goals-heading">
            <h2>本版目标验收</h2>
            <button className="btn btn-secondary" onClick={review} disabled={disabled}>
              <ClipboardCheck />
              预览纪要
            </button>
          </div>
          <section className="acceptance-sheet aligned-goals" key={`${version}-${round.id}`}>
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
              return (
                <article className="acceptance-row" data-goal={g.id} key={g.id}>
                  <div className="acceptance-heading">
                    <Lamp tone={decisionTone(g)} label={`验收结论：${g.decision}`} />
                    <span className="goal-id">{g.label}</span>
                    <h3>{g.title}</h3>
                    <select
                      className="input decision-inline"
                      aria-label={`${g.label} 验收结论`}
                      value={g.decision}
                      disabled={readOnly}
                      onChange={(e) => updateResult(g.id, 'decision', e.target.value)}
                    >
                      {['待核对', '达成', '未达'].map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </div>
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
                  <details
                    className="goal-detail"
                    open={isDetailOpen(g)}
                    onToggle={(event) =>
                      setOpenGoals((s) => ({ ...s, [detailKey(g)]: event.target.open }))
                    }
                  >
                    <summary>
                      材料与依据
                      {g.actualDelivery?.trim()
                        ? ` · ${oneLine(g.actualDelivery.trim())}`
                        : ' · 待填写'}
                    </summary>
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
                  </details>
                </article>
              )
            })}
          </section>
          {!disabled && versionTasks()}
        </>
      ) : (
        <div className="showcase-face" key={`${version}-${round.id}`}>
          <div className="showcase-head">
            <div className="showcase-id">
              <strong>{version}</strong>
              <span className="tag tag-outline">{round.short}</span>
              <span className="showcase-candidate">
                候选提交 f20f04ae¹ · Issue 快照 {remote.readAt.slice(0, 10)}¹
                {latestPackage ? ` · 包 ${latestPackage.version.slice(0, 24)}…` : ' · 尚无制品包'}
              </span>
            </div>
            <div className="export-bar">
              <button className="btn btn-secondary" onClick={review} disabled={disabled}>
                <ClipboardCheck />
                预览纪要
              </button>
              <button className="btn btn-primary" onClick={openWeeklyExport} disabled={disabled}>
                <Download />
                导出周报
              </button>
            </div>
          </div>
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
            const carry = related.filter((t) => t.state !== 'CLOSED' && marks[t.number]?.carry)
            const m = acceptanceMetric(g)
            return (
              <article className="showcase-card" data-decision={g.decision} key={g.id}>
                <header>
                  <Lamp tone={decisionTone(g)} label={`验收结论：${g.decision}`} />
                  <span className="goal-id">{g.label}</span>
                  <h3>{g.title}</h3>
                  <span
                    className={`decision-tag tag-${
                      g.decision === '达成'
                        ? 'success'
                        : g.decision === '未达'
                          ? 'danger'
                          : 'neutral'
                    }`}
                  >
                    {g.decision}
                  </span>
                </header>
                <dl className="showcase-grid">
                  <div>
                    <dt>约定交付</dt>
                    <dd>{version === 'v0.4' ? g.metric : g.delivery || '未约定交付件'}</dd>
                  </div>
                  <div>
                    <dt>实际交付</dt>
                    <dd>
                      {g.actualDelivery || g.note || '未提供'}
                      {version === 'v0.4' &&
                        original.results.deliverables
                          .filter((d) => d.goal === g.label)
                          .map((d) => (
                            <a key={d.id} href={files[d.id]} target="_blank" rel="noreferrer">
                              {d.label}
                              <ExternalLink />
                            </a>
                          ))}
                    </dd>
                  </div>
                  {m && (
                    <div>
                      <dt>指标实测</dt>
                      <dd>
                        {m.name}：目标 {g.target || '未约定'} · 基线 {g.metricBaseline ?? '—'} ·
                        实测 {m.current ?? '未取得'}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt>关联 Issue</dt>
                    <dd>
                      {done(related)} / {related.length} 已关闭
                      {carry.map((t) => (
                        <span
                          className={`flag-chip static${marks[t.number]?.risk ? ' risk on' : ' on'}`}
                          key={t.number}
                          title={`#${t.number} ${titleForTask(t)}`}
                        >
                          #{t.number} {marks[t.number]?.risk ? '遗留·风险' : '遗留'}
                        </span>
                      ))}
                    </dd>
                  </div>
                  {hasGap(g) && (
                    <div>
                      <dt>未达与下一步</dt>
                      <dd className="wk-gap">
                        {g.reason || '待填写'} → {g.next || '待安排'}
                      </dd>
                    </div>
                  )}
                </dl>
              </article>
            )
          })}
          {!disabled && (
            <section className="carryover-card" aria-label="遗留与风险">
              <h3>
                <ListTodo />
                遗留与风险（人工标记）
              </h3>
              {carryover.length === 0 ? (
                <p className="carryover-empty">本轮没有标记遗留的 Issue。</p>
              ) : (
                carryover.map((t) => {
                  const g = current.find((x) => x.label === t.goal)
                  return (
                    <div className="carryover-row" key={t.number}>
                      <span
                        className={`flag-chip static${marks[t.number]?.risk ? ' risk on' : ' on'}`}
                      >
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
                标记由人在准备面逐条判断；关闭 Issue 不自动等于目标达成，开放 Issue
                也不自动判为遗留。
              </p>
            </section>
          )}
        </div>
      )}
    </>
  )
}
export { AcceptanceContent }
