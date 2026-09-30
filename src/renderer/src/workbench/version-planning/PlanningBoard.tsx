import { GitPullRequest } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PlanningMaterial } from '../../../../shared/workbench/version-material'
import type { CycleTaskRead } from '../version-cycle/ports'
import type { MaterialDraft } from '../version-cycle/material-draft'
import type { VersionCycleContext } from '../version-cycle/cycle-context'
import type { CycleEntry } from '../version-cycle/cycle-workspace-context'
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
import { PlanningProgressSource } from './PlanningProgressSource'
import { usePlanningViewMemory } from './use-planning-view-memory'
import { usePlanningArchive } from './use-planning-archive'
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
  const { scope, session, worktreeId, materialPort, taskPort, archivePort } = context
  const scopeKey = scope ? cycleScopeKey(scope) : ''
  const saveGate = useRef<{
    canSave(draft: MaterialDraft<PlanningMaterial>): boolean
    waitForSave(draft: MaterialDraft<PlanningMaterial>): Promise<boolean>
  }>({ canSave: () => false, waitForSave: async () => false })
  const canSave = useCallback(
    (draft: MaterialDraft<PlanningMaterial>) => saveGate.current.canSave(draft),
    []
  )
  const waitForSave = useCallback(
    (draft: MaterialDraft<PlanningMaterial>) => saveGate.current.waitForSave(draft),
    []
  )
  const material = usePlanningMaterial(materialPort, scopeKey, { canSave, waitForSave })
  const plan = material.draft?.document
  const archive = usePlanningArchive(context, material.draft)
  saveGate.current = archive
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
  }, [selectedVersion, selectedState, selectMaterial, clearMaterial])

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
  const disabled = !plan || archive.archived || archive.initialCheckPending || selecting
  const edit = (next: PlanningMaterial) => {
    if (!disabled) {
      material.edit(next)
    }
  }
  const savedForRequest = async () => {
    if (selection.inProgress()) {
      throw new Error('正在选择版本，请稍后再操作。')
    }
    if (!scope || !worktreeId || !plan) {
      throw new Error('请先选择版本。')
    }
    if (!session) {
      throw new Error('请先在左侧新建或打开会话。')
    }
    const saved = await material.flush()
    if (currentSelection.current !== selectionKey) {
      return null
    }
    if (!saved) {
      throw new Error('修改尚未保存，请先处理保存提示，待保存完成后重试。')
    }
    return saved
  }
  const requestArchive = () =>
    act(async () => {
      const saved = await savedForRequest()
      if (!saved || !scope || !worktreeId || !session) {
        return
      }
      await archivePort.prepareRequest(
        {
          ...scope,
          worktreeId,
          version: saved.document.version,
          cycleId: saved.document.cycleId,
          revision: saved.revision
        },
        session
      )
      if (currentSelection.current === selectionKey) {
        updateView({ notice: '归档请求已贴进左侧当前终端，请核对后发送。' })
      }
    })
  const requestDecomposition = () =>
    act(async () => {
      const saved = await savedForRequest()
      if (!saved || !session) {
        return
      }
      await context.sessionPort.prepareRequest(
        session,
        `请基于已保存的 ${saved.document.version} 计划（cycleId=${saved.document.cycleId}，revision=${saved.revision}）核对评审后的目标与已有 Issue，避免重复，提出版本任务拆解并关联目标；列出需要我确认的事项，经我确认后执行。不要替人确认评审通过、完成 Issue 或合入 PR。`
      )
      if (currentSelection.current === selectionKey) {
        updateView({ notice: '拆解请求已贴进左侧当前终端，请核对后发送。' })
      }
    })
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
    : archive.archived
      ? '已归档'
      : material.draft?.error
        ? '保存待处理'
        : material.busy
          ? '保存中…'
          : material.draft?.dirty
            ? '正在保存修改…'
            : '已保存'
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
      />
      {(material.error || notice || selection.error || context.error || entry.notice) && (
        <p className="vp-notice" role="status">
          {material.error || selection.error || context.error || notice || entry.notice}
        </p>
      )}
      <PlanningPersistenceNotice material={material} archived={archive.archived} onAct={act} />
      <div className="vp-body" inert={selecting} aria-busy={selecting}>
        <PlanningJourneyNav
          hasProgress={Boolean(plan?.summary.progress.trim())}
          goalCount={plan?.goals.filter((goal) => goal.title.trim()).length ?? 0}
          taskCount={plan?.tasks.length ?? 0}
          archived={archive.archived}
          archive={archive.status}
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
              {plan ? (
                <PlanningProgressSource
                  scope={scope}
                  worktreeId={worktreeId}
                  plan={plan}
                  disabled={disabled}
                  onSource={(progressSource) =>
                    edit({ ...plan, summary: { ...plan.summary, progressSource } })
                  }
                />
              ) : (
                <button className="wb-btn wb-btn-sm" disabled>
                  上版验收
                </button>
              )}
            </div>
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
            <label htmlFor="planning-risks">风险上报</label>
            <textarea
              id="planning-risks"
              aria-label="风险上报"
              rows={2}
              disabled={disabled}
              value={plan?.summary.risks ?? ''}
              placeholder="有风险时填写"
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
            onDecompose={() => void requestDecomposition()}
          />
          <section className="vp-archive-card" aria-label="计划归档" ref={archiveSection}>
            <GitPullRequest size={16} />
            <p>核对目标与 Issue，发起 PR 供 Leader 评审。</p>
            <button
              className="wb-btn wb-btn-sm"
              disabled={!plan || archive.archived || archive.pending || selecting || material.busy}
              onClick={() => void requestArchive()}
            >
              归档
            </button>
          </section>
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
