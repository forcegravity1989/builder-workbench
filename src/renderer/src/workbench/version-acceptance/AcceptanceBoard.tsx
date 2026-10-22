import { MessageSquarePlus } from 'lucide-react'
import { useCallback, useEffect, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { toast } from 'sonner'
import type { PackagePipelinePort } from '../../../../shared/workbench/package-pipeline'
import type { VersionHistoryPort } from '../../../../shared/workbench/version-history'
import type { VersionCycleContext } from '../version-cycle/cycle-context'
import type { CycleEntry } from '../version-cycle/cycle-workspace-context'
import type { CycleTaskRead, CycleTaskSnapshot } from '../version-cycle/ports'
import { cycleScopeKey } from '../version-cycle/native-cycle-workspace'
import { openArchivePrPage } from '../version-cycle/open-archive-pr'
import { trunkUpdateNotice } from '../version-cycle/trunk-update-port'
import { useArchivePrStatus } from '../version-cycle/use-archive-pr-status'
import { togglePlanChat } from '../plan-column-resize'
import { usePlanChatCollapsed } from '../use-plan-chat-collapsed'
import { BoardIconButton } from '../board-ui'
import { AnnotationPanel } from '../annotations/AnnotationPanel'
import { AnnotationPopover } from '../annotations/AnnotationPopover'
import { formatBoardAnnotationsAsMarkdown } from '../annotations/annotation-markdown'
import { annotationRefFromElement } from '../annotations/types'
import { useBoardAnnotations } from '../annotations/use-board-annotations'
import { AcceptanceNotices } from './AcceptanceNotices'
import { AcceptanceArchiveCard } from './AcceptanceArchiveCard'
import { AcceptanceEmptyBoard } from './AcceptanceEmptyBoard'
import { AcceptanceGoalRows } from './AcceptanceGoalRows'
import { AcceptanceHeader, AcceptanceJourneyNav } from './AcceptanceSections'
import { AcceptanceLegacyRecords } from './AcceptanceLegacyRecords'
import { AcceptanceMinutesSection } from './AcceptanceMinutesSection'
import { AcceptancePrepareSection } from './AcceptancePrepareSection'
import { latestVerificationArtifact } from './acceptance-model'
import { openAcceptanceMaterial } from './open-acceptance-material'
import { useAcceptanceActionSend } from './use-acceptance-action-send'
import { useAcceptanceBoard } from './use-acceptance-board'
import { useAcceptanceJourneySpy } from './use-acceptance-journey-spy'
import './acceptance.css'

export type AcceptanceBoardProps = {
  context: VersionCycleContext
  history: VersionHistoryPort
  packages: PackagePipelinePort
  entry: CycleEntry
}

export function AcceptanceBoard(props: AcceptanceBoardProps) {
  const { context } = props
  if (!context.scope || !context.worktreeId || !context.materialPort) {
    return (
      <div className="acc-empty-screen">
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
  packages,
  entry,
  recoveryKey
}: AcceptanceBoardProps & { recoveryKey: string }) {
  const board = useAcceptanceBoard({ context, history, recoveryKey })
  // Non-null: the outer component already refused to render without a workspace.
  const { scope, worktreeId } = board
  const { document, plan, gate } = board
  const annotations = useBoardAnnotations()
  const sendAction = useAcceptanceActionSend(worktreeId)
  const chatCollapsed = usePlanChatCollapsed()
  const spy = useAcceptanceJourneySpy()
  const prStatus = useArchivePrStatus(context, document?.workflow?.archivePr)
  const [openingPr, setOpeningPr] = useState(false)
  const [notice, setNotice] = useState('')
  const { clearAll, pruneMissing } = annotations

  const scopeKey = scope ? cycleScopeKey(scope) : ''
  // Stable board identity for annotation lifetime: context.version is the native
  // selection and does not flicker through re-select transients (draft null).
  const boardIdentity = JSON.stringify([scopeKey, context.version])
  useEffect(() => {
    // Memory annotations point at the previous board's objects after a switch.
    clearAll()
  }, [boardIdentity, clearAll])

  const goalsKey = JSON.stringify(plan?.document.goals.map((goal) => goal.goalId) ?? [])
  const tasksKey = JSON.stringify(
    plan?.document.tasks.map((task) => [task.goalId, task.number]) ?? []
  )
  useEffect(() => {
    if (!plan) {
      return
    }
    const goalIds = new Set(plan.document.goals.map((goal) => goal.goalId))
    const issueKeys = new Set(
      plan.document.tasks.filter((task) => task.goalId).map((task) => `${task.goalId}:${task.number}`)
    )
    pruneMissing(
      (goalId) => goalIds.has(goalId),
      (goalId, number) => issueKeys.has(`${goalId}:${number}`)
    )
  }, [goalsKey, tasksKey, plan, pruneMissing])

  const act = async (operation: () => Promise<unknown>) => {
    setNotice('')
    try {
      await operation()
    } catch (reason) {
      board.setError(reason instanceof Error ? reason.message : String(reason))
    }
  }
  const openMaterial = (location: string) =>
    void act(() => openAcceptanceMaterial(location, context))
  const openPr = () =>
    void act(async () => {
      const archivePr = document?.workflow?.archivePr
      if (!scope || !archivePr || openingPr) {
        return
      }
      setOpeningPr(true)
      try {
        await openArchivePrPage(scope, archivePr)
      } finally {
        setOpeningPr(false)
      }
    })
  const onSessionToggle = () => {
    // Re-anchor the active section: toggling the chat column reflows the board.
    spy.reanchor(spy.activeSection)
    togglePlanChat()
  }
  const onContentScroll = () => {
    const pane = board.scroll.current
    if (pane) {
      try {
        sessionStorage.setItem(`${recoveryKey}:scroll`, String(pane.scrollTop))
      } catch {
        /* Scroll recovery is optional. */
      }
    }
    spy.onPaneScroll(pane)
  }
  const onContentClickCapture = (event: ReactMouseEvent) => {
    if (!annotations.annotating) {
      return
    }
    const target = event.target as Element | null
    // The minutes section takes no annotations and stays fully interactive —
    // human confirmation is an iron-rule action that must work mid-meeting.
    if (target?.closest('#minutes')) {
      annotations.closePopover()
      return
    }
    if (target?.closest('.g3-annot-marker, .acc-annot-badge')) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    const element = target?.closest('[data-annotate-kind]')
    const ref = element ? annotationRefFromElement(element) : null
    if (element && ref) {
      annotations.openPopover(ref, element.getBoundingClientRect())
    } else {
      annotations.closePopover()
    }
  }
  const handleSnapshot = useCallback(
    (reads: CycleTaskRead[]) => {
      if (document) {
        try {
          board.saveTaskSnapshot(document, reads)
        } catch (reason) {
          board.setError(reason instanceof Error ? reason.message : String(reason))
        }
      }
    },
    // saveTaskSnapshot re-reads the live controller value; the document identity
    // is what makes a stale snapshot refuse to overwrite newer material.
    [document, board.saveTaskSnapshot, board.setError]
  )
  const openTask = (task: CycleTaskSnapshot) =>
    context.taskPort.openDetail(task, {
      ...scope,
      page: 'acceptance',
      version: document?.version ?? context.version ?? '',
      cycleId: document?.cycleId ?? '',
      worktreeId,
      sessionId: context.session?.sessionId,
      scrollTop: board.scroll.current?.scrollTop ?? 0,
      draftKey: recoveryKey,
      goalId: task.reference.goalId
    })
  const report = document ? latestVerificationArtifact(document) : undefined
  // Only acceptance-side problems make a version unreadable *here*. The catalog
  // also carries plan-side problems, and blaming those on the acceptance dropdown
  // is what made a perfectly readable version look broken.
  const unreadable = board.materialProblems
    .filter((item) => item.workflow === 'acceptance')
    .map((item) => item.version)
  const state = !document
    ? ''
    : board.draft?.error
      ? '保存待处理'
      : board.busy
        ? '读取中…'
        : board.draft?.dirty
          ? board.saving
            ? '正在保存…'
            : '正在保存修改…'
          : '已保存'
  const popover = annotations.popover

  if (!document) {
    return (
      <AcceptanceEmptyBoard
        board={board}
        gate={gate}
        context={context}
        entry={entry}
        unreadable={unreadable}
        state={state}
        chatCollapsed={chatCollapsed}
        onSessionToggle={onSessionToggle}
        onRefresh={() =>
          void act(async () => {
            toast.message(trunkUpdateNotice(await context.updateCode()))
            await board.refreshData()
            await prStatus.refresh()
          })
        }
      />
    )
  }


  return (
    <main className={`acc-board${annotations.annotating ? ' annotating' : ''}`} lang="zh">
      <AcceptanceHeader
        currentVersion={document.version}
        versions={[...new Set([...board.versions, document.version])]}
        unreadable={unreadable}
        disabled={!context.materialPort || Boolean(context.syncing) || board.busy}
        state={state}
        sessionCollapsed={chatCollapsed}
        onSessionToggle={onSessionToggle}
        onSelect={(version) => void board.loadVersion(version)}
        onConfigure={() => void entry.configure()}
        onRefresh={() =>
          void act(async () => {
            toast.message(trunkUpdateNotice(await context.updateCode()))
            await board.refreshData()
            await prStatus.refresh()
          })
        }
        extraActions={
          <BoardIconButton
            label="批注模式：点击板面元素记录评审意见"
            aria-pressed={annotations.annotating}
            className={annotations.annotating ? 'g3-mode-on' : ''}
            onClick={annotations.toggleMode}
          >
            <MessageSquarePlus size={16} aria-hidden="true" />
          </BoardIconButton>
        }
      />
      {notice && (
        <p className="acc-notice" role="status">
          {notice}
        </p>
      )}
      <AcceptanceNotices
        error={board.error}
        recoveryError={board.recoveryError}
        recoveryText={board.recoveryText}
        draft={board.draft}
        controller={board.controller}
        busy={board.busy}
        setError={board.setError}
        onRetrySave={() => void board.retrySave()}
        onRemoteDeleted={board.useRemoteDeletion}
      />
      <div className="acc-body">
        <AcceptanceJourneyNav active={spy.activeSection} onNavigate={spy.navigate} />
        {annotations.annotating && (
          <div className="acc-annotate-banner" role="status">
            批注模式：点击目标或 Issue 行，在对象旁的小窗记录意见 · Esc 先关小窗，再按一次退出
          </div>
        )}
        <div
          className="acc-content"
          ref={board.scroll}
          onScroll={onContentScroll}
          onClickCapture={onContentClickCapture}
          onFocusCapture={spy.clearNavigation}
          onWheel={spy.clearNavigation}
          onPointerDown={spy.clearNavigation}
          onTouchStart={spy.clearNavigation}
          onKeyDown={spy.onKeyDown}
        >
          <AcceptancePrepareSection
            document={document}
            packages={packages}
            scope={board.metricScope}
            disabled={board.readOnly}
            onSendAction={sendAction}
            onOpenMaterial={openMaterial}
            sectionRef={spy.sectionRefs.prepare}
          />
          {plan && (
            <AcceptanceGoalRows
              plan={plan.document}
              document={document}
              disabled={board.readOnly}
              scope={board.scope}
              taskPort={context.taskPort}
              onGoalChange={board.editGoal}
              onTask={openTask}
              onSnapshot={handleSnapshot}
              numbersFor={annotations.numbersFor}
              onOpenAnnotationPanel={annotations.openPanel}
              hasReport={Boolean(report)}
              onOpenReport={() => {
                if (report) {
                  openMaterial(report.location)
                }
              }}
              sectionRef={spy.sectionRefs.showcase}
            />
          )}
          <AcceptanceMinutesSection
            document={document}
            disabled={board.readOnly}
            edit={board.editDocument}
            onSendAction={sendAction}
            sectionRef={spy.sectionRefs.minutes}
          />
          <AcceptanceArchiveCard
            archivePr={document.workflow?.archivePr}
            reachedArchive={document.workflow?.stage === 'archive'}
            status={prStatus.status}
            loading={prStatus.loading}
            opening={openingPr}
            onOpenPr={openPr}
            onSendAction={sendAction}
            version={document.version}
            sectionRef={spy.sectionRefs.archive}
          />
          <AcceptanceLegacyRecords
            document={document}
            goalLabel={(goalId) => {
              const goals = plan?.document.goals ?? []
              const index = goals.findIndex((goal) => goal.goalId === goalId)
              const title = index !== -1 ? goals[index].title : ''
              return `${index !== -1 ? `G${index + 1} · ` : ''}${title || goalId}`
            }}
            onOpenMaterial={openMaterial}
          />
        </div>
        {annotations.panelOpen && (
          <AnnotationPanel
            annotations={annotations.numbered}
            annotating={annotations.annotating}
            worktreeId={worktreeId}
            assistant="验收助手"
            onClose={annotations.closePanel}
            onUpdate={annotations.update}
            onRemove={annotations.remove}
            onBoardLevel={(rect) =>
              annotations.openPopover({ kind: 'board', label: '板面级' }, rect)
            }
            // navigator.clipboard 在真壳里静默失效,改走 Orca IPC 剪贴板(同计划屏);
            // 「已复制」瞬态由面板自己给,失败经 onCopyError 如实上屏。
            onCopy={() =>
              window.api.ui.writeClipboardText(
                formatBoardAnnotationsAsMarkdown(annotations.annotations)
              )
            }
            onCopyError={(message) => board.setError(`复制板面批注失败：${message}`)}
            onSent={() => setNotice('板面批注已发送给验收助手 · 在会话栏查看进展')}
          />
        )}
      </div>
      {popover && (
        <AnnotationPopover
          key={popover.id}
          target={popover}
          onSave={(text) => {
            annotations.add(popover.ref, text)
            annotations.closePopover()
          }}
          onCancel={annotations.closePopover}
        />
      )}
    </main>
  )
}

