import { IconAction } from '../../version-workspace/prototype/g2-icon-action.jsx'
import {
  initial,
  storageKey,
  loadDraft,
  versions,
  weeks,
  steps,
  deadlineWarning
} from './milestones-data.js'
import {
  CalendarPanel,
  EditRequirement,
  MetricsPanel,
  Modal,
  ReferencePanel,
  PlanningSourcePanel,
  VersionBridge
} from './milestones-panels.jsx'
const {
  // React is used by the shared JSX build factory.
  // eslint-disable-next-line no-unused-vars
  React,
  useState,
  useEffect,
  createRoot,
  LayoutDashboard,
  BookOpen,
  CalendarRange,
  CalendarClock,
  MessageSquare,
  GitBranch,
  ChevronRight,
  Pencil,
  X,
  Check,
  ArrowRight,
  ExternalLink,
  RefreshCw,
  ChartNoAxesCombined
} = window.BWPrototypeDependencies

function Sidebar({ openVersion, openInfo }) {
  return (
    <aside className="ml-sidebar" aria-label="项目导航">
      <div className="ml-brand">
        <span className="ml-logo">W</span>
        <strong>Workbench</strong>
      </div>
      <button
        className="ml-nav"
        onClick={() =>
          openInfo('项目墙', '生产入口沿用现有项目墙；此原型固定在 Workbench 演示项目。')
        }
      >
        <LayoutDashboard size={16} />
        项目墙
      </button>
      <div className="ml-project-name">Builders’ Workbench</div>
      <button
        className="ml-nav"
        onClick={() => openInfo('任务', '保留当前壳的原生任务入口，演示不读取或修改真实 Issue。')}
      >
        <Check size={16} />
        任务
      </button>
      <button
        className="ml-nav"
        onClick={() => openInfo('自动化', '保留当前壳的原生自动化入口，演示不创建或运行自动化。')}
      >
        <CalendarClock size={16} />
        自动化
      </button>
      <button
        className="ml-nav active"
        aria-current="page"
        onClick={() => document.querySelector('main').scrollTo({ top: 0, behavior: 'smooth' })}
      >
        <LayoutDashboard size={16} />
        项目总览
      </button>
      <button
        className="ml-nav"
        onClick={() =>
          openInfo(
            '知识库',
            '沿用现有知识库的文档、代码与对账入口。本原型不替换知识库或编辑项目正本。'
          )
        }
      >
        <BookOpen size={16} />
        知识库
      </button>
      <div className="ml-nav-rule" />
      <div className="ml-sidebar-label">
        版本 <span className="tag tag-outline">演示</span>
      </div>
      <button
        className="ml-nav"
        onClick={() =>
          openInfo('新建版本', '沿用当前原生版本准备入口；本原型不创建版本、会话或工作树。')
        }
      >
        ＋ 新建版本
      </button>
      {versions.map((v, i) => (
        <details key={v} open={i === 0}>
          <summary>
            <ChevronRight size={13} />
            <span>{v}</span>
            <small>11.{weeks[i]}</small>
          </summary>
          <div className="ml-subnav">
            {['总览', '计划', '任务', '验收'].map((name) => (
              <button
                key={name}
                onClick={() =>
                  name === '总览'
                    ? openVersion(v)
                    : openInfo(
                        `${v} · ${name}`,
                        `沿用当前 BW 的${name}入口与本版上下文。本原型不启动会话、不创建工作树或写真实材料。`
                      )
                }
              >
                {name}
              </button>
            ))}
          </div>
        </details>
      ))}
      <div className="ml-nav-rule" />
      <div className="ml-sidebar-label">项目工作区</div>
      <button
        className="ml-nav"
        onClick={() =>
          openInfo(
            '原生工作区',
            '保留 #455 的原生工作树入口。已归版树在版本下访问，未归版树在此访问，不重复建立会话或历史区。'
          )
        }
      >
        <GitBranch size={15} />
        未归版工作树
      </button>
      <details>
        <summary>
          <ChevronRight size={13} />
          其他项目
        </summary>
        <p className="muted">沿用原生项目列表</p>
      </details>
      <div className="ml-sidebar-bottom">
        <span className="avatar">A</span>
        <span>
          Builder A <small>演示身份</small>
        </span>
      </div>
    </aside>
  )
}

