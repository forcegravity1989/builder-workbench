import { ErrorDetails, notifyWorkbenchError } from '../error-feedback'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent
} from 'react'
import { CircleHelp } from 'lucide-react'
import type { PlanningMaterial } from '../../../../shared/workbench/version-material'
import type { CycleTaskSnapshot } from '../version-cycle/ports'
import type { VersionCycleContext } from '../version-cycle/cycle-context'
import type { CycleEntry } from '../version-cycle/cycle-workspace-context'
import { notifyTrunkUpdate } from '../version-cycle/trunk-update-port'
import { cycleBranch, cycleScopeKey } from '../version-cycle/native-cycle-workspace'
import { togglePlanChat } from '../plan-column-resize'
import { usePlanChatCollapsed } from '../use-plan-chat-collapsed'
import { BoardIconButton } from '../board-ui'
import { replayWorkbenchGuide, useWorkbenchScreenGuide } from '../WorkbenchScreenGuide'
import { PlanningAnnotationOverlays } from './PlanningAnnotationOverlays'
import { useBoardAnnotations } from '../annotations/use-board-annotations'
import { useAnnotationModeShortcut } from '../annotations/use-annotation-mode-shortcut'
import { useOptionalShortcutLabel } from '@/hooks/useShortcutLabel'
import { annotationRefFromElement } from '../annotations/types'
import { usePlanningMaterial, planningDraftKey } from './use-planning-material'
import { usePlanMetrics } from './use-plan-metrics'
import { usePlanVersionSelection } from './use-plan-version-selection'
import { PlanningGoals } from './PlanningGoals'
import { useVersionMembership } from '../version-cycle/use-version-membership'
import { PlanningStartCard } from './PlanningStartCard'
import { PlanningMinutesSection } from './PlanningMinutesSection'
import { PlanningPriorReview } from './PlanningPriorReview'
import { PlanningArchiveCard } from './PlanningArchiveCard'
import { openArchivePrPage } from '../version-cycle/open-archive-pr'
import { PlanningPersistenceNotice } from './PlanningPersistenceNotice'
import { PlanningAnnotationButton, PlanningHeader, PlanningJourneyNav } from './PlanningSections'
import { useJourneySpy } from './use-journey-spy'
import { usePlanningViewMemory } from './use-planning-view-memory'
import { usePlanningPriorReview } from './use-planning-prior-review'
import { usePlanningStart } from './use-planning-start'
import { usePlanSendAction } from '../plan-send-menu'
import { useArchivePrStatus } from '../version-cycle/use-archive-pr-status'
import './version-planning.css'

