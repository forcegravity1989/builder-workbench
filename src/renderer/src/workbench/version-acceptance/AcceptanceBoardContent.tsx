import { MessageSquarePlus } from 'lucide-react'
import { useCallback, useEffect, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { toast } from 'sonner'
import type { CycleTaskRead, CycleTaskSnapshot } from '../version-cycle/ports'
import { cycleScopeKey } from '../version-cycle/native-cycle-workspace'
import { openArchivePrPage } from '../version-cycle/open-archive-pr'
import { trunkUpdateNotice } from '../version-cycle/trunk-update-port'
import { useArchivePrStatus } from '../version-cycle/use-archive-pr-status'
import { useReleaseStatus } from '../version-cycle/use-release-status'
import { togglePlanChat } from '../plan-column-resize'
import { usePlanChatCollapsed } from '../use-plan-chat-collapsed'
import { BoardActionButton } from '../board-ui'
import { cycleStartedViewKey, hasCycleStarted, markCycleStarted } from '../cycle-view-state'
import { AnnotationPanel } from '../annotations/AnnotationPanel'
import { AnnotationPopover } from '../annotations/AnnotationPopover'
import { formatBoardAnnotationsAsMarkdown } from '../annotations/annotation-markdown'
import { annotationRefFromElement } from '../annotations/types'
import { useBoardAnnotations } from '../annotations/use-board-annotations'
import { useAnnotationModeShortcut } from '../annotations/use-annotation-mode-shortcut'
import { useOptionalShortcutLabel } from '@/hooks/useShortcutLabel'
import { AcceptanceNotices } from './AcceptanceNotices'
import { AcceptanceArchiveCard } from './AcceptanceArchiveCard'
import { AcceptanceEmptyBoard } from './AcceptanceEmptyBoard'
import { AcceptanceGoalRows } from './AcceptanceGoalRows'
import { AcceptanceHeader, AcceptanceJourneyNav } from './AcceptanceSections'
import { AcceptanceLegacyRecords } from './AcceptanceLegacyRecords'
import { AcceptanceMinutesSection } from './AcceptanceMinutesSection'
import { AcceptancePrepareSection } from './AcceptancePrepareSection'
import { openAcceptanceMaterial } from './open-acceptance-material'
import { usePlanSendAction } from '../plan-send-menu'
import { useAcceptanceBoard } from './use-acceptance-board'
import { useAcceptanceJourneySpy } from './use-acceptance-journey-spy'
import './acceptance.css'

import type { AcceptanceBoardProps } from './AcceptanceBoard'

export function AcceptanceBoardContent({
  context,
  history,
  packages,
  entry,
  recoveryKey
}: AcceptanceBoardProps & { recoveryKey: string }) {
  const startedKey = cycleStartedViewKey({
    ...context,
    version: context.version ?? context.boundVersion
  })
  const [started, setStarted] = useState(() => hasCycleStarted(startedKey))
  const board = useAcceptanceBoard({ context, history, recoveryKey, started })
  // Non-null: the outer component already refused to render without a workspace.
  const { scope, worktreeId } = board
  const { document, plan } = board
  const scopeKey = scope ? cycleScopeKey(scope) : ''
  // Stable board identity for annotation lifetime: context.version is the native
  // selection and does not flicker through re-select transients (draft null).
  // The annotation store is keyed by it — a version switch reads a different,
  // naturally empty session, and the plan board's unsent notes survive a glance
  // at this screen (a single global session + identity clearAll wiped them).
  const boardIdentity = JSON.stringify([
    scopeKey,
    worktreeId,
    context.worktreeInstanceId,
    context.version
  ])
  const annotations = useBoardAnnotations(boardIdentity)
  const annotateShortcut = useOptionalShortcutLabel('workbench.toggleAnnotationMode')
  // Why: same gate as the header entry button below — the chord must not exist
  // on surfaces where the button does not render (empty board, no fixed plan).
  useAnnotationModeShortcut(Boolean(plan && document), annotations.toggleMode)
  const [notice, setNotice] = useState('')
  // 注入动作走共用发送弹窗(与计划屏同一件);assistant 只改用户可见文案里的 AI 角色名。
  // 取代原 use-acceptance-action-send:那个钩子只开侧边栏 target mode、从不渲染选择器,
  // 点击处什么都不弹——该 worktree 无可发会话时连高亮都不触发,是纯静默 no-op。
  const sendAction = usePlanSendAction(worktreeId, setNotice, '验收助手')
  const chatCollapsed = usePlanChatCollapsed()
  const spy = useAcceptanceJourneySpy()
  const prStatus = useArchivePrStatus(context, document?.workflow?.archivePr)
  const releaseStatus = useReleaseStatus(context, document?.workflow?.release)
  const [openingPr, setOpeningPr] = useState(false)
  const { pruneMissing } = annotations

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
      plan.document.tasks
        .filter((task) => task.goalId)
        .map((task) => `${task.goalId}:${task.number}`)
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
  // Release 页无原生任务页对应物,与验收材料 HTTP 链接同走内置浏览器链路(#462)。
  const openRelease = (url: string) => void act(() => openAcceptanceMaterial(url, context))
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
  const { saveTaskSnapshot, setError } = board
  const handleSnapshot = useCallback(
    (reads: CycleTaskRead[]) => {
      if (document) {
        try {
          saveTaskSnapshot(document, reads)
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : String(reason))
        }
      }
    },
    // saveTaskSnapshot re-reads the live controller value; the document identity
    // is what makes a stale snapshot refuse to overwrite newer material.
    [document, saveTaskSnapshot, setError]
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

  if (!document && !started) {
    return (
      <AcceptanceEmptyBoard
        board={board}
        context={context}
        entry={entry}
        unreadable={unreadable}
        state={state}
        chatCollapsed={chatCollapsed}
        onStarted={() => {
          markCycleStarted(startedKey)
          setStarted(true)
        }}
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
        currentVersion={board.version}
        versions={[...new Set([...board.versions, ...(board.version ? [board.version] : [])])]}
        unreadable={unreadable}
        boundVersion={context.boundVersion}
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
        annotateEntry={
          // 批注对象只在 Showcase 区（目标行/验收标准/Issue 行），无计划即无对象，
          // 与空板态同口径不渲染入口。
          plan && document ? (
            <BoardActionButton
              className={`acc-annotate-entry${annotations.annotating ? ' acc-mode-on' : ''}`}
              aria-pressed={annotations.annotating}
              title={
                annotations.annotating
                  ? `退出批注模式${annotateShortcut ? `（${annotateShortcut}）` : ''}`
                  : `批注模式：点击目标行、验收标准或 Issue 行记录验收意见${annotateShortcut ? `（${annotateShortcut} 进入）` : ''}`
              }
              onClick={annotations.toggleMode}
            >
              <MessageSquarePlus size={13} aria-hidden="true" /> 批注模式
              {annotations.annotations.length > 0 && (
                <span className="acc-annotate-count">{annotations.annotations.length}</span>
              )}
            </BoardActionButton>
          ) : undefined
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
            批注模式：点击目标、验收标准或 Issue 行，在对象旁的小窗记录意见
            {annotateShortcut ? ` · ${annotateShortcut} 退出` : ''}
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
          {plan && document ? (
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
              sectionRef={spy.sectionRefs.showcase}
            />
          ) : (
            <section id="showcase" ref={spy.sectionRefs.showcase} aria-label="Showcase">
              <div className="acc-section-title">
                <h2>
                  Showcase <small>暂无目标</small>
                </h2>
              </div>
              <p className="acc-muted">尚无可读的固定计划，目标暂为空。</p>
            </section>
          )}
          <AcceptanceMinutesSection
            document={document}
            disabled={board.readOnly}
            edit={board.editDocument}
            onSendAction={sendAction}
            sectionRef={spy.sectionRefs.minutes}
          />
          <AcceptanceArchiveCard
            archivePr={document?.workflow?.archivePr}
            reachedArchive={document?.workflow?.stage === 'archive'}
            status={prStatus.status}
            loading={prStatus.loading}
            opening={openingPr}
            onOpenPr={openPr}
            onSendAction={sendAction}
            release={document?.workflow?.release}
            releaseStatus={releaseStatus.status}
            releaseLoading={releaseStatus.loading}
            onOpenRelease={openRelease}
            version={board.version}
            sectionRef={spy.sectionRefs.archive}
          />
          {document && (
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
          )}
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
            onSent={() => {
              // onPromptDelivered only fires on a delivered send, so clearing here
              // never drops notes on failure/Esc (same option-A decision as the
              // plan screen). The receipt states the cleared count, or the empty
              // panel reads as lost input.
              const count = annotations.annotations.length
              annotations.clearAll()
              setNotice(
                `板面批注已发送给验收助手 · 在会话栏查看进展。已递交的 ${count} 条批注已从板面清空，可继续批注。`
              )
            }}
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
