import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ClipboardCheck, GitBranch } from 'lucide-react'
import type { MetricsPort } from '../../../../shared/workbench/metrics'
import type { PackagePipelinePort } from '../../../../shared/workbench/package-pipeline'
import type { VersionHistoryPort } from '../../../../shared/workbench/version-history'
import type { VersionCycleContext } from '../version-cycle/cycle-context'
import type { CycleEntry } from '../version-cycle/cycle-workspace-context'
import type { CycleTaskRead, CycleTaskSnapshot } from '../version-cycle/ports'
import { cycleBranch } from '../version-cycle/native-cycle-workspace'
import { trunkUpdateNotice } from '../version-cycle/trunk-update-port'
import { AutomationConfigureButton } from '../version-cycle/AutomationConfigureButton'
import { CycleStartCard } from '../version-cycle/CycleStartCard'
import { AcceptanceGoalCards } from './AcceptanceGoalCards'
import { AcceptancePackage } from './AcceptancePackage'
import { AcceptanceSources } from './AcceptanceSources'
import { AcceptanceNotices } from './AcceptanceNotices'
import { CycleArchive } from '../version-cycle/CycleArchive'
import { AcceptanceJourney } from './AcceptanceJourney'
import { AcceptanceReportDialog } from './AcceptanceReportDialog'
import { useArchivePrStatus } from '../version-cycle/use-archive-pr-status'
import { useAcceptanceBoard } from './use-acceptance-board'
import { useAcceptanceHistory } from './use-acceptance-history'
import { useAcceptanceReport } from './use-acceptance-output'
import { AcceptanceRoundPicker } from './AcceptanceRoundPicker'
import { HistoricalRoundCards } from './HistoricalRoundCards'
import './acceptance.css'