type PlanningBoardProps = {
  context: VersionCycleContext
  prepareMetrics(): Promise<void>
  entry: CycleEntry
}
export function PlanningBoard(props: PlanningBoardProps) {
  const { scope, worktreeId } = props.context
  const identity = JSON.stringify([
    scope && cycleScopeKey(scope),
    worktreeId,
    props.context.worktreeInstanceId
  ])
  return <PlanningBoardContent key={identity} {...props} />
}
function PlanningBoardContent({ context, prepareMetrics, entry }: PlanningBoardProps) {
  const { scope, session, worktreeId, materialPort, taskPort } = context
  const scopeKey = scope ? cycleScopeKey(scope) : ''
  const canSave = useCallback(() => !context.syncing, [context.syncing])
  const material = usePlanningMaterial(materialPort, scopeKey, { canSave })
  const plan = material.draft?.document
  const membership = useVersionMembership(scope, plan)
  const prStatus = useArchivePrStatus(context, plan?.workflow?.archivePr)
  const selection = usePlanVersionSelection(material, context.selectVersion)
  const selecting = selection.busy
  const [openingPr, setOpeningPr] = useState(false)
  const [view, setView] = useState({ key: '', notice: '' })
  const content = useRef<HTMLDivElement>(null)
  const spy = useJourneySpy()
  const sectionRefs = spy.sectionRefs
  // Stable board identity for annotation lifetime: context.version is the native
  // selection and does not flicker through re-select transients (draft null),
  // unlike selectionKey. The annotation store is keyed by it — a version/scope
  // switch reads a different, naturally empty session, and unsent notes survive
  // screen round-trips; no imperative clearAll effect (it wiped the sibling
  // board's notes when the store went module-level).
  const boardIdentity = JSON.stringify([
    scopeKey,
    worktreeId,
    context.worktreeInstanceId,
    context.version
  ])
  const annotations = useBoardAnnotations(boardIdentity)
  const chatCollapsed = usePlanChatCollapsed()
  const metricScope = useMemo(
    () => (scope && worktreeId ? { repoId: scope.repoId, hostId: scope.hostId, worktreeId } : null),
    [scope, worktreeId]
  )
  const metrics = usePlanMetrics(metricScope, scope?.runtimeOwnerEnvironmentId, plan)
  const selectionKey = JSON.stringify([scopeKey, plan?.version, plan?.cycleId])
  const { pruneMissing } = annotations
  useEffect(() => {
    if (!plan) {
      return
    }
    const goalIds = new Set(plan.goals.map((goal) => goal.goalId))
    const issueKeys = new Set(membership.references?.map((task) => `${task.goalId}:${task.number}`))
    pruneMissing(
      (goalId) => goalIds.has(goalId),
      (goalId, number) => !membership.references || issueKeys.has(`${goalId}:${number}`)
    )
  }, [plan, pruneMissing, membership.references])
  const notice = view.key === selectionKey ? view.notice : ''
  const updateView = useCallback(
    (patch: Partial<typeof view>) => {
      setView((current) => ({
        ...(current.key === selectionKey ? current : { notice: '' }),
        ...patch,
        key: selectionKey
      }))
    },
    [selectionKey]
  )
  const sendNotice = useCallback((message: string) => updateView({ notice: message }), [updateView])
  // Object-level actions wrap their trigger button in the native send menu
  // (instruction preview + session picker); see plan-send-menu.tsx.
  const wrapSend = usePlanSendAction(worktreeId, sendNotice)
  const viewMemory = usePlanningViewMemory(plan ? selectionKey : null, content)
  const currentSelection = useRef(selectionKey)
  currentSelection.current = selectionKey
  useEffect(
    () => () => {
      currentSelection.current = ''
    },
    []
  )
  const selectedVersion = context.version
  const selectedState = material.versions.find((item) => item.version === selectedVersion)?.state
  const { select: selectMaterial, clear: clearMaterial } = material
  useEffect(() => {
    if (selectedVersion) {
      void selectMaterial(selectedVersion)
    } else {
      clearMaterial()
    }
  }, [selectedVersion, selectedState, selectMaterial, clearMaterial, context.materialRefresh])
  const listMaterials = material.list
  useEffect(() => {
    if (context.materialRefresh) {
      void listMaterials()
    }
  }, [context.materialRefresh, listMaterials])

  const act = async (operation: () => Promise<unknown>) => {
    updateView({ notice: '' })
    try {
      await operation()
    } catch (reason) {
      if (currentSelection.current === selectionKey) {
        notifyWorkbenchError('无法完成计划操作', reason, '核对计划材料后重试。')
      }
    }
  }
  const disabled = !plan || Boolean(context.syncing) || selecting
  const { prior, progressSource, priorError, priorLive, openingSource, openAcceptance } =
    usePlanningPriorReview({
      context,
      material,
      disabled,
      selectionKey,
      currentSelection,
      onAct: act
    })
  const { startVersion, started, start } = usePlanningStart({
    context,
    entry,
    material
  })
  const guideReady =
    !selecting &&
    !material.busy &&
    (!context.version || plan?.version === context.version || Boolean(material.error)) &&
    !context.syncing &&
    !entry.busy &&
    (!started || Boolean(plan)) &&
    !annotations.annotating
  useWorkbenchScreenGuide('workbench-plan', guideReady)
  const annotateShortcut = useOptionalShortcutLabel('workbench.toggleAnnotationMode')
  // Why: same gate as the header entry button below — the chord must not exist
  // on surfaces where the button does not render.
  useAnnotationModeShortcut(started && Boolean(plan), annotations.toggleMode)
  const edit = (next: PlanningMaterial) => {
    if (!disabled) {
      material.edit(next)
    }
  }
  const openTask = async (task: CycleTaskSnapshot) => {
    if (!scope || !plan || !worktreeId) {
      return
    }
    await taskPort.openDetail(task, {
      ...scope,
      page: 'plan',
      worktreeId,
      version: plan.version,
      cycleId: plan.cycleId,
      sessionId: session?.sessionId,
      goalId: task.reference.goalId,
      scrollTop: content.current?.scrollTop ?? 0,
      draftKey: planningDraftKey(scopeKey, plan.version)
    })
  }
  const removeGoal = (goalId: string) => {
    if (!plan) {
      return
    }
    edit({
      ...plan,
      goals: plan.goals.filter((goal) => goal.goalId !== goalId)
    })
    annotations.removeForGoal(goalId)
  }
  const openPr = () =>
    void act(async () => {
      const archivePr = plan?.workflow?.archivePr
      if (!scope || !archivePr || openingPr) {
        return
      }
      setOpeningPr(true)
      try {
        await openArchivePrPage(context, archivePr)
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
    viewMemory.onScroll()
    spy.onPaneScroll(content.current)
  }
  const onContentClickCapture = (event: ReactMouseEvent) => {
    if (!annotations.annotating) {
      return
    }
    const target = event.target as Element | null
    // The minutes section takes no annotations and stays fully interactive —
    // human confirmation is an iron-rule action that must work mid-meeting.
    // Markers keep their own click (reopen the panel) instead of spawning a popover.
    if (target?.closest('#minutes')) {
      annotations.closePopover()
      return
    }
    if (target?.closest('.g3-annot-marker')) {
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
  const state = !plan
    ? ''
    : material.draft?.error
      ? '保存待处理'
      : material.busy
        ? '保存中…'
        : material.draft?.dirty
          ? '正在保存修改…'
          : '已保存'
  return (
    <div className={`vp-board${annotations.annotating ? ' annotating' : ''}`}>
      <PlanningHeader
        currentVersion={plan?.version ?? ''}
        boundVersion={context.boundVersion}
        versions={material.versions}
        disabled={!materialPort || selecting || Boolean(context.syncing)}
        state={state}
        branch={context.branch ?? cycleBranch(entry)}
        sessionCollapsed={chatCollapsed}
        onSessionToggle={onSessionToggle}
        onSelect={(version) => void selection.select(version)}
        onConfigure={() => void entry.configure()}
        onRefresh={() =>
          void act(async () => {
            notifyTrunkUpdate(await context.updateCode())
            await material.refresh()
            await prStatus.refresh()
          })
        }
        helpEntry={
          <BoardIconButton
            label="版本计划帮助"
            disabled={!guideReady}
            onClick={() => replayWorkbenchGuide('workbench-plan')}
          >
            <CircleHelp size={15} aria-hidden="true" />
          </BoardIconButton>
        }
        annotateEntry={
          // 计划未建时无目标可批注，不渲染入口（spec 会议纪要条款）。
          started && plan ? (
            <PlanningAnnotationButton
              active={annotations.annotating}
              count={annotations.annotations.length}
              shortcut={annotateShortcut}
              onToggle={annotations.toggleMode}
            />
          ) : undefined
        }
      />
      {(material.error ||
        notice ||
        selection.error ||
        context.error ||
        entry.notice ||
        priorError) && (
        <div className="vp-notice" role="status">
          {notice && <p>{notice}</p>}
          {entry.notice && <p>{entry.notice}</p>}
          {(material.error || selection.error || context.error || priorError) && (
            <ErrorDetails
              summary="计划材料或工作区未就绪 · 查看详情"
              detail={material.error || selection.error || context.error || priorError}
            />
          )}
        </div>
      )}
      <PlanningPersistenceNotice material={material} onAct={act} />
      {!started ? (
        <div className="vp-content">
          <PlanningStartCard
            version={startVersion}
            busy={entry.busy}
            onStart={() => void start()}
          />
        </div>
      ) : (
        <div className="vp-body" inert={selecting} aria-busy={selecting}>
          <PlanningJourneyNav active={spy.activeSection} onNavigate={spy.navigate} />
          {annotations.annotating && (
            <div className="g3-annotate-banner" role="status">
              批注模式中，点击板面元素即可添加批注
              {annotateShortcut ? ` · ${annotateShortcut} 退出` : ''}
            </div>
          )}
          <div
            className="vp-content"
            ref={content}
            onScroll={onContentScroll}
            onClickCapture={onContentClickCapture}
            onFocusCapture={spy.clearNavigation}
            onWheel={spy.clearNavigation}
            onPointerDown={spy.clearNavigation}
            onTouchStart={spy.clearNavigation}
            onKeyDown={spy.onKeyDown}
          >
            <PlanningPriorReview
              source={progressSource}
              state={prior.state}
              live={priorLive.state}
              openingSource={openingSource}
              onOpenAcceptance={openAcceptance}
              onOpenTask={(task) => act(() => openTask(task))}
              onRetryLive={priorLive.retry}
              sectionRef={sectionRefs.context}
            />
            <PlanningGoals
              plan={plan}
              disabled={disabled}
              edit={edit}
              metrics={metrics}
              prepare={() => void act(prepareMetrics)}
              sectionRef={sectionRefs.goals}
              scope={scope}
              taskPort={taskPort}
              onTask={(task) => act(() => openTask(task))}
              onRemoveGoal={removeGoal}
              onSendAction={wrapSend}
              numbersFor={annotations.numbersFor}
              onOpenAnnotationPanel={annotations.openPanel}
              membership={membership}
            />
            <PlanningMinutesSection
              plan={plan}
              disabled={disabled}
              edit={edit}
              onSendAction={wrapSend}
              sectionRef={sectionRefs.minutes}
            />
            <PlanningArchiveCard
              archivePr={plan?.workflow?.archivePr}
              reachedArchive={plan?.workflow?.stage === 'archive'}
              status={prStatus.status}
              loading={prStatus.loading}
              opening={openingPr}
              onOpenPr={openPr}
              sectionRef={sectionRefs.archive}
            />
          </div>
          <PlanningAnnotationOverlays
            annotations={annotations}
            worktreeId={worktreeId}
            onSentNotice={sendNotice}
          />
        </div>
      )}
    </div>
  )
}
