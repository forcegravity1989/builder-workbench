import { useEffect, useRef, useState } from 'react'
import { ClipboardCheck, GitBranch } from 'lucide-react'
import type { MetricsPort } from '../../../../shared/workbench/metrics'
import type { VersionHistoryPort } from '../../../../shared/workbench/version-history'
import type { VersionCycleContext } from '../version-cycle/cycle-context'
import type { CycleEntry } from '../version-cycle/cycle-workspace-context'
import { cycleBranch } from '../version-cycle/native-cycle-workspace'
import { AutomationConfigureButton } from '../version-cycle/AutomationConfigureButton'
import { CycleStartCard } from '../version-cycle/CycleStartCard'
import { AcceptanceGoalCards } from './AcceptanceGoalCards'
import { AcceptanceSources } from './AcceptanceSources'
import { AcceptanceSummary } from './AcceptanceSummary'
import { AcceptanceNotices } from './AcceptanceNotices'
import { useAcceptanceMetricWindow } from './AcceptanceMetricWindow'
import { taskSnapshotSummary } from './AcceptanceTasks'
import { CycleTasks } from '../version-cycle/CycleTasks'
import { CycleArchive } from '../version-cycle/CycleArchive'
import { AcceptanceJourney } from './AcceptanceJourney'
import { AcceptanceReportDialog } from './AcceptanceReportDialog'
import type { AcceptanceCandidatePort } from './acceptance-candidate-port'
import { useAcceptanceBoard } from './use-acceptance-board'
import './acceptance.css'

export type AcceptanceBoardProps = {
  context: VersionCycleContext
  history: VersionHistoryPort
  metrics: MetricsPort
  candidate: AcceptanceCandidatePort
  entry: CycleEntry
}

export function AcceptanceBoard(props: AcceptanceBoardProps) {
  const { context } = props
  if (!context.scope || !context.worktreeId || !context.materialPort) {
    return (
      <div className="va-empty">
        <h1>版本验收</h1>
        <p>打开验收工作区，再明确版本与计划来源。</p>
        {context.error && <p role="alert">{context.error}</p>}
      </div>
    )
  }
  const identity = JSON.stringify([
    context.scope.projectId,
    context.scope.repoId,
    context.scope.hostId,
    context.scope.runtimeOwnerEnvironmentId,
    context.worktreeId,
    context.version
  ])
  return (
    <ReadyAcceptanceBoard
      key={identity}
      {...props}
      recoveryKey={`bw:acceptance:draft:${identity}`}
    />
  )
}

