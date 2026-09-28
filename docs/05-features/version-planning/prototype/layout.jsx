import { React } from 'react'
import { PrototypeHeader, PrototypeSession, PrototypeSidebar } from './shell.jsx'
import { Field, Lamp, archiveTone } from './shared.jsx'
import { PlanningContent } from './screen.jsx'
import { AcceptanceContent } from '../../version-acceptance/prototype/screen.jsx'
import { ArrowLeft, ArrowUp, GitPullRequest, MessageSquare, Plus } from 'lucide-react'
import { OverviewV8 } from '../../overview-metrics/prototype/screen.jsx'
import { metrics } from './snapshot.js'
import { PrototypeTasks } from './tasks.jsx'
import { PrototypeDialogs } from './dialogs.jsx'

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
  prepareDelivery,
  progress,
  promptConversation,
  refreshMetrics,
  report,
  returnTo,
  review,
  risk,
  session,
  sessionFlow,
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
  setSession,
  setSessionFlow,
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
          {...{
            branch,
            composer,
            configId,
            draft,
            session,
            sessionFlow,
            setDraft,
            setModal,
            setNotice,
            setSession,
            view,
            weekly
          }}
        />
      )}
      <main className={`main-pane ${!chatVisible ? 'wide-page' : ''}`}>
        <PrototypeHeader
          {...{
            review,
            setExpanded,
            setNotice,
            setTaskFilter,
            setVersion,
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
                    data-tone={tone}
                    aria-current={active === i ? 'step' : undefined}
                    aria-label={label}
                    onClick={() => stageGo(i)}
                    title={`${label} · ${hint}`}
                  >
                    <span>
                      <Icon />
                      <Lamp tone={tone} label={hint} />
                    </span>
                    <strong>{label}</strong>
                  </button>
                ))}
              </nav>
              <div className="content-scroll">
                {view === 'monday' ? (
                  <PlanningContent
                    {...{
                      go,
                      goals,
                      progress,
                      refreshMetrics,
                      risk,
                      setModal,
                      setProgress,
                      setRisk,
                      setVersion,
                      update,
                      versionTasks
                    }}
                  />
                ) : (
                  <AcceptanceContent
                    {...{
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
                    }}
                  />
                )}
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
            onPlan={() => go('monday')}
            onAcceptance={(v, w) => {
              setVersion(v)
              setSessions((x) => ({
                ...x,
                验收: w
              }))
              go('friday')
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
            go,
            goals,
            metricPrep,
            modal,
            sessionFlow,
            setModal,
            setSession,
            setSessionFlow,
            update,
            weekly
          }}
        />
      )}
    </div>
  )
}
export { PrototypeLayout }