export type AcceptanceBoardProps = {
  context: VersionCycleContext
  history: VersionHistoryPort
  metrics: MetricsPort
  packages: PackagePipelinePort
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
  packages,
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
    saveTaskSnapshot,
    scroll,
    document: currentDocument,
    plan: currentPlan,
    readOnly: currentReadOnly,
    loadVersion,
    editGoal,
    editReadings,
    refreshData,
    saving,
    retrySave,
    useRemoteDeletion,
    initializationSuppressed
  } = useAcceptanceBoard({ context, history, recoveryKey })
  const rounds = useAcceptanceHistory({
    history,
    scope: metricScope,
    document: currentDocument,
    plan: currentPlan,
    selectedVersion: context.version,
    runtimeOwnerEnvironmentId: scope.runtimeOwnerEnvironmentId,
    refreshToken: context.materialRefresh
  })
  const { document, plan } = rounds
  const readOnly = currentReadOnly || rounds.historical || rounds.locked
  const currentView = useRef(!rounds.historical)
  currentView.current = !rounds.historical && !rounds.locked
  const { report, buildReport } = useAcceptanceReport(document, plan?.document, setError)
  const prStatus = useArchivePrStatus(context, document?.workflow?.archivePr)
  const [reportOpen, setReportOpen] = useState(false)
  const startCard = useRef<HTMLElement>(null)
  const results = useRef<HTMLElement>(null)
  const archiveSection = useRef<HTMLElement>(null)
  const packageSection = useRef<HTMLElement>(null)
  const [packageReady, setPackageReady] = useState(false)
  // Stable identity keeps AcceptancePackage's load effects from re-firing.
  const handlePackageLatest = useCallback(
    (latest: { version: string } | null) => setPackageReady(latest !== null),
    []
  )
  const handleSnapshot = useCallback(
    (reads: CycleTaskRead[]) => {
      if (document && currentView.current) {
        saveTaskSnapshot(document, reads)
      }
    },
    [document, saveTaskSnapshot]
  )
  const branch = cycleBranch(entry)
  const openTask = (task: CycleTaskSnapshot) =>
    context.taskPort.openDetail(task, {
      ...scope,
      page: 'acceptance',
      version: document?.version ?? context.version ?? '',
      cycleId: document?.cycleId ?? '',
      worktreeId,
      sessionId: session?.sessionId,
      scrollTop: scroll.current?.scrollTop ?? 0,
      draftKey: recoveryKey,
      goalId: task.reference.goalId
    })
  useEffect(() => {
    if (!report) {
      setReportOpen(false)
    }
  }, [report])
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
        {context.boundVersion ? (
          /* G2（#383）：绑定验收树版本由绑定决定，屏内不再选版（v10 方向一致）；
             旧无绑定固定树保留下拉。 */
          <span className="va-version-bound" title="版本由流程树绑定决定，屏内不切换">
            {context.boundVersion}
          </span>
        ) : (
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
        )}
        <button
          className="wb-btn wb-btn-ghost wb-btn-sm"
          disabled={busy || saving || Boolean(context.syncing)}
          onClick={() => {
            void (async () => {
              toast.message(trunkUpdateNotice(await context.updateCode()))
              await refreshData()
              rounds.refresh()
              await prStatus.refresh()
            })()
          }}
        >
          更新代码
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
          stage={document?.workflow?.stage}
          startRef={startCard}
          packageRef={packageSection}
          packageReady={
            rounds.historical || rounds.locked
              ? Boolean(document?.preparedArtifacts.some((item) => item.kind === 'package'))
              : packageReady
          }
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
          {!rounds.historical && (
            <CycleStartCard
              entry={entry}
              problems={materialProblems}
              version={context.version}
              sectionRef={startCard}
            />
          )}
          {!rounds.historical && entry.notice && (
            <p className="va-notice" role="status">
              {entry.notice}
            </p>
          )}
          {rounds.historical ? (
            rounds.error && (
              <p className="va-error" role="alert">
                {rounds.error}
              </p>
            )
          ) : (
            <AcceptanceNotices
              error={rounds.error ?? error}
              recoveryError={recoveryError}
              recoveryText={recoveryText}
              draft={draft}
              controller={controller}
              busy={busy}
              setError={setError}
              onRetrySave={() => void retrySave()}
              onRemoteDeleted={useRemoteDeletion}
            />
          )}
          {(currentDocument || rounds.historical) && (
            <AcceptanceRoundPicker
              value={rounds.key}
              currentWeek={rounds.currentWeek}
              choices={rounds.choices}
              onChange={rounds.select}
            />
          )}
          {rounds.notice && (
            <p className="va-notice" role="status">
              {rounds.notice}
            </p>
          )}
          {rounds.catalogError && (
            <p className="va-muted" role="status">
              历史目录读取不完整：{rounds.catalogError}
            </p>
          )}
          {document ? (
            <>
              <AcceptanceSources document={document} />
              {!rounds.historical && !rounds.locked && (
                <AcceptancePackage
                  port={packages}
                  scope={metricScope}
                  sectionRef={packageSection}
                  onLatestChange={handlePackageLatest}
                />
              )}
              {plan && (
                <>
                  <div className="va-section-heading">
                    <h2>本版目标验收</h2>
                  </div>
                  <AcceptanceGoalCards
                    key={rounds.key}
                    plan={plan.document}
                    document={document}
                    metrics={metrics}
                    metricScope={metricScope}
                    readOnly={readOnly}
                    sectionRef={results}
                    scope={scope}
                    taskPort={context.taskPort}
                    onSnapshot={handleSnapshot}
                    onOpenTask={openTask}
                    onReadings={(goalId, ref, readings) =>
                      currentView.current && editReadings(document, goalId, ref, readings)
                    }
                    onGoalChange={(value, goalId) => {
                      if (currentView.current) {
                        editGoal(value, goalId)
                      }
                    }}
                    onReport={openReport}
                  />
                </>
              )}
            </>
          ) : rounds.historical ? (
            rounds.legacyRound && currentDocument ? (
              <HistoricalRoundCards document={currentDocument} roundId={rounds.legacyRound.id} />
            ) : (
              <p role="status">
                {rounds.loading
                  ? '正在读取该周材料…'
                  : '该周材料暂不可读；当前材料未替代历史内容。'}
              </p>
            )
          ) : (
            <>
              <AcceptancePackage
                port={packages}
                scope={metricScope}
                sectionRef={packageSection}
                onLatestChange={handlePackageLatest}
              />
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
        archivePr={document?.workflow?.archivePr}
        reachedArchive={document?.workflow?.stage === 'archive'}
        status={prStatus.status}
        loading={prStatus.loading}
        sectionRef={archiveSection}
      />
      {reportOpen && report && (
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