function ReadyAcceptanceBoard({
  context,
  history,
  metrics,
  candidate,
  entry,
  recoveryKey
}: AcceptanceBoardProps & { recoveryKey: string }) {
  const {
    scope,
    session,
    worktreeId,
    metricScope,
    draft,
    controller,
    recoveryError,
    recoveryText,
    versions,
    materialProblems,
    hasPlanSource,
    sourcesLoaded,
    version,
    error,
    setError,
    busy,
    report,
    archive,
    journey,
    decisionSummary,
    onChecks,
    saveTaskSnapshot,
    scroll,
    document,
    plan,
    archived,
    readOnly,
    loadVersion,
    prepare,
    editGoal,
    editReadings,
    buildReport,
    refreshData,
    flush,
    saving,
    retrySave,
    useRemoteDeletion,
    initializationSuppressed
  } = useAcceptanceBoard({ context, history, recoveryKey })
  const hasMetrics = Boolean(
    plan?.document.goals.some((goal) => goal.metricTargets.length > 0) ||
    document?.results.some((result) => result.readings.length > 0)
  )
  const metricWindow = useAcceptanceMetricWindow(metrics, metricScope, hasMetrics)
  const [reportOpen, setReportOpen] = useState(false)
  const [actionNotice, setActionNotice] = useState<string | null>(null)
  const [taskGoalFilter, setTaskGoalFilter] = useState<{ goalId: string; title: string } | null>(
    null
  )
  const startCard = useRef<HTMLElement>(null)
  const results = useRef<HTMLElement>(null)
  const archiveSection = useRef<HTMLElement>(null)
  const tasks = useRef<HTMLElement>(null)
  const [tasksOpen, setTasksOpen] = useState(false)
  const branch = cycleBranch(entry)
  // Render-time validity: a round or plan change under the same identity drops a
  // filter whose goal no longer exists in the fixed plan — no stale empty list.
  const activeGoalFilter =
    taskGoalFilter && plan?.document.goals.some((goal) => goal.goalId === taskGoalFilter.goalId)
      ? taskGoalFilter
      : null
  /** Locate the snapshot section expanded, optionally narrowed to one goal's references. */
  const openTasks = (goal?: { goalId: string; title: string } | null) => {
    setTaskGoalFilter(goal ?? null)
    setTasksOpen(true)
    tasks.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }
  useEffect(() => {
    if (!report) {
      setReportOpen(false)
    }
  }, [report])
  const prepareArchive = async () => {
    setActionNotice(null)
    try {
      if (!session) {
        throw new Error('请先在左侧新建或打开会话。')
      }
      if (readOnly) {
        throw new Error('材料正在读取，请稍后重试。')
      }
      const saved = await flush()
      if (!saved) {
        throw new Error('修改尚未保存，请先处理保存提示。')
      }
      await context.archivePort.prepareRequest(
        {
          ...scope,
          worktreeId,
          version: saved.document.version,
          cycleId: saved.document.cycleId,
          revision: saved.revision
        },
        session
      )
      setError(null)
      setActionNotice('归档请求已贴进左侧当前终端，请核对后发送。')
    } catch (reason) {
      setError(String(reason))
    }
  }
  const openReport = () => {
    // Only open on a real derivation; a failure surfaces in the board's error
    // area instead of trapping the user behind a modal "generating…" spinner.
    void buildReport().then((markdown) => {
      if (markdown !== null) {
        setReportOpen(true)
      }
    })
  }
  return (
    <main className="va-board" lang="zh">
      <header className="va-head">
        <h1>版本验收</h1>
        <select
          aria-label="验收版本"
          value={version}
          disabled={busy}
          onChange={(event) => {
            if (event.target.value) {
              void loadVersion(event.target.value)
            }
          }}
        >
          <option value="">待选择版本</option>
          {[...new Set([...versions, ...(version ? [version] : [])])].map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <button
          className="wb-btn wb-btn-ghost wb-btn-sm"
          disabled={busy || saving}
          onClick={() => {
            metricWindow.refresh()
            void refreshData()
          }}
        >
          刷新数据
        </button>
        {(saving || draft?.dirty) && (
          <span role="status">{saving ? '正在保存…' : '有改动待保存'}</span>
        )}
        <span className="vc-branch" title={branch}>
          <GitBranch size={13} aria-hidden="true" />
          <span>{branch}</span>
        </span>
        <AutomationConfigureButton onConfigure={() => void entry.configure()} />
      </header>
      <div className="va-content">
        <AcceptanceJourney
          preparation={journey.preparation}
          decisions={journey.decisions}
          archive={journey.archive}
          startRef={startCard}
          resultsRef={results}
          archiveRef={archiveSection}
        />
        <div
          className="va-scroll"
          ref={scroll}
          onScroll={() => {
            try {
              sessionStorage.setItem(
                `${recoveryKey}:scroll`,
                String(scroll.current?.scrollTop ?? 0)
              )
            } catch {
              /* Scroll recovery is optional. */
            }
          }}
        >
          <CycleStartCard
            entry={entry}
            problems={materialProblems}
            version={context.version}
            sectionRef={startCard}
          />
          {(actionNotice || entry.notice) && (
            <p className="va-notice" role="status">
              {actionNotice ?? entry.notice}
            </p>
          )}
          <AcceptanceNotices
            error={error ?? metricWindow.error}
            recoveryError={recoveryError}
            recoveryText={recoveryText}
            draft={draft}
            controller={controller}
            busy={busy}
            setError={setError}
            onRetrySave={() => void retrySave()}
            onRemoteDeleted={useRemoteDeletion}
          />
          {document ? (
            <>
              {plan && (
                <AcceptanceSummary
                  goals={decisionSummary.goals}
                  pending={decisionSummary.pending}
                  notMet={decisionSummary.notMet}
                  issueSummary={
                    plan.document.tasks.length > 0
                      ? taskSnapshotSummary(document.taskSnapshot ?? [], plan.document.tasks.length)
                      : null
                  }
                  onIssues={() => openTasks()}
                />
              )}
              <AcceptanceSources
                document={document}
                candidatePort={candidate}
                onChecks={onChecks}
              />
              {plan && (
                <>
                  <div className="va-section-heading">
                    <h2>本版目标验收</h2>
                    <button className="wb-btn wb-btn-secondary wb-btn-sm" onClick={openReport}>
                      <ClipboardCheck size={14} aria-hidden="true" />
                      预览纪要
                    </button>
                  </div>
                  <AcceptanceGoalCards
                    plan={plan.document}
                    document={document}
                    metrics={metrics}
                    metricScope={metricScope}
                    metricWindow={metricWindow.window}
                    readOnly={readOnly}
                    sectionRef={results}
                    onOpenIssues={(goalId, title) => openTasks({ goalId, title })}
                    onReadings={(goalId, ref, readings) =>
                      editReadings(document, goalId, ref, readings)
                    }
                    onGoalChange={(value, goalId) => editGoal(value, goalId)}
                    onFollowUp={(text) => void prepare(text)}
                  />
                  <CycleTasks
                    sectionRef={tasks}
                    plan={plan.document}
                    scope={scope}
                    taskPort={context.taskPort}
                    disabled={readOnly}
                    open={tasksOpen}
                    onOpen={setTasksOpen}
                    goalFilter={activeGoalFilter?.goalId ?? ''}
                    onFilter={(goalId) =>
                      setTaskGoalFilter(
                        goalId
                          ? {
                              goalId,
                              title:
                                plan.document.goals.find((goal) => goal.goalId === goalId)?.title ??
                                ''
                            }
                          : null
                      )
                    }
                    onTask={(task) =>
                      context.taskPort.openDetail(task, {
                        ...scope,
                        page: 'acceptance',
                        version: document.version,
                        cycleId: document.cycleId,
                        worktreeId,
                        sessionId: session?.sessionId,
                        scrollTop: scroll.current?.scrollTop ?? 0,
                        draftKey: recoveryKey,
                        goalId: task.reference.goalId
                      })
                    }
                    snapshot={document.taskSnapshot}
                    onSnapshot={(reads) => saveTaskSnapshot(document, reads)}
                  />
                </>
              )}
            </>
          ) : (
            <>
              <div className="va-section-heading">
                <h2>本版目标验收</h2>
                <button className="wb-btn wb-btn-secondary wb-btn-sm" disabled>
                  <ClipboardCheck size={14} aria-hidden="true" />
                  预览纪要
                </button>
              </div>
              <section
                id="acceptance-results"
                ref={results}
                aria-label="展示验收"
                className="va-results-empty"
              >
                <p>
                  {version
                    ? initializationSuppressed
                      ? '本版验收材料已删除，当前输入已复制；可在会话中重新准备。'
                      : sourcesLoaded && !hasPlanSource
                        ? '本版还没有可用计划，请在左侧会话中核对或准备计划材料。'
                        : '正在读取本版计划与验收材料…'
                    : '尚未选择版本。从上方“新建验收”与 Agent 一起确认要核对的版本。'}
                </p>
              </section>
            </>
          )}
        </div>
      </div>
      <CycleArchive
        status={archive}
        archived={archived}
        disabled={!document || readOnly || saving}
        sectionRef={archiveSection}
        onArchive={() => void prepareArchive()}
      />
      {reportOpen && (
        <AcceptanceReportDialog
          report={report ?? null}
          onClose={() => setReportOpen(false)}
          onCopy={async () => {
            if (report) {
              await navigator.clipboard
                .writeText(report)
                .catch((reason) => setError(String(reason)))
            }
          }}
        />
      )}
    </main>
  )
}
