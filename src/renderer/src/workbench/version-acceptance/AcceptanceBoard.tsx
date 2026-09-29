import { useEffect, useRef, useState } from 'react'
import { GitBranch } from 'lucide-react'
import type { MetricsPort } from '../../../../shared/workbench/metrics'
import type { VersionHistoryPort } from '../../../../shared/workbench/version-history'
import type { VersionCycleContext } from '../version-cycle/cycle-context'
import type { CycleEntry } from '../version-cycle/cycle-workspace-context'
import { cycleBranch } from '../version-cycle/native-cycle-workspace'
import { CycleStartCard } from '../version-cycle/CycleStartCard'
import { VersionGoalCard } from '../version-cycle/VersionGoalCard'
import { AcceptanceGoalResult } from './AcceptanceGoalResult'
import { AcceptanceSources } from './AcceptanceSources'
import { AcceptanceNotices } from './AcceptanceNotices'
import { AcceptanceMetrics } from './AcceptanceMetrics'
import { useAcceptanceMetricWindow } from './AcceptanceMetricWindow'
import { AcceptanceTasks, taskSnapshotSummary } from './AcceptanceTasks'
import { AcceptanceArchive } from './AcceptanceArchive'
import { AcceptanceSourcePicker } from './AcceptanceSourcePicker'
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
    sources,
    historyProblems,
    materialProblems,
    refreshCatalog,
    version,
    planChoice,
    setPlanChoice,
    error,
    setError,
    busy,
    report,
    archive,
    archiveMaterial,
    journey,
    decisionSummary,
    onChecks,
    saveTaskSnapshot,
    scroll,
    document,
    plan,
    archived,
    archivePending,
    readOnly,
    loadVersion,
    discardLocal,
    begin,
    prepare,
    editGoal,
    editReadings,
    archiveStatus,
    buildReport
  } = useAcceptanceBoard({ context, history, recoveryKey })
  const hasMetrics = (plan?.document.goals.length ?? 0) > 0
  const metricWindow = useAcceptanceMetricWindow(metrics, metricScope, hasMetrics)
  const [reportOpen, setReportOpen] = useState(false)
  const [actionNotice, setActionNotice] = useState<string | null>(null)
  const results = useRef<HTMLElement>(null)
  const tasks = useRef<HTMLDetailsElement>(null)
  const branch = cycleBranch(entry)
  useEffect(() => {
    if (!report) {
      setReportOpen(false)
    }
  }, [report])
  const prepareArchive = () => {
    setActionNotice(null)
    if (archived) {
      setError('本轮验收已归档；如需补充材料，请从来源选择开始下一轮。')
      return
    }
    if (!session) {
      setError('请先选择或开启左侧会话，再准备归档请求。')
      return
    }
    if (!document || !draft?.expectedRevision) {
      setError('请先保存验收结果，再准备归档请求。')
      return
    }
    if (draft.dirty) {
      setError('有未保存的修改；请先保存结果，再准备归档请求。')
      return
    }
    if (readOnly || busy) {
      setError('归档状态尚未核实或材料只读，请稍后重试。')
      return
    }
    void context.archivePort
      .prepareRequest(
        {
          ...scope,
          worktreeId,
          version: document.version,
          cycleId: document.cycleId,
          revision: draft.expectedRevision
        },
        session
      )
      .then(() => {
        setError(null)
        setActionNotice('归档请求已放入会话输入框，请核对后发送。')
      })
      .catch((reason) => setError(String(reason)))
  }
  const openReport = () => {
    setReportOpen(true)
    void buildReport()
  }
  return (
    <main className="va-board" lang="zh">
      <header className="va-head">
        <h1>版本验收</h1>
        <select
          aria-label="验收版本"
          value={version}
          disabled={busy || draft?.dirty}
          onChange={(event) => {
            if (event.target.value) {
              void loadVersion(event.target.value)
            }
          }}
        >
          <option value="">请选择版本</option>
          {[...new Set([...versions, ...(version ? [version] : [])])].map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <button className="wb-btn wb-btn-ghost wb-btn-sm" onClick={refreshCatalog}>
          刷新版本
        </button>
        <span>
          {draft?.dirty
            ? '草稿未保存'
            : archivePending
              ? '正在读取归档状态…'
              : document
                ? '已保存材料'
                : '待选择'}
        </span>
        <span className="vc-branch" title={branch}>
          <GitBranch size={13} aria-hidden="true" />
          <span>{branch}</span>
        </span>
      </header>
      <div className="va-content">
        <AcceptanceJourney
          preparation={journey.preparation}
          decisions={journey.decisions}
          archive={journey.archive}
          resultsRef={results}
          onArchive={prepareArchive}
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
          <CycleStartCard entry={entry} problems={materialProblems} version={context.version} />
          {(actionNotice || entry.notice) && (
            <p className="va-notice" role="status">
              {actionNotice ?? entry.notice}
            </p>
          )}
          <AcceptanceNotices
            error={error}
            recoveryError={recoveryError}
            recoveryText={recoveryText}
            historyProblems={historyProblems}
            draft={draft}
            controller={controller}
            archived={archived}
            busy={busy}
            setError={setError}
            onDiscardLocal={() => void discardLocal()}
          />
          {(!document || archived) && version && (
            <AcceptanceSourcePicker
              hasDocument={Boolean(document)}
              version={version}
              sources={sources}
              planChoice={planChoice}
              busy={busy}
              onPlanChoice={setPlanChoice}
              onBegin={() => void begin()}
            />
          )}
          {document ? (
            <>
              {plan && (
                <div className="va-summary">
                  <span>
                    <strong>{decisionSummary.goals}</strong> 项目标
                  </span>
                  {plan.document.tasks.length > 0 && (
                    <button
                      className="va-summary-issues"
                      onClick={() =>
                        tasks.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
                      }
                    >
                      {taskSnapshotSummary(document.taskSnapshot ?? [], plan.document.tasks.length)}
                    </button>
                  )}
                  <span className="va-pending-count">
                    {decisionSummary.pending} 项待核对
                    {decisionSummary.notMet > 0 ? ` · ${decisionSummary.notMet} 项未达` : ''}
                  </span>
                </div>
              )}
              <AcceptanceSources
                document={document}
                hasMetrics={hasMetrics}
                metricWindow={metricWindow}
                disabled={readOnly}
                onPrepare={(text) => void prepare(text)}
                candidatePort={candidate}
                onChecks={onChecks}
              />
              {plan && (
                <>
                  <div className="va-section-heading">
                    <h2>本版目标验收</h2>
                    <button className="wb-btn wb-btn-sm" onClick={openReport}>
                      预览纪要
                    </button>
                  </div>
                  <section id="acceptance-results" ref={results} aria-label="展示验收">
                    {plan.document.goals.map((goal, index) => (
                      <VersionGoalCard
                        key={goal.goalId}
                        goal={goal}
                        index={index}
                        readOnly
                        metrics={
                          <AcceptanceMetrics
                            goal={goal}
                            materialKey={JSON.stringify([
                              document.version,
                              document.cycleId,
                              document.planRef,
                              document.candidateRef
                            ])}
                            readings={
                              document.results.find((item) => item.goalId === goal.goalId)
                                ?.readings ?? []
                            }
                            port={metrics}
                            scope={metricScope}
                            window={metricWindow.window}
                            disabled={readOnly}
                            onReadings={(ref, readings) =>
                              editReadings(document, goal.goalId, ref, readings)
                            }
                          />
                        }
                        result={
                          <AcceptanceGoalResult
                            decisionSource="验收界面人工确认"
                            document={document}
                            plan={plan.document}
                            goal={goal}
                            disabled={readOnly}
                            onChange={(value) => editGoal(value, goal.goalId)}
                            onFollowUp={(text) => void prepare(text)}
                          />
                        }
                      />
                    ))}
                  </section>
                  <AcceptanceTasks
                    ref={tasks}
                    plan={plan.document}
                    port={context.taskPort}
                    snapshot={document.taskSnapshot}
                    disabled={readOnly}
                    getScrollTop={() => scroll.current?.scrollTop ?? 0}
                    origin={{
                      ...scope,
                      page: 'acceptance',
                      version: document.version,
                      cycleId: document.cycleId,
                      worktreeId,
                      sessionId: session?.sessionId,
                      scrollTop: scroll.current?.scrollTop ?? 0,
                      draftKey: recoveryKey
                    }}
                    onSnapshot={(reads) => saveTaskSnapshot(document, reads)}
                  />
                </>
              )}
            </>
          ) : (
            <p className="va-muted va-empty-hint">
              {version
                ? '选择已合入的计划修订开始本次验收，或从上方“新建验收”与 Agent 一起确认版本与候选。'
                : '尚未选择版本。从上方“新建验收”与 Agent 一起确认要核对的版本。'}
            </p>
          )}
        </div>
      </div>
      <AcceptanceArchive
        status={archive}
        dirty={draft?.dirty ?? false}
        hasDocument={Boolean(document)}
        hasRevision={Boolean(draft?.expectedRevision)}
        material={archiveMaterial}
        readOnly={readOnly}
        busy={busy}
        onRefreshStatus={() => void archiveStatus()}
        onReload={() => void controller.refresh().catch((reason) => setError(String(reason)))}
        onSave={() => void controller.save()}
      />
      {reportOpen && (
        <AcceptanceReportDialog
          report={report}
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
