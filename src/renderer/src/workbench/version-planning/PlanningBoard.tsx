import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PlanningMaterial } from '../../../../shared/workbench/version-material'
import { isArchivedMaterial } from '../../../../shared/workbench/version-archive'
import type { ArchiveStatus, CycleTaskRead } from '../version-cycle/ports'
import type { VersionCycleContext } from '../version-cycle/cycle-context'
import { cycleScopeKey } from '../version-cycle/native-cycle-workspace'
import { usePlanningMaterial, planningDraftKey } from './use-planning-material'
import { derivePlanMinutes } from './plan-summary'
import { usePlanMetrics } from './use-plan-metrics'
import { usePlanVersionSelection } from './use-plan-version-selection'
import { PlanningGoals } from './PlanningGoals'
import { PlanningMigration } from './PlanningMigration'
import { PlanningTasks } from './PlanningTasks'
import { PlanningMinutes } from './PlanningMinutes'
import { PlanningSaveFooter } from './PlanningSaveFooter'
import { PlanningCreateForm, PlanningJourneyNav } from './PlanningSections'
import './version-planning.css'

type PlanView = {
  goalFilter: string
  notice: string | null
  /** Keyed by the material identity it was read for; stale reads never decide `archived`. */
  archiveRead: { key: string; status: ArchiveStatus } | null
}
const emptyView: PlanView = {
  goalFilter: '',
  notice: null,
  archiveRead: null
}

type PlanningBoardProps = {
  context: VersionCycleContext
  prepareMetrics(): Promise<void>
}
export function PlanningBoard(props: PlanningBoardProps) {
  const { scope, worktreeId } = props.context
  const identity = JSON.stringify([scope && cycleScopeKey(scope), worktreeId])
  return <PlanningBoardContent key={identity} {...props} />
}