function App() {
  const [draft, setDraft] = useState(loadDraft)
  const [saveError, setSaveError] = useState('')
  const [modal, setModal] = useState(null)
  const [selectedId, setSelectedId] = useState('DEMO-01')
  const [step, setStep] = useState(0)
  const [mode, setMode] = useState('mvp')
  const [prompt, setPrompt] = useState(
    '先让一个大需求跑通 MVP 和试用，再按反馈修理。另一项能否稍后开始？'
  )
  const [proposal, setProposal] = useState(null)
  const [toast, setToast] = useState('')
  const [expanded, setExpanded] = useState(true)
  const selected = draft.requirements.find((r) => r.id === selectedId) || draft.requirements[0]
  const chosen = draft.requirements
    .filter((r) => r.selected)
    .sort((a, b) => a.priority - b.priority)
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(draft))
      setSaveError('')
    } catch {
      setSaveError('浏览器无法保存演示修改；刷新将丢失本次草案。')
    }
  }, [draft])
  useEffect(() => {
    if (!toast) {
      return undefined
    }
    const timer = setTimeout(() => setToast(''), 3500)
    return () => clearTimeout(timer)
  }, [toast])
  const selectRequirement = (id) => {
    setSelectedId(id)
    setProposal(null)
  }
  const change = (id, values) => {
    setProposal(null)
    setDraft({
      ...draft,
      status: '讨论中',
      requirements: draft.requirements.map((r) => (r.id === id ? { ...r, ...values } : r))
    })
  }
  const openInfo = (title, text) => setModal({ type: 'info', title, text })
  const openVersion = (version, item = selected) => setModal({ type: 'version', version, item })
  const propose = () => {
    const item = selected
    if (!prompt.trim()) {
      setToast('先补充讨论内容。')
      return
    }
    if (mode === 'calendar') {
      const days = draft.calendar?.days
      if (!days || !days[item.due]) {
        setProposal({
          title: '先核对工作日历',
          text: '当前截止日没有日历依据。先导入并核对材料，不移动截止时间。',
          changes: [],
          basis: prompt
        })
        return
      }
      if (days[item.due].work) {
        setProposal({
          title: '截止日已有工作日依据',
          text: '不需要改期；可继续讨论交付范围。',
          changes: [],
          basis: prompt
        })
        return
      }
      const next = Object.keys(days)
        .sort()
        .find((date) => date > item.due && days[date].work)
      if (!next || Number(next.slice(-2)) > 29) {
        setProposal({
          title: '需要补充后续版本安排',
          text: '当前展示的 B 版本内没有后续已知工作日。核对后续日历与版本再讨论改期，当前安排保持不变。',
          changes: [],
          basis: prompt
        })
        return
      }
      const nextVersion =
        versions[Math.min(3, Math.max(0, Math.floor((Number(next.slice(-2)) - 2) / 7)))]
      setProposal({
        title: '把截止安排到下一个已知工作日',
        text: '日历只说明可用日期。是否延后承诺，仍由你决定；本版范围也需一并核对。',
        changes: [{ id: item.id, due: next, target: nextVersion }],
        basis: prompt
      })
    } else if (mode === 'focus') {
      const other = chosen.find((r) => r.id !== item.id)
      setProposal({
        title: '本月先聚焦一个可试用的交付',
        text: other
          ? `将“${other.title}”暂不安排，保留候选与理由。此演示不会推断团队容量。`
          : '本月已仅选择一项，无需移出其他需求。',
        changes: other
          ? [
              {
                id: other.id,
                selected: false,
                reason: '先集中精力完成一个 MVP 的试用修理；有余量再评估。'
              }
            ]
          : [],
        basis: prompt
      })
    } else {
      setProposal({
        title: '先交能试用的 MVP，再修理完善',
        text: '先行 B 版本同时承接规格对齐和开发。后续 B 版本依试用反馈完善，分别一次正式验收。',
        changes: [
          {
            id: item.id,
            first: 'B01',
            target: 'B02',
            due: '2026-11-13'
          }
        ],
        basis: prompt
      })
    }
  }
  const applyProposal = () => {
    setDraft({
      ...draft,
      status: '讨论中',
      requirements: draft.requirements.map((r) => ({
        ...r,
        ...proposal.changes.find((c) => c.id === r.id)
      })),
      decisions: [...new Set([...draft.decisions, `${proposal.title}；输入：${proposal.basis}`])]
    })
    setProposal(null)
    setToast('建议已加入演示草案，尚未确认月度选择。')
  }
  return (
    <>
      <div className="ml-review-strip">
        <span>
          <b>#440</b> 设计草案 <span className="strip-dot">·</span> 2026 年 11 月 / B01—B04
          均为演示，非 v0.8 承诺
        </span>
        <div className="ml-actions">
          <span className="ml-save-status">{saveError ? '未保存' : '仅本浏览器保存'}</span>
          <IconAction
            label="重置演示"
            icon={RefreshCw}
            onClick={() => setModal({ type: 'reset' })}
          />
          <IconAction
            label="切换深浅主题"
            icon={LayoutDashboard}
            onClick={() => {
              document.documentElement.dataset.theme =
                document.documentElement.dataset.theme === 'dark' ? '' : 'dark'
            }}
          />
        </div>
      </div>
      <div className="ml-app">
        <Sidebar openVersion={openVersion} openInfo={openInfo} />
        <div className="ml-workspace">
          <div className="ml-topbar">
            <span>
              Builders’ Workbench <ChevronRight size={13} /> 项目总览
            </span>
            <div className="ml-actions">
              <IconAction
                label="项目背景与指标"
                icon={ChartNoAxesCombined}
                onClick={() => setModal({ type: 'metrics' })}
              />
              <IconAction
                label="设计依据"
                icon={BookOpen}
                onClick={() => setModal({ type: 'references' })}
              />
              <IconAction
                label={expanded ? '收起规划讨论' : '打开规划讨论'}
                icon={MessageSquare}
                onClick={() => setExpanded(!expanded)}
              />
            </div>
          </div>
          <div className={`ml-columns ${expanded ? '' : 'collapsed'}`}>
            <main>
              <div className="ml-draft-source">
                <div>
                  <b>规划草案</b>
                  <span> 在项目总览规划全局安排，按月查看与调整。</span>
                </div>
                <button className="btn btn-ghost" onClick={() => setModal({ type: 'source' })}>
                  正式总览与评审路径 <ArrowRight size={14} />
                </button>
              </div>
              <div className="ml-heading">
                <div>
                  <p className="eyebrow">项目总览</p>
                  <h1>项目里程碑</h1>
                </div>
                <span className="tag tag-outline">{draft.status}</span>
              </div>
              <div className="ml-context">
                <span>
                  方向 <b>让 Builder 不只更快，也更好地完成项目</b>
                </span>
                <button onClick={() => setModal({ type: 'metrics' })}>
                  项目背景与指标 <ArrowRight size={14} />
                </button>
              </div>
              <section aria-labelledby="month-title" className="ml-month">
                <div className="ml-section-head">
                  <h2 id="month-title">
                    2026 年 11 月 <span className="muted">月度选择</span>
                  </h2>
                  <div className="ml-actions">
                    <span className="tag tag-outline">{chosen.length} 项纳入</span>
                    <IconAction
                      label="导入或核对工作日历"
                      icon={CalendarClock}
                      onClick={() => setModal({ type: 'calendar' })}
                    />
                  </div>
                </div>
                <p className="ml-summary">
                  先选值得做的大需求，约定优先次序和截止时间。具体范围与体验，在 B 版本中持续收敛。
                </p>
                <div className="ml-calendar-status">
                  <CalendarRange size={15} />
                  <span>
                    {draft.calendar
                      ? `${draft.calendar.fixture ? '演示日历' : '用户提供的文本 · 未核验来源'} · ${Object.keys(draft.calendar.days).length}/30 天有记录`
                      : '华为工作日历未提供 · 日期暂作讨论参考'}
                  </span>
                  <button onClick={() => setModal({ type: 'calendar' })}>核对日历</button>
                </div>
                <div className="ml-choice-list">
                  {[...draft.requirements]
                    .sort((a, b) => a.priority - b.priority)
                    .map((item) => (
                      <article
                        key={item.id}
                        className={`ml-choice ${selectedId === item.id ? 'selected' : ''} ${item.selected ? '' : 'deferred'}`}
                      >
                        <input
                          type="checkbox"
                          aria-label={`本月选择 ${item.id}`}
                          checked={item.selected}
                          onChange={(e) => change(item.id, { selected: e.target.checked })}
                        />
                        <button
                          className="ml-choice-main"
                          onClick={() => selectRequirement(item.id)}
                        >
                          <span className="ml-choice-title">
                            <span className="ml-priority">P{item.priority}</span>
                            <strong>{item.title}</strong>
                          </span>
                          <span className="ml-reason">{item.reason}</span>
                        </button>
                        <div className="ml-choice-meta">
                          <span>{item.owner}</span>
                          <small>
                            {item.selected
                              ? `${item.target} · 截止 ${item.due.slice(5).replace('-', '/')}`
                              : '暂不安排'}
                          </small>
                        </div>
                        <IconAction
                          label={`编辑 ${item.id}`}
                          icon={Pencil}
                          onClick={() => setModal({ type: 'edit', item })}
                        />
                      </article>
                    ))}
                </div>
              </section>
              <section aria-labelledby="lane-title" className="ml-lanes-section">
                <div className="ml-section-head">
                  <h2 id="lane-title">从先行 MVP 到后续完善</h2>
                  <span className="muted">按大需求分泳道</span>
                </div>
                <div className="ml-timeline" role="region" aria-label="月度需求泳道" tabIndex={0}>
                  <div className="ml-time-head">
                    <span>大需求 / 主导人</span>
                    {versions.map((v, i) => (
                      <button key={v} onClick={() => openVersion(v)}>
                        <b>{v}</b>
                        <small>11.{weeks[i]}</small>
                      </button>
                    ))}
                  </div>
                  {chosen.length === 0 ? (
                    <div className="ml-empty">尚未选择本月大需求。从上方候选开始讨论。</div>
                  ) : (
                    chosen.map((item) => (
                      <div className="ml-lane" key={item.id}>
                        <button
                          className="ml-lane-label"
                          onClick={() => selectRequirement(item.id)}
                        >
                          <small>
                            {item.id} · {item.owner}
                          </small>
                          <b>{item.title}</b>
                          <span
                            className={
                              deadlineWarning(item, draft.calendar).includes('休息')
                                ? 'ml-warning'
                                : 'muted'
                            }
                          >
                            {item.due.slice(5).replace('-', '/')} ·{' '}
                            {deadlineWarning(item, draft.calendar)}
                          </span>
                        </button>
                        <div className="ml-lane-bars">
                          {versions.map((v) => (
                            <span className="ml-grid-cell" key={v} />
                          ))}
                          <button
                            className="ml-version-bar mvp"
                            style={{ gridColumn: versions.indexOf(item.first) + 1 }}
                            onClick={() => {
                              selectRequirement(item.id)
                              setStep(1)
                              openVersion(item.first, item)
                            }}
                          >
                            <span>
                              先行 MVP <ExternalLink size={12} />
                            </span>
                            <small>设计对齐 → 可试用</small>
                          </button>
                          <button
                            className="ml-version-bar improve"
                            style={{ gridColumn: versions.indexOf(item.target) + 1 }}
                            onClick={() => {
                              selectRequirement(item.id)
                              setStep(3)
                              openVersion(item.target, item)
                            }}
                          >
                            <span>
                              修理完善 <ExternalLink size={12} />
                            </span>
                            <small>试用反馈 → 约定范围</small>
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                  <div className="ml-issue-lane">
                    <span>日常小需求与 bug</span>
                    <button
                      onClick={() => {
                        setStep(4)
                        openInfo(
                          'Issue 持续改善',
                          '大需求完成之后，bug、优化与衍生小需求继续进入现有 Issue workflow。复用任务、会话与工作树，Issue 关闭仍由人决定。原型未读取或创建真实 Issue。'
                        )
                      }}
                    >
                      贯穿每个 B 版本 · 沿现有 Issue workflow 处理 <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
                <p className="ml-footnote">
                  周节奏便于反馈，必要时可跨周；每个 B 版本只做一次正式验收。需求数量与周期不固定。
                </p>
              </section>
              <section className="ml-journey" aria-labelledby="journey-title">
                <div className="ml-section-head">
                  <h2 id="journey-title">沿同一个需求看交付</h2>
                  <span className="muted">{selected.id} · 演示旅程</span>
                </div>
                <div className="ml-steps">
                  {steps.map((label, i) => (
                    <button
                      aria-current={step === i ? 'step' : undefined}
                      key={label}
                      className={step === i ? 'current' : ''}
                      onClick={() => setStep(i)}
                    >
                      <span>{i + 1}</span>
                      {label}
                    </button>
                  ))}
                </div>
                <div className="ml-journey-detail">
                  <div>
                    <h3>
                      {
                        [
                          selected.title,
                          `${selected.first} · 交付一个能试用的 MVP`,
                          '邀请部分用户试用，收集实际问题',
                          `${selected.target} · 修理、完善至约定范围`,
                          '完成后，持续改善仍有去处'
                        ][step]
                      }
                    </h3>
                    <p>
                      {
                        [
                          selected.reason,
                          selected.mvp,
                          '演示场景：3 位内部用户试用。反馈“调整后不知道哪个版本受影响”，带回后续 B 版本讨论；不据此判大需求完成。',
                          selected.later,
                          '新 bug 与衍生小需求进入 Issue。任务的处理结果来自原生状态，会话结束不等于完成。'
                        ][step]
                      }
                    </p>
                  </div>
                  <button
                    className="btn btn-secondary"
                    onClick={() => openVersion(step <= 2 ? selected.first : selected.target)}
                  >
                    进入 {step <= 2 ? selected.first : selected.target} 总览{' '}
                    <ArrowRight size={14} />
                  </button>
                </div>
              </section>
            </main>
            {expanded && (
              <aside className="ml-discussion" aria-label="规划讨论">
                <div className="ml-panel-tabs">
                  <strong>规划讨论</strong>
                  <IconAction label="收起侧面板" icon={X} onClick={() => setExpanded(false)} />
                </div>
                <div className="ml-discussion-body">
                  <div className="ml-discussion-context">
                    <span className="eyebrow">讨论对象 · {selected.id}</span>
                    <h3>{selected.title}</h3>
                    <p className="muted">围绕选择、节奏和日历继续讨论，结论进入安排。</p>
                  </div>
                  <div className="ml-model-note">
                    <MessageSquare size={18} />
                    <div>
                      <strong>从取舍开始</strong>
                      <p>
                        先确定当前团队优先做哪件，再把
                        MVP、试用与完善串起来；现在不必补齐高保真或完整规格。
                      </p>
                    </div>
                  </div>
                  <label className="field">
                    讨论方式
                    <select
                      className="input"
                      aria-label="讨论方式"
                      value={mode}
                      onChange={(e) => {
                        setMode(e.target.value)
                        setProposal(null)
                      }}
                    >
                      <option value="mvp">先交 MVP，再按反馈完善</option>
                      <option value="focus">减少本月并行需求</option>
                      <option value="calendar">检查截止日与工作日历</option>
                    </select>
                  </label>
                  <textarea
                    className="input ml-prompt"
                    aria-label="规划讨论输入"
                    value={prompt}
                    onChange={(e) => {
                      setPrompt(e.target.value)
                      setProposal(null)
                    }}
                  />
                  <button className="btn btn-primary" onClick={propose}>
                    预览模型建议 <ArrowRight size={15} />
                  </button>
                  <p className="ml-footnote">
                    脚本演示，未调用模型。真实使用拟复用原生会话与批注发送入口。
                  </p>
                  {proposal && (
                    <section className="ml-proposal" aria-label="模型建议预览">
                      <span className="eyebrow">建议 · 待采纳</span>
                      <h3>{proposal.title}</h3>
                      <p>{proposal.text}</p>
                      {proposal.changes.map((c) => {
                        const old = draft.requirements.find((r) => r.id === c.id)
                        return (
                          <div className="ml-change" key={c.id}>
                            <b>{c.id}</b>
                            {c.reason && (
                              <p>
                                取舍理由：{old.reason} → {c.reason}
                              </p>
                            )}
                            {c.selected === false ? (
                              <p>本月选择 → 暂不安排</p>
                            ) : (
                              <>
                                <p>
                                  {old.first} → {c.first || old.first} 先行
                                </p>
                                <p>
                                  {old.target} → {c.target || old.target} 完善
                                </p>
                                <p>
                                  {old.due} → {c.due || old.due}
                                </p>
                              </>
                            )}
                          </div>
                        )
                      })}
                      <div className="ml-actions">
                        {proposal.changes.length > 0 && (
                          <button className="btn btn-primary" onClick={applyProposal}>
                            采纳到草案
                          </button>
                        )}
                        <button className="btn btn-ghost" onClick={() => setProposal(null)}>
                          继续讨论
                        </button>
                      </div>
                    </section>
                  )}
                  {draft.decisions.length > 0 && (
                    <section className="ml-decisions">
                      <h3>已采纳的讨论结论</h3>
                      {[...new Set(draft.decisions)].map((d) => (
                        <p key={d}>
                          <Check size={14} />
                          {d}
                        </p>
                      ))}
                    </section>
                  )}
                  <div className="ml-confirm">
                    <p>
                      已选 {chosen.length} 项 · {draft.status}
                    </p>
                    <button
                      className="btn btn-secondary"
                      disabled={chosen.length === 0}
                      onClick={() => setModal({ type: 'confirm' })}
                    >
                      核对月度选择
                    </button>
                  </div>
                </div>
              </aside>
            )}
          </div>
        </div>
      </div>
      {modal?.type === 'references' && <ReferencePanel close={() => setModal(null)} />}
      {modal?.type === 'source' && <PlanningSourcePanel close={() => setModal(null)} />}
      {saveError && (
        <div className="ml-save-error" role="alert">
          {saveError}
        </div>
      )}
      {toast && (
        <div className="ml-toast" role="status">
          {toast}
        </div>
      )}
      {modal?.type === 'calendar' && (
        <CalendarPanel
          calendar={draft.calendar}
          apply={(calendar) => {
            setProposal(null)
            setDraft({ ...draft, calendar, status: '讨论中' })
            setToast('日历已应用到演示；截止时间未移动。')
          }}
          close={() => setModal(null)}
        />
      )}
      {modal?.type === 'edit' && (
        <EditRequirement
          item={modal.item}
          save={(item) => change(item.id, item)}
          close={() => setModal(null)}
        />
      )}
      {modal?.type === 'version' && (
        <VersionBridge
          item={modal.item}
          version={modal.version}
          step={step}
          close={() => setModal(null)}
        />
      )}
      {modal?.type === 'metrics' && <MetricsPanel close={() => setModal(null)} />}
      {modal?.type === 'info' && (
        <Modal title={modal.title} close={() => setModal(null)}>
          <p>{modal.text}</p>
        </Modal>
      )}
      {modal?.type === 'reset' && (
        <Modal title="重置这份演示" close={() => setModal(null)}>
          <p>将清除本浏览器保存的演示安排与日历。原生浏览器批注由 Orca 管理，不在本页修改。</p>
          <footer>
            <button
              className="btn btn-primary"
              onClick={() => {
                setDraft(structuredClone(initial))
                setProposal(null)
                setStep(0)
                setModal(null)
              }}
            >
              重置演示
            </button>
          </footer>
        </Modal>
      )}
      {modal?.type === 'confirm' && (
        <Modal title="核对月度选择" close={() => setModal(null)}>
          <p>只确认做哪些大需求、优先级、目标 B 版本及截止时间。具体交付范围在 B 版本中收敛。</p>
          {chosen.map((item) => (
            <div className="ml-confirm-row" key={item.id}>
              <strong>
                P{item.priority} · {item.title}
              </strong>
              <p>
                {item.first} MVP → {item.target} 完善 · {item.due}
              </p>
              <small>{deadlineWarning(item, draft.calendar)}</small>
            </div>
          ))}
          <p className="muted">这是一次演示确认，不写回真实计划，不代表需求完成或版本验收。</p>
          <footer>
            <button className="btn btn-secondary" onClick={() => setModal(null)}>
              返回讨论
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                setDraft({
                  ...draft,
                  status: '已确认 · 演示',
                  decisions: [
                    ...draft.decisions,
                    `人工确认演示月度选择：${chosen.map((r) => r.id).join('、')}`
                  ]
                })
                setModal(null)
              }}
            >
              确认演示选择
            </button>
          </footer>
        </Modal>
      )}
    </>
  )
}
createRoot(document.getElementById('root')).render(<App />)
