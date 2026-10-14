import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import type { PlanningMaterial } from '../../../../shared/workbench/version-material'
import type { CycleTaskRead } from '../version-cycle/ports'
import type { VersionCycleContext } from '../version-cycle/cycle-context'
import type { CycleEntry } from '../version-cycle/cycle-workspace-context'
import { setCycleView } from '../cycle-view-state'
import { CycleArchive } from '../version-cycle/CycleArchive'
import { CycleStartCard } from '../version-cycle/CycleStartCard'
import { cycleBranch, cycleScopeKey } from '../version-cycle/native-cycle-workspace'
import { usePlanningMaterial, planningDraftKey } from './use-planning-material'
import { derivePlanMinutes } from './plan-summary'
import { usePlanMetrics } from './use-plan-metrics'
import { usePlanVersionSelection } from './use-plan-version-selection'
import { PlanningGoals } from './PlanningGoals'
import { PlanningTasks } from './PlanningTasks'
import { PlanningMinutes } from './PlanningMinutes'
import { PlanningPersistenceNotice } from './PlanningPersistenceNotice'
import { PlanningHeader, PlanningJourneyNav } from './PlanningSections'
import { usePlanningViewMemory } from './use-planning-view-memory'
import { useProgressMinutes } from './use-progress-minutes'
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
  const [minutesRefresh, setMinutesRefresh] = useState(0)
  const progressMinutes = useProgressMinutes(
    scope,
    worktreeId,
    plan?.summary.progressSource,
    (context.materialRefresh ?? 0) + minutesRefresh
  )
  const selection = usePlanVersionSelection(material, context.selectVersion)
  const selecting = selection.busy
  const [minutesOpen, setMinutesOpen] = useState(false)
  const [tasksOpen, setTasksOpen] = useState(false)
  const [view, setView] = useState({ key: '', goalFilter: '', notice: '' })
  const content = useRef<HTMLDivElement>(null)
  const preparation = useRef<HTMLElement>(null)
  const goals = useRef<HTMLElement>(null)
  const tasksSection = useRef<HTMLElement>(null)
  const archiveSection = useRef<HTMLElement>(null)
  const metricScope = useMemo(
    () => (scope && worktreeId ? { repoId: scope.repoId, hostId: scope.hostId, worktreeId } : null),
    [scope, worktreeId]
  )
  const metrics = usePlanMetrics(metricScope, scope?.runtimeOwnerEnvironmentId, plan)
  const minutes = plan ? derivePlanMinutes(plan) : ''
  const selectionKey = JSON.stringify([scopeKey, plan?.version, plan?.cycleId])
  const goalFilter = view.key === selectionKey ? view.goalFilter : ''
  const notice = view.key === selectionKey ? view.notice : ''
  const updateView = useCallback(
    (patch: Partial<typeof view>) => {
      setView((current) => ({
        ...(current.key === selectionKey ? current : { goalFilter: '', notice: '' }),
        ...patch,
        key: selectionKey
      }))
    },
    [selectionKey]
  )
  const restoreGoalFilter = useCallback(
    (value: string) => updateView({ goalFilter: value }),
    [updateView]
  )
  const viewMemory = usePlanningViewMemory(
    plan ? selectionKey : null,
    goalFilter,
    restoreGoalFilter,
    content
  )
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
  const openTask = async (task: Extract<CycleTaskRead, { kind: 'ready' }>['task']) => {
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
      goalId: goalFilter || undefined,
      scrollTop: content.current?.scrollTop ?? 0,
      draftKey: planningDraftKey(scopeKey, plan.version)
    })
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
  const progressSource = plan?.summary.progressSource
  return (
    <div className="vp-board">
      <PlanningHeader
        currentVersion={plan?.version ?? ''}
        versions={material.versions}
        disabled={!materialPort || selecting}
        state={state}
        branch={cycleBranch(entry)}
        onSelect={(version) => void selection.select(version)}
        onConfigure={() => void entry.configure()}
        onRefresh={() =>
          void act(async () => {
            setMinutesRefresh((value) => value + 1)
            await material.refresh()
            await material.list()
            await prStatus.refresh()
          })
        }
      />
      {(material.error || notice || selection.error || context.error || entry.notice) && (
        <p className="vp-notice" role="status">
          {material.error || selection.error || context.error || notice || entry.notice}
        </p>
      )}
      <PlanningPersistenceNotice material={material} onAct={act} />
      <div className="vp-body" inert={selecting} aria-busy={selecting}>
        <PlanningJourneyNav
          stage={plan?.workflow?.stage}
          preparationRef={preparation}
          goalsRef={goals}
          tasksRef={tasksSection}
          archiveRef={archiveSection}
        />
        <div className="vp-content" ref={content} onScroll={viewMemory.onScroll}>
          <CycleStartCard
            entry={entry}
            problems={material.versions.filter((item) => item.state !== 'ready')}
            version={context.version}
          />
          <section className="vp-preparation" ref={preparation}>
            <div className="vp-brief-head">
              <label htmlFor="planning-progress">版本进展</label>
              <button
                className="wb-btn wb-btn-sm"
                title="到验收屏查看完整验收记录"
                onClick={() => {
                  setCycleView('acceptance')
                  useAppStore.getState().openArtifactsPage()
                }}
              >
                上版验收
              </button>
            </div>
            {progressSource && progressMinutes.kind !== 'error' ? (
              progressMinutes.kind === 'ready' ? (
                <>
                  <p className="vp-muted">
                    上版验收 {progressSource.version} 纪要 · 完整记录与来源在验收屏
                  </p>
                  <pre className="vp-progress-minutes">{progressMinutes.markdown}</pre>
                </>
              ) : (
                <p className="vp-muted" role="status">
                  正在读取上版验收纪要…
                </p>
              )
            ) : (
              <>
                {progressMinutes.kind === 'error' && (
                  <p role="alert">上版验收纪要读取失败：{progressMinutes.reason}</p>
                )}
                <textarea
                  id="planning-progress"
                  aria-label="版本进展"
                  rows={2}
                  disabled={disabled}
                  value={plan?.summary.progress ?? ''}
                  placeholder="上版验收结果与本版起点"
                  onChange={(event) => {
                    if (plan) {
                      edit({ ...plan, summary: { ...plan.summary, progress: event.target.value } })
                    }
                  }}
                />
              </>
            )}
            <label htmlFor="planning-risks">风险上报</label>
            <textarea
              id="planning-risks"
              aria-label="风险上报"
              rows={2}
              disabled={disabled}
              value={plan?.summary.risks ?? ''}
              placeholder="有风险时填写；仅由你填写，模型不代填"
              onChange={(event) => {
                if (plan) {
                  edit({ ...plan, summary: { ...plan.summary, risks: event.target.value } })
                }
              }}
            />
          </section>
          <PlanningGoals
            plan={plan}
            disabled={disabled}
            edit={edit}
            metrics={metrics}
            sectionRef={goals}
            prepare={() => void act(prepareMetrics)}
            onMinutes={() => setMinutesOpen(true)}
          />
          <PlanningTasks
            scope={scope}
            plan={plan}
            taskPort={taskPort}
            sectionRef={tasksSection}
            open={tasksOpen}
            onOpen={setTasksOpen}
            goalFilter={goalFilter}
            onFilter={(value) => updateView({ goalFilter: value })}
            onTask={(task) => act(() => openTask(task))}
          />
          <CycleArchive
            archivePr={plan?.workflow?.archivePr}
            reachedArchive={plan?.workflow?.stage === 'archive'}
            status={prStatus.status}
            loading={prStatus.loading}
            sectionRef={archiveSection}
          />
        </div>
      </div>
      {minutesOpen && (
        <PlanningMinutes
          minutes={minutes}
          onClose={() => setMinutesOpen(false)}
          onCopy={() =>
            act(async () => {
              await navigator.clipboard.writeText(minutes)
              updateView({ notice: '已复制当前目标派生的纪要。' })
            })
          }
        />
      )}
    </div>
  )
}
