import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import type { PlanningMaterial } from '../../../../shared/workbench/version-material'
import type { CycleTaskRead } from '../version-cycle/ports'
import type { VersionCycleContext } from '../version-cycle/cycle-context'
import type { CycleEntry } from '../version-cycle/cycle-workspace-context'
import { trunkUpdateNotice } from '../version-cycle/trunk-update-port'
import { setCycleView } from '../cycle-view-state'
import { openAcceptanceSource } from '../version-cycle/open-acceptance-source'
import { CycleArchive } from '../version-cycle/CycleArchive'
import { CycleStartCard } from '../version-cycle/CycleStartCard'
import { cycleBranch, cycleScopeKey } from '../version-cycle/native-cycle-workspace'
import { usePlanningMaterial, planningDraftKey } from './use-planning-material'
import { derivePlanMinutes } from './plan-summary'
import { usePlanMetrics } from './use-plan-metrics'
import { usePlanVersionSelection } from './use-plan-version-selection'
import { PlanningGoals } from './PlanningGoals'
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
  const progressMinutes = useProgressMinutes(
    scope,
    worktreeId,
    plan?.summary.progressSource,
    context.materialRefresh ?? 0
  )
  const selection = usePlanVersionSelection(material, context.selectVersion)
  const selecting = selection.busy
  const [minutesOpen, setMinutesOpen] = useState(false)
  const [openingSource, setOpeningSource] = useState(false)
  const [view, setView] = useState({ key: '', notice: '' })
  const content = useRef<HTMLDivElement>(null)
  const preparation = useRef<HTMLElement>(null)
  const goals = useRef<HTMLElement>(null)
  const archiveSection = useRef<HTMLElement>(null)
  const metricScope = useMemo(
    () => (scope && worktreeId ? { repoId: scope.repoId, hostId: scope.hostId, worktreeId } : null),
    [scope, worktreeId]
  )
  const metrics = usePlanMetrics(metricScope, scope?.runtimeOwnerEnvironmentId, plan)
  const minutes = plan ? derivePlanMinutes(plan) : ''
  const selectionKey = JSON.stringify([scopeKey, plan?.version, plan?.cycleId])
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
      goalId: task.reference.goalId,
      scrollTop: content.current?.scrollTop ?? 0,
      draftKey: planningDraftKey(scopeKey, plan.version)
    })
  }
  const prepareIssues = async (goal: NonNullable<typeof plan>['goals'][number]) => {
    if (!plan) {
      return
    }
    const references = plan.tasks.filter((task) => task.goalId === goal.goalId)
    const referenceText = references.length
      ? references.map((task) => `${task.provider}:${task.repository}#${task.number}`).join('、')
      : '当前暂无关联 Issue，请先从目标结果出发确认需要拆解的任务'
    await entry.start(
      `请在当前版本计划会话中，围绕目标「${goal.title || goal.goalId}」逐条读取并拆解任务。当前关联 Issue：${referenceText}。根据真实 Issue 内容与项目约定，为每条任务补充 Bug 或 Feature 标签和必要的拆解信息；不要凭空改变 Issue 状态或替人确认完成。`
    )
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
        disabled={!materialPort || selecting || Boolean(context.syncing)}
        state={state}
        branch={cycleBranch(entry)}
        onSelect={(version) => void selection.select(version)}
        onConfigure={() => void entry.configure()}
        onRefresh={() =>
          void act(async () => {
            toast.message(trunkUpdateNotice(await context.updateCode()))
            await material.refresh()
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
          tasksRef={goals}
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
                disabled={openingSource || selecting || Boolean(context.syncing)}
                onClick={() =>
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
                }
              >
                查看验收依据
              </button>
            </div>
            {progressSource && progressMinutes.kind !== 'error' ? (
              progressMinutes.kind === 'ready' ? (
                <>
                  <p className="vp-muted">
                    验收纪要 {progressSource.version} · 完整记录与来源在验收屏
                  </p>
                  <pre className="vp-progress-minutes">{progressMinutes.markdown}</pre>
                </>
              ) : (
                <p className="vp-muted" role="status">
                  正在读取验收纪要…
                </p>
              )
            ) : (
              <>
                {progressMinutes.kind === 'error' && (
                  <p role="alert">验收纪要读取失败：{progressMinutes.reason}</p>
                )}
                <textarea
                  id="planning-progress"
                  aria-label="版本进展"
                  rows={2}
                  disabled={disabled}
                  value={plan?.summary.progress ?? ''}
                  placeholder="验收结果与本周计划起点"
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
            scope={scope}
            taskPort={taskPort}
            onTask={(task) => act(() => openTask(task))}
            onPrepareIssues={(goal) => act(() => prepareIssues(goal))}
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
