import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent
} from 'react'
import { toast } from 'sonner'
import { MessageSquarePlus } from 'lucide-react'
import { useAppStore } from '@/store'
import type { PlanningMaterial } from '../../../../shared/workbench/version-material'
import type { CycleTaskSnapshot } from '../version-cycle/ports'
import type { VersionCycleContext } from '../version-cycle/cycle-context'
import type { CycleEntry } from '../version-cycle/cycle-workspace-context'
import { trunkUpdateNotice } from '../version-cycle/trunk-update-port'
import { setCycleView } from '../cycle-view-state'
import { openAcceptanceSource } from '../version-cycle/open-acceptance-source'
import { cycleBranch, cycleScopeKey } from '../version-cycle/native-cycle-workspace'
import { togglePlanChat } from '../plan-column-resize'
import { usePlanChatCollapsed } from '../use-plan-chat-collapsed'
import { BoardIconButton } from '../board-ui'
import { AnnotationPanel } from '../annotations/AnnotationPanel'
import { AnnotationPopover } from '../annotations/AnnotationPopover'
import {
  boardAnnotationsSendPrompt,
  formatBoardAnnotationsAsMarkdown
} from '../annotations/annotation-markdown'
import { annotationRefFromElement } from '../annotations/types'
import { useBoardAnnotations } from '../annotations/use-board-annotations'
import { usePlanningMaterial, planningDraftKey } from './use-planning-material'
import { usePlanMetrics } from './use-plan-metrics'
import { usePlanVersionSelection } from './use-plan-version-selection'
import { PlanningGoals } from './PlanningGoals'
import { PlanningMinutesSection } from './PlanningMinutesSection'
import { PlanningPriorReview } from './PlanningPriorReview'
import { PlanningArchiveCard } from './PlanningArchiveCard'
import { openArchivePrPage } from './open-archive-pr'
import { PlanningPersistenceNotice } from './PlanningPersistenceNotice'
import { PlanningHeader, PlanningJourneyNav } from './PlanningSections'
import { useJourneySpy } from './use-journey-spy'
import { usePlanningViewMemory } from './use-planning-view-memory'
import { usePriorCarryovers } from './use-prior-carryovers'
import { useObjectActionSend } from './use-object-action-send'
import { useArchivePrStatus } from '../version-cycle/use-archive-pr-status'
import './version-planning.css'

