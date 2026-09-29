import { React, useState } from 'react'
import { PrototypeHeader, PrototypeSession, PrototypeSidebar, PrototypeSplitter } from './shell.jsx'
import { Field, Lamp, archiveTone } from './shared.jsx'
import { PlanningContent, usePlanningDemo } from './screen.jsx'
import { AcceptanceContent } from '../../version-acceptance/prototype/screen.jsx'
import { ArrowLeft, ArrowUp, GitPullRequest, MessageSquare, Plus } from 'lucide-react'
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
  metricPrep,
  minutes,
  modal,
  notice,
  openIssues,
  overviewSelection,
  overviewUI,
  progress,
  promptConversation,
  refreshMetrics,
  report,
  returnTo,
  review,
  risk,
  setConfigId,
  setDraft,
  setDrafts,
  setEditingIssue,
  setExpanded,
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
  setTaskFilter,
  setVersion,
  stageGo,
  steps,
  taskList,
  taskRows,
  tasks,
  update,
  updateResult,
  version,
  versionTasks,
  view,
  weekly
}) {
  const [scenarios, setScenarios] = useState({ monday: 'selected', friday: 'selected' })
  const [sessionStates, setSessionStates] = useState({ monday: 'existing', friday: 'existing' })
  const [sessionWidth, setSessionWidth] = useState(undefined)
  const planning = usePlanningDemo({ setModal, setNotice })
  const firstEntry = weekly && ['empty', 'problem'].includes(scenarios[view])
  const hasProblems = weekly && ['problem', 'partial'].includes(scenarios[view])
  const setSessionState = (state) => setSessionStates((current) => ({ ...current, [view]: state }))
  const onScenario = (value) => {
    setScenarios((current) => ({ ...current, [view]: value }))
    setSessionState(['empty', 'problem'].includes(value) ? 'empty' : 'existing')
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
          width={sessionWidth}
          sessionState={sessionStates[view]}
          {...{
            composer,
            draft
          }}
        />
      )}
      {chatVisible && <PrototypeSplitter onResize={setSessionWidth} />}
      <main
        className={`main-pane ${!chatVisible ? 'wide-page' : ''}${view === 'monday' ? ' planning-pane' : ''}`}
      >
        <PrototypeHeader
          firstEntry={firstEntry}
          planningSaveState={planning.saveState}
          selectVersion={(value) => {
            setVersion(value)
            setNotice('')
            setExpanded(false)
            setTaskFilter('')
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
                    openSource={planning.openSource}
                    {...{
                      metricPrep,
                      promptConversation,
                      refreshMetrics,
                      review,
                      setNotice,
                      versionTasks
                    }}
                  />
                ) : (
                  <AcceptanceContent
                    disabled={firstEntry}
                    current={firstEntry ? [] : current}
                    {...{
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
              <button
                className="btn btn-ghost"
                onClick={() => {
                  const id = configId + 1
                  setConfigId(id)
                  setDrafts((x) => ({
                    ...x,
                    [`配置-${id}`]:
                      '请加载项目约定、通用 SYSTEM 与 metrics-refresh，与我明确这次新指标的口径及真实来源，按定义、脚本、试采、评审采用的流程配置。'
                  }))
                }}
              >
                <Plus />
                新建配置任务
              </button>
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