function PlanningBoardContent({ context, prepareMetrics }: PlanningBoardProps) {
  const { scope, session, worktreeId, materialPort, taskPort, archivePort } = context
  const scopeKey = scope ? cycleScopeKey(scope) : ''
  const material = usePlanningMaterial(materialPort, scopeKey)
  const plan = material.draft?.document
  const [newVersion, setNewVersion] = useState('')
  const [creating, setCreating] = useState(false)
  const selection = usePlanVersionSelection(material, context.selectVersion)
  const selecting = selection.busy
  const [minutesOpen, setMinutesOpen] = useState(false)
  const [tasksOpen, setTasksOpen] = useState(false)
  const [view, setView] = useState<PlanView & { key: string }>({ ...emptyView, key: '' })
  const content = useRef<HTMLDivElement>(null)
  const preparation = useRef<HTMLElement>(null)
  const goals = useRef<HTMLElement>(null)
  const tasksSection = useRef<HTMLElement>(null)
  const metricScope = useMemo(
    () => (scope && worktreeId ? { repoId: scope.repoId, hostId: scope.hostId, worktreeId } : null),
    [scope, worktreeId]
  )
  const metrics = usePlanMetrics(metricScope, scope?.runtimeOwnerEnvironmentId, plan)
  const minutes = plan ? derivePlanMinutes(plan) : ''
  const selectionKey = JSON.stringify([scopeKey, plan?.version, plan?.cycleId])
  const { goalFilter, notice, archiveRead } = view.key === selectionKey ? view : emptyView
  const updateView = useCallback(
    (patch: Partial<PlanView>) => {
      setView((current) => ({
        ...(current.key === selectionKey ? current : emptyView),
        ...patch,
        key: selectionKey
      }))
    },
    [selectionKey]
  )
  const contextKey = JSON.stringify([scopeKey, worktreeId])
  const currentContext = useRef(contextKey)
  currentContext.current = contextKey
  useEffect(
    () => () => {
      currentContext.current = ''
    },
    []
  )
  const selectedVersion = context.version
  const selectMaterial = material.select
  const clearMaterial = material.clear
  const version = plan?.version
  const planCycleId = plan?.cycleId
  const revision = material.draft?.expectedRevision
  const archiveIdentity =
    version && planCycleId && revision ? JSON.stringify([version, planCycleId, revision]) : null
  const resolvedArchive =
    archiveIdentity && archiveRead?.key === archiveIdentity ? archiveRead.status : null
  /** First archive read for the opened material is in flight; editing stays disabled until it settles. */
  const archivePending = archiveIdentity !== null && archiveRead === null
  const archive: ArchiveStatus = resolvedArchive ??
    archiveRead?.status ?? { kind: 'unknown', reason: '尚未读取' }
  /** Host truth for the saved revision; a stale dirty draft cannot bypass a confirmed archive. */
  const archived = Boolean(
    plan &&
    revision &&
    resolvedArchive &&
    isArchivedMaterial(resolvedArchive, {
      workflow: 'plan',
      version: plan.version,
      cycleId: plan.cycleId,
      revision
    })
  )

  useEffect(() => {
    if (selectedVersion) {
      void selectMaterial(selectedVersion)
    } else {
      clearMaterial()
    }
  }, [contextKey, selectedVersion, selectMaterial, clearMaterial])

  useEffect(() => {
    let current = true
    if (!scope || !worktreeId || !version || !planCycleId || !revision || !archiveIdentity) {
      return
    }
    void archivePort
      .readStatus({
        ...scope,
        worktreeId,
        version,
        cycleId: planCycleId,
        revision
      })
      .then(
        (result) => {
          if (current) {
            updateView({ archiveRead: { key: archiveIdentity, status: result } })
          }
        },
        (reason) => {
          if (current) {
            updateView({
              archiveRead: {
                key: archiveIdentity,
                status: { kind: 'unknown', reason: String(reason) }
              }
            })
          }
        }
      )
    return () => {
      current = false
    }
  }, [scope, worktreeId, version, planCycleId, revision, archiveIdentity, archivePort, updateView])

  const act = async (operation: () => Promise<unknown>) => {
    updateView({ notice: null })
    try {
      await operation()
    } catch (reason) {
      if (currentContext.current === contextKey) {
        updateView({ notice: reason instanceof Error ? reason.message : String(reason) })
      }
    }
  }
  const selectVersion = async (version: string, create = false) => {
    if (await selection.select(version, create)) {
      setCreating(false)
      setNewVersion('')
    }
  }
  const edit = (next: PlanningMaterial) => {
    if (!archived && !archivePending) {
      material.edit(next)
    }
  }
  const beginNextRound = () => {
    if (!plan || !archived || material.busy || selecting) {
      return
    }
    material.edit({ ...plan, cycleId: crypto.randomUUID() })
  }
  const requestArchive = () =>
    act(async () => {
      if (selection.inProgress()) {
        throw new Error('正在选择版本，请稍后再归档。')
      }
      if (!scope || !worktreeId || !plan || !material.draft?.expectedRevision) {
        throw new Error('请先选择版本并保存计划。')
      }
      if (material.draft.dirty) {
        throw new Error('还有未保存修改，请保存后归档。')
      }
      if (!session) {
        throw new Error('请先在左侧选择或开启本次会话。')
      }
      await archivePort.prepareRequest(
        {
          ...scope,
          worktreeId,
          version: plan.version,
          cycleId: plan.cycleId,
          revision: material.draft.expectedRevision
        },
        session
      )
      if (currentContext.current === contextKey) {
        updateView({ notice: '归档请求已放入会话输入框，请核对后发送。' })
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

  return (
    <div className="vp-board">
      <header className="vp-header">
        <div>
          <h1>版本计划</h1>
          <span className="vp-muted">准备 → 目标 → 评审 → 拆解 → 归档</span>
        </div>
        <div className="vp-inline">
          <select
            aria-label="计划版本"
            value={plan?.version ?? ''}
            disabled={!materialPort || material.busy || selecting}
            onChange={(event) => {
              if (event.target.value) {
                void act(() => selectVersion(event.target.value))
              }
            }}
          >
            <option value="">待选择版本</option>
            {material.versions.map((item) => (
              <option key={item.version} value={item.version} disabled={item.state !== 'ready'}>
                {item.version}
                {item.state !== 'ready'
                  ? ` · ${item.state === 'migration-required' ? '需迁移' : '无法读取'}`
                  : ''}
              </option>
            ))}
            {plan && !material.versions.some((item) => item.version === plan.version) && (
              <option value={plan.version}>{plan.version} · 新草稿</option>
            )}
          </select>
          <button
            className="wb-btn wb-btn-ghost wb-btn-sm"
            disabled={!materialPort || selecting}
            onClick={() => setCreating((value) => !value)}
          >
            新建版本
          </button>
          {archived && (
            <button
              className="wb-btn wb-btn-ghost wb-btn-sm"
              disabled={material.busy || selecting}
              onClick={beginNextRound}
            >
              开始下一轮计划
            </button>
          )}
        </div>
      </header>
      {creating && (
        <PlanningCreateForm
          newVersion={newVersion}
          busy={material.busy || selecting}
          onNewVersion={setNewVersion}
          onCreate={(version) => void act(() => selectVersion(version, true))}
        />
      )}
      {(material.error || notice || selection.error) && (
        <p className="vp-notice" role="status">
          {selection.error || material.error || notice}
        </p>
      )}
      {materialPort && (
        <PlanningMigration
          key={scopeKey}
          port={materialPort}
          versions={material.versions}
          onMigrated={async (version) => {
            await material.list()
            await selectVersion(version)
          }}
        />
      )}
      <div className="vp-body" inert={selecting} aria-busy={selecting}>
        <PlanningJourneyNav
          hasPlan={Boolean(plan)}
          goalCount={plan?.goals.length ?? 0}
          taskCount={plan?.tasks.length ?? 0}
          archived={archived}
          archiveOpen={archive.kind === 'open'}
          preparationRef={preparation}
          goalsRef={goals}
          onMinutes={() => setMinutesOpen(true)}
          onTasks={() => {
            setTasksOpen(true)
            tasksSection.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
          }}
          onArchive={() => void requestArchive()}
        />
        <div className="vp-content" ref={content}>
          {!plan ? (
            <div className="vp-empty">
              <h2>待选择版本</h2>
              <p>选择已有版本，或明确新建版本。可以先在左侧讨论，本页不会自动创建计划。</p>
              {!materialPort && <p>先开启计划会话，创建或恢复项目的计划工作树。</p>}
              {material.versions
                .filter((item) => item.state !== 'ready')
                .map((item) => (
                  <p key={item.version}>
                    {item.version}：
                    {item.state === 'migration-required'
                      ? '旧版材料需要显式迁移，原文件保持不变。'
                      : '材料无法读取，请核对原文件。'}
                  </p>
                ))}
            </div>
          ) : (
            <>
              <section
                className="vp-preparation"
                ref={preparation}
                inert={archived || archivePending}
              >
                <label>
                  {plan.version} · 版本进展
                  <textarea
                    rows={2}
                    value={plan.summary.progress}
                    placeholder="说明当前进展与来源"
                    onChange={(event) =>
                      edit({ ...plan, summary: { ...plan.summary, progress: event.target.value } })
                    }
                  />
                </label>
                <details open={plan.summary.risks ? true : undefined}>
                  <summary>风险上报（可选）</summary>
                  <textarea
                    aria-label="风险上报"
                    rows={2}
                    value={plan.summary.risks}
                    onChange={(event) =>
                      edit({ ...plan, summary: { ...plan.summary, risks: event.target.value } })
                    }
                  />
                </details>
              </section>
              <div inert={archived || archivePending}>
                <PlanningGoals
                  plan={plan}
                  edit={edit}
                  metrics={metrics}
                  sectionRef={goals}
                  prepare={() => void act(prepareMetrics)}
                />
              </div>
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
            </>
          )}
        </div>
      </div>
      <PlanningSaveFooter
        material={{ ...material, busy: material.busy || selecting }}
        archive={archive}
        archived={archived}
        archivePending={archivePending}
        onAct={act}
        onMinutes={() => setMinutesOpen(true)}
        onArchive={requestArchive}
      />
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