type PlanningBoardProps = {
  context: VersionCycleContext
  prepareMetrics(): Promise<void>
  entry: CycleEntry
}
export function PlanningBoard(props: PlanningBoardProps) {
  const { scope, worktreeId } = props.context
  const identity = JSON.stringify([scope && cycleScopeKey(scope), worktreeId])
  return <PlanningBoardContent key={identity} {...props} />
}
function PlanningBoardContent({ context, prepareMetrics, entry }: PlanningBoardProps) {
  const { scope, session, worktreeId, materialPort, taskPort } = context
  const scopeKey = scope ? cycleScopeKey(scope) : ''
  const canSave = useCallback(() => !context.syncing, [context.syncing])
  const material = usePlanningMaterial(materialPort, scopeKey, { canSave })
  const plan = material.draft?.document
  const prStatus = useArchivePrStatus(context, plan?.workflow?.archivePr)
  const progressSource = plan?.summary.progressSource
  const prior = usePriorCarryovers(scope, worktreeId, progressSource, context.materialRefresh)
  const selection = usePlanVersionSelection(material, context.selectVersion)
  const selecting = selection.busy
  const [openingSource, setOpeningSource] = useState(false)
  const [openingPr, setOpeningPr] = useState(false)
  const [view, setView] = useState({ key: '', notice: '' })
  const content = useRef<HTMLDivElement>(null)
  const spy = useJourneySpy()
  const sectionRefs = spy.sectionRefs
  const annotations = useBoardAnnotations()
  const sendAction = useObjectActionSend(worktreeId)
  const chatCollapsed = usePlanChatCollapsed()
  const metricScope = useMemo(
    () => (scope && worktreeId ? { repoId: scope.repoId, hostId: scope.hostId, worktreeId } : null),
    [scope, worktreeId]
  )
  const metrics = usePlanMetrics(metricScope, scope?.runtimeOwnerEnvironmentId, plan)
  const selectionKey = JSON.stringify([scopeKey, plan?.version, plan?.cycleId])
  const { clearAll, pruneMissing } = annotations
  // Stable board identity for annotation lifetime: context.version is the native
  // selection and does not flicker through re-select transients (draft null),
  // unlike selectionKey — clearing on the latter would wipe meeting annotations
  // on every「更新代码」or poll-driven reselect of the same version.
  const boardIdentity = JSON.stringify([scopeKey, context.version])
  useEffect(() => {
    // Memory annotations point at the previous board's objects after a switch.
    clearAll()
  }, [boardIdentity, clearAll])
  // Model-side edits (poll) may drop goals/task references: prune annotations
  // whose object no longer exists on the board instead of keeping orphans.
  const goalsKey = JSON.stringify(plan?.goals.map((goal) => goal.goalId) ?? [])
  const tasksKey = JSON.stringify(plan?.tasks.map((task) => [task.goalId, task.number]) ?? [])
  useEffect(() => {
    if (!plan) {
      return
    }
    const goalIds = new Set(plan.goals.map((goal) => goal.goalId))
    const issueKeys = new Set(
      plan.tasks.filter((task) => task.goalId).map((task) => `${task.goalId}:${task.number}`)
    )
    pruneMissing(
      (goalId) => goalIds.has(goalId),
      (goalId, number) => issueKeys.has(`${goalId}:${number}`)
    )
  }, [goalsKey, tasksKey, plan, pruneMissing])
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
        updateView({ notice: reason instanceof Error ? reason.message : String(reason) })
      }
    }
  }
  const disabled = !plan || Boolean(context.syncing) || selecting
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
  /** Whole-card delete: goal, its task references and its annotations all leave the plan. */
  const removeGoal = (goalId: string) => {
    if (!plan) {
      return
    }
    edit({
      ...plan,
      goals: plan.goals.filter((goal) => goal.goalId !== goalId),
      tasks: plan.tasks.filter((task) => task.goalId !== goalId)
    })
    annotations.removeForGoal(goalId)
  }
  const openAcceptance = () =>
    void act(async () => {
      if (openingSource) {
        return
      }
      setOpeningSource(true)
      try {
        if (material.draft?.dirty && !(await material.flush())) {
          throw new Error('当前计划修改尚未保存，请处理保存提示后再查看验收依据。')
        }
        if (currentSelection.current !== selectionKey) {
          return
        }
        if (progressSource) {
          if (!scope || !worktreeId) {
            throw new Error('计划工作区尚未就绪。')
          }
          await openAcceptanceSource(scope, worktreeId, progressSource)
        } else {
          setCycleView('acceptance')
          useAppStore.getState().openArtifactsPage()
        }
      } finally {
        setOpeningSource(false)
      }
    })
  const openPr = () =>
    void act(async () => {
      const archivePr = plan?.workflow?.archivePr
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
  const popover = annotations.popover
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
        versions={material.versions}
        disabled={!materialPort || selecting || Boolean(context.syncing)}
        state={state}
        branch={cycleBranch(entry)}
        sessionCollapsed={chatCollapsed}
        onSessionToggle={onSessionToggle}
        onSelect={(version) => void selection.select(version)}
        onConfigure={() => void entry.configure()}
        onRefresh={() =>
          void act(async () => {
            toast.message(trunkUpdateNotice(await context.updateCode()))
            await material.refresh()
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
      {(material.error || notice || selection.error || context.error || entry.notice) && (
        <p className="vp-notice" role="status">
          {material.error || selection.error || context.error || notice || entry.notice}
        </p>
      )}
      <PlanningPersistenceNotice material={material} onAct={act} />
      <div className="vp-body" inert={selecting} aria-busy={selecting}>
        <PlanningJourneyNav active={spy.activeSection} onNavigate={spy.navigate} />
        {annotations.annotating && (
          <div className="g3-annotate-banner" role="status">
            批注模式中，点击板面元素即可添加批注 · Esc 退出
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
            openingSource={openingSource}
            onOpenAcceptance={openAcceptance}
            onOpenTask={(task) => act(() => openTask(task))}
            onRetry={prior.retry}
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
            onSendAction={sendAction}
            numbersFor={annotations.numbersFor}
            onOpenAnnotationPanel={annotations.openPanel}
            entry={entry}
            problems={material.versions.filter((item) => item.state !== 'ready')}
            version={context.version}
          />
          <PlanningMinutesSection
            plan={plan}
            disabled={disabled}
            edit={edit}
            onSendAction={sendAction}
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
        {annotations.panelOpen && (
          <AnnotationPanel
            annotations={annotations.numbered}
            annotating={annotations.annotating}
            onClose={annotations.closePanel}
            onUpdate={annotations.update}
            onRemove={annotations.remove}
            onBoardLevel={(rect) =>
              annotations.openPopover({ kind: 'board', label: '板面级' }, rect)
            }
            onCopy={() =>
              void act(async () => {
                await navigator.clipboard.writeText(
                  formatBoardAnnotationsAsMarkdown(annotations.annotations)
                )
                updateView({ notice: '已复制板面批注。' })
              })
            }
            onSend={() => {
              annotations.closePopover()
              sendAction(boardAnnotationsSendPrompt(annotations.annotations), '板面批注')
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
    </div>
  )
}
