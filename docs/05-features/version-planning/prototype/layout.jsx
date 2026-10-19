import { React, useState } from 'react'
import { PrototypeHeader, PrototypeSession, PrototypeSidebar, PrototypeSplitter } from './shell.jsx'
import { Field, Lamp, archiveTone } from './shared.jsx'
import { PlanningContent, usePlanningDemo } from './screen.jsx'
import { AcceptanceContent } from '../../version-acceptance/prototype/screen.jsx'
import { ArrowLeft, ArrowUp, GitPullRequest, MessageSquare } from 'lucide-react'
import { OverviewV8 } from '../../overview-metrics/prototype/screen.jsx'
import { metrics } from './snapshot.js'
import { PrototypeTasks } from './tasks.jsx'
import { PrototypeDialogs } from './dialogs.jsx'
import { cycleStartRequest, PrototypeNotes, PrototypeStartCard } from './cycle-entry.jsx'

function PrototypeLayout({
  active,
  archiveState,
  backFromIssue,
  branch,
  chatVisible,
  composer,
  configId,
  copied,
  copyText,
  current,
  draft,
  editingIssue,
  go,
  goalIssues,
  goals,
  hasGap,
  historical,
  issue,
  issueDraft,
  latestPackage,
  metricPrep,
  minutes,
  modal,
  notice,
  openIssue,
  overviewSelection,
  overviewUI,
  progress,
  promptConversation,
  refreshMetrics,
  report,
  returnTo,
  review,
  risk,
  setDraft,
  setEditingIssue,
  setIssueDraft,
  setIssues,
  setModal,
  setNotice,
  setOverviewSelection,
  setOverviewUI,
  setProgress,
  setRisk,
  setSelectedIssue,
  setSessions,
  setVersion,
  stageGo,
  steps,
  taskList,
  taskRows,
  tasks,
  triggerPackage,
  downloadPackage,
  update,
  updateResult,
  version,
  view,
  weekly
}) {
  const [scenarios, setScenarios] = useState({ monday: 'selected', friday: 'selected' })
  const [sessionStates, setSessionStates] = useState({ monday: 'existing', friday: 'existing' })
  const [sessionWidth, setSessionWidth] = useState(undefined)
  // 会话栏收折对计划/验收共用（同一壳）。
  const [chatCollapsed, setChatCollapsed] = useState(false)
  // 验收板人工标记（遗留/风险）、Issue 级进展备注、周次与会议指导提升到此层：跳 Issue 详情或切屏返回后保留。
  // 遗留/风险是人工判断（演示默认：#255 随 G3 未达标记遗留+风险，备注为演示预置¹）；
  // 开放 Issue 不自动判遗留，关闭 Issue 不自动判目标达成。
  const [accMarks, setAccMarks] = useState({ 255: { carry: true, risk: true } })
  const [accNotes, setAccNotes] = useState({
    255: '白名单采集脚本已交付并可按周出读数；未达主因是被管项目实际接入不足，非能力缺口。带入下版跟踪接入进展。'
  })
  const [accWeekId, setAccWeekId] = useState(null)
  // 会议指导与遗留演示预置¹：模拟会后从转写稿总结、待人确认的条目；正式界面不预置。
  const [accDirectives, setAccDirectives] = useState([
    {
      id: 1,
      status: '待确认',
      tag: '纳入下周计划',
      goal: 'G3',
      text: 'G3 未达不阻塞本版发布；下周计划把被管项目真实接入列为前置依赖，进展在周五验收同步。',
      source: '会议转写总结（演示）'
    }
  ])
  const planning = usePlanningDemo({ setModal, setNotice })
  const firstEntry = weekly && ['empty', 'problem'].includes(scenarios[view])
  const hasProblems = weekly && ['problem', 'partial'].includes(scenarios[view])
  const setSessionState = (state) => setSessionStates((current) => ({ ...current, [view]: state }))
  const onScenario = (value) => {
    setScenarios((current) => ({ ...current, [view]: value }))
    setSessionState(['empty', 'problem'].includes(value) ? 'empty' : 'existing')
    setAccWeekId(null)
    setVersion('v0.5')
    setDraft('')
    setNotice('')
  }
  const startWorkflow = () => {
    setDraft(cycleStartRequest({ view, firstEntry, hasProblems, version }))
    setSessionState('workflow')
    setNotice('')
  }
  const openSelectedVersion = (target) => {
    setScenarios((current) => ({ ...current, [target]: 'selected' }))
    setSessionStates((current) => ({ ...current, [target]: 'existing' }))
    go(target)
  }
  return (
    <div className="app-shell">
      <PrototypeSidebar
        {...{
          branch,
          go,
          setModal,
          setSelectedIssue,
          view
        }}
      />
      {chatVisible && (
        <PrototypeSession
          collapsed={chatCollapsed}
          width={sessionWidth}
          sessionState={sessionStates[view]}
          onToggleCollapse={() => setChatCollapsed((c) => !c)}
          {...{
            composer,
            draft
          }}
        />
      )}
      {chatVisible && !chatCollapsed && <PrototypeSplitter onResize={setSessionWidth} />}
      <main
        className={`main-pane ${!chatVisible ? 'wide-page' : ''}${view === 'monday' ? ' planning-pane' : ''}`}
      >
        <PrototypeHeader
          firstEntry={firstEntry}
          planningSaveState={planning.saveState}
          selectVersion={(value) => {
            setVersion(value)
            setNotice('')
          }}
          {...{
            branch,
            hasProblems,
            version,
            view,
            weekly
          }}
        />
        {weekly ? (
          <>
            <div className="work-area">
              <nav className="journey" aria-label="工作旅程">
                {steps.map(([Icon, label, tone, hint], i) => (
                  <button
                    key={label}
                    data-tone={firstEntry ? 'gray' : tone}
                    aria-current={active === i ? 'step' : undefined}
                    aria-label={label}
                    onClick={() => {
                      if (!firstEntry || i === 0) {
                        stageGo(i)
                      }
                    }}
                    disabled={firstEntry && i > 0}
                    title={`${label} · ${firstEntry ? '待选择版本' : hint}`}
                  >
                    <span>
                      <Icon />
                      <Lamp
                        tone={firstEntry ? 'gray' : tone}
                        label={firstEntry ? '待选择版本' : hint}
                      />
                    </span>
                    <strong>{label}</strong>
                  </button>
                ))}
              </nav>
              <div className="content-scroll">
                <PrototypeStartCard
                  view={view}
                  hasProblems={hasProblems}
                  onStart={startWorkflow}
                  onConfigure={() =>
                    setModal({
                      type: 'native-automation',
                      title: '配置自动化',
                      workflow: view === 'monday' ? '计划' : '验收'
                    })
                  }
                />
                {view === 'monday' ? (
                  <PlanningContent
                    sessionAvailable={sessionStates.monday !== 'empty'}
                    disabled={firstEntry}
                    goals={firstEntry ? [] : goals}
                    progress={firstEntry ? '' : progress}
                    risk={firstEntry ? '' : risk}
                    setProgress={planning.edited(setProgress)}
                    setRisk={planning.edited(setRisk)}
                    update={planning.edited(update)}
                    removeGoal={(goalId) => {
                      setGoals((currentGoals) => currentGoals.filter((goal) => goal.id !== goalId))
                      setNotice('原型示意：已删除目标，关联 Issue 保留在任务来源中。')
                    }}
                    openSource={planning.openSource}
                    {...{
                      goalIssues,
                      metricPrep,
                      openIssue,
                      promptConversation,
                      refreshMetrics,
                      review,
                      setNotice,
                      version
                    }}
                  />
                ) : (
                  <AcceptanceContent
                    disabled={firstEntry}
                    current={firstEntry ? [] : current}
                    marks={accMarks}
                    setMarks={setAccMarks}
                    notes={accNotes}
                    setNotes={setAccNotes}
                    directives={accDirectives}
                    setDirectives={setAccDirectives}
                    weekId={accWeekId}
                    setWeekId={setAccWeekId}
                    {...{
                      goalIssues,
                      hasGap,
                      latestPackage,
                      openIssue,
                      promptConversation,
                      refreshMetrics,
                      review,
                      setModal,
                      setNotice,
                      triggerPackage,
                      downloadPackage,
                      updateResult,
                      version
                    }}
                  />
                )}
                <PrototypeNotes scenario={scenarios[view]} onScenario={onScenario} />
              </div>
            </div>
            <footer className="page-footer">
              <span className="archive-state">
                <GitPullRequest />
                <Lamp tone={archiveTone(archiveState)} />
                归档 PR 未读取
              </span>
              <span className="notice" role="status">
                {notice}
              </span>
              <button
                className="prototype-notes-link"
                title="仅供原型验看，不属于最终界面"
                onClick={() => {
                  const notes = document.getElementById('prototype-notes')
                  notes.open = true
                  notes.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  notes.querySelector('select')?.focus({ preventScroll: true })
                }}
              >
                原型场景<sup>1</sup>
              </button>
            </footer>
          </>
        ) : view === 'overview' ? (
          <OverviewV8
            metrics={metrics}
            goals={goals}
            tasks={taskRows('v0.5')}
            planMinutes={minutes()}
            acceptanceDrafts={Object.fromEntries(
              [
                ['v0.5', 'W39', goals],
                ['v0.4', 'W38', historical]
              ]
                .filter(([, , gs]) =>
                  gs.some(
                    (g) =>
                      g.actualDelivery?.trim() ||
                      g.reason?.trim() ||
                      g.next?.trim() ||
                      g.decision !== '待核对'
                  )
                )
                .map(([v, w, gs]) => [
                  v,
                  {
                    week: w,
                    status: '未归档草稿',
                    summary: gs
                      .filter(
                        (g) =>
                          g.actualDelivery?.trim() ||
                          g.reason?.trim() ||
                          g.next?.trim() ||
                          g.decision !== '待核对'
                      )
                      .map(
                        (g) =>
                          `${g.label} ${g.decision}；实际交付：${
                            g.actualDelivery || '待提供'
                          }${g.reason ? `；${g.reason}` : ''}`
                      )
                      .join('。'),
                    text: report(v)
                  }
                ])
            )}
            overviewUI={overviewUI}
            setOverviewUI={setOverviewUI}
            selection={overviewSelection}
            setSelection={setOverviewSelection}
            onPlan={() => openSelectedVersion('monday')}
            onAcceptance={(v, w) => {
              setVersion(v)
              setSessions((x) => ({
                ...x,
                验收: w
              }))
              openSelectedVersion('friday')
            }}
            onPrepare={metricPrep}
          />
        ) : view === 'metricsetup' ? (
          <section className="native-project-session" aria-label="原生项目会话">
            <div className="native-session-toolbar">
              <button className="btn btn-ghost" onClick={() => go('overview')}>
                <ArrowLeft />
                返回总览
              </button>
              <span>配置指标 · 任务 {configId}</span>
            </div>
            <div className="native-session-body">
              <div className="session-empty">
                <MessageSquare />
                <span>会话记录待接入</span>
              </div>
              <div className="composer" ref={composer}>
                <Field
                  label="会话输入"
                  value={draft}
                  onChange={setDraft}
                  rows={5}
                  placeholder="与会话讨论指标口径和采集脚本…"
                />
                <div>
                  <span>Claude Code</span>
                  <button
                    className="btn btn-icon btn-ghost"
                    aria-label="发送（原型未接入）"
                    onClick={() => setNotice('会话尚未连接；输入已保留，未发送')}
                  >
                    <ArrowUp />
                  </button>
                </div>
              </div>
              <p className="native-session-status" role="status">
                {notice || '原型 · 尚未连接 Orca'}
              </p>
            </div>
          </section>
        ) : (
          <PrototypeTasks
            {...{
              backFromIssue,
              editingIssue,
              issue,
              issueDraft,
              notice,
              returnTo,
              setEditingIssue,
              setIssueDraft,
              setIssues,
              setNotice,
              taskList,
              tasks,
              version
            }}
          />
        )}
      </main>
      {modal && (
        <PrototypeDialogs
          {...{
            copied,
            copyText,
            modal,
            setModal
          }}
        />
      )}
    </div>
  )
}
export { PrototypeLayout }
