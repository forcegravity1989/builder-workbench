import type { MetricsPort } from '../../../../shared/workbench/metrics'
import type { VersionHistoryPort } from '../../../../shared/workbench/version-history'
import type { VersionCycleContext } from '../version-cycle/cycle-context'
import { VersionGoalCard } from '../version-cycle/VersionGoalCard'
import { AcceptanceGoalResult } from './AcceptanceGoalResult'
import { AcceptancePreparation } from './AcceptancePreparation'
import { AcceptanceMetrics } from './AcceptanceMetrics'
import { useAcceptanceMetricWindow } from './AcceptanceMetricWindow'
import { AcceptanceContext } from './AcceptanceContext'
import { AcceptanceTasks } from './AcceptanceTasks'
import { AcceptanceArchive } from './AcceptanceArchive'
import { AcceptanceSourcePicker } from './AcceptanceSourcePicker'
import { AcceptanceJourney } from './AcceptanceJourney'
import { prepareAcceptanceRequest } from './acceptance-model'
import type { AcceptanceCandidatePort } from './acceptance-candidate-port'
import { useAcceptanceBoard } from './use-acceptance-board'
import './acceptance.css'

export type AcceptanceBoardProps = {
  context: VersionCycleContext
  history: VersionHistoryPort
  metrics: MetricsPort
  candidate: AcceptanceCandidatePort
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
    preparationReviewed,
    reviewPreparation,
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
  const hasMetrics = plan?.document.goals.some((goal) => goal.metricTargets.length > 0) ?? false
  const metricWindow = useAcceptanceMetricWindow(metrics, metricScope, hasMetrics)
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
        {plan && (
          <span>
            {plan.document.goals.length} 项目标 ·{' '}
            {plan.document.tasks.length
              ? document?.taskSnapshot
                ? `Issue 快照 ${document.taskSnapshot.filter((item) => item.kind === 'ready').length}/${plan.document.tasks.length}`
                : 'Issue 待读取'
              : '未关联 Issue'}
          </span>
        )}
        <button
          className="wb-btn wb-btn-ghost wb-btn-sm"
          disabled={!document || !plan}
          onClick={() => void buildReport()}
        >
          验收报告
        </button>
      </header>
      <div className="va-content">
        <AcceptanceJourney {...journey} />
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
          {(error || recoveryError || draft?.error) && (
            <p role="alert" className="va-error">
              {error ?? recoveryError ?? draft?.error}
            </p>
          )}
          {recoveryText && (
            <details className="va-conflict">
              <summary>保留的本机恢复原文</summary>
              <button
                className="wb-btn wb-btn-sm"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(recoveryText)
                    .catch((reason) => setError(String(reason)))
                }
              >
                复制恢复原文
              </button>
              <pre>{recoveryText}</pre>
            </details>
          )}
          {historyProblems.length > 0 && (
            <details className="va-source va-warning">
              <summary>{historyProblems.length} 条历史材料待核，可用计划仍可选择</summary>
              {historyProblems.map((item) => (
                <p key={`${item.sourceCommit}:${item.workflow}:${item.version}`}>
                  {item.version} · {item.workflow === 'plan' ? '计划' : '验收'} ·{' '}
                  {item.sourceCommit.slice(0, 12)} · {item.committedAt}：{item.message}
                </p>
              ))}
            </details>
          )}
          {draft?.remote && (
            <details className="va-conflict">
              <summary>远端材料已变化，本地输入已保留</summary>
              <pre>{JSON.stringify(draft.remote.document, null, 2)}</pre>
              <button
                className="wb-btn wb-btn-sm"
                onClick={() => {
                  if (draft.remote) {
                    navigator.clipboard
                      .writeText(JSON.stringify(draft.document, null, 2))
                      .then(() => {
                        if (controller.value !== draft) {
                          throw new Error(
                            '复制期间草稿已变化，保留当前输入；请重新复制后采用远端。'
                          )
                        }
                        controller.useRemote(draft.remote!)
                      })
                      .catch((reason) => setError(String(reason)))
                  }
                }}
              >
                复制本地草稿并采用远端
              </button>
            </details>
          )}
          {archived && draft?.dirty && (
            <p role="alert" className="va-error">
              本轮验收已归档，未保存的本地修改不能写入。
              <button
                className="wb-btn wb-btn-sm"
                disabled={busy}
                onClick={() => void discardLocal()}
              >
                放弃本地修改，重读已归档材料
              </button>
            </p>
          )}
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
          {!document && (
            <button
              className="wb-btn wb-btn-primary"
              onClick={() => void prepare(prepareAcceptanceRequest())}
            >
              在会话中准备交付
            </button>
          )}
          {document && (
            <>
              <AcceptancePreparation
                reviewed={preparationReviewed}
                onReview={reviewPreparation}
                readOnly={readOnly}
                document={document}
                port={candidate}
                onPrepare={() => void prepare(prepareAcceptanceRequest(document))}
                onCandidateCheck={(check, artifacts) => onChecks(document, check, artifacts)}
              />
              <AcceptanceContext
                document={document}
                hasMetrics={hasMetrics}
                metricWindow={metricWindow}
                disabled={readOnly}
                onPrepare={(text) => void prepare(text)}
              />
              {plan && (
                <>
                  <section id="acceptance-results" aria-label="Showcase 与验收">
                    {plan.document.goals.map((goal, index) => (
                      <VersionGoalCard
                        key={goal.goalId}
                        goal={goal}
                        index={index}
                        readOnly
                        metrics={
                          goal.metricTargets.length ? (
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
                          ) : undefined
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
              {report && (
                <details open className="va-report">
                  <summary>验收报告</summary>
                  <button
                    className="wb-btn wb-btn-sm"
                    onClick={() =>
                      void navigator.clipboard
                        .writeText(report)
                        .catch((reason) => setError(String(reason)))
                    }
                  >
                    复制纪要
                  </button>
                  <pre>{report}</pre>
                </details>
              )}
            </>
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
        onPrepare={() => {
          if (!session) {
            setError('请先选择或开启左侧会话，再准备归档请求。')
          } else if (document && draft?.expectedRevision) {
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
              .catch((reason) => setError(String(reason)))
          }
        }}
      />
    </main>
  )
}
