import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AcceptanceMaterialSchema,
  type AcceptanceMaterial
} from '../../../../shared/workbench/version-material'
import type { VersionDocumentPort } from '../../../../shared/workbench/version-document'
import { useAcceptanceDraft } from './use-acceptance-draft'
import {
  createAcceptanceMaterial,
  sameAcceptanceSource,
  upsertGoalResult
} from './acceptance-model'
import { useMaterialAutosave } from '../version-cycle/use-material-autosave'
import type { AcceptanceBoardProps } from './AcceptanceBoard'
import { useAcceptanceSources, useFixedAcceptancePlan } from './use-acceptance-plan'
import { useAcceptanceOutput } from './use-acceptance-output'
import { useAcceptanceGate } from './use-acceptance-gate'

/**
 * Acceptance board data wiring: version catalog, draft material with autosave
 * and recovery, the fixed plan the material cites, and the edit entry points.
 *
 * Rounds are retired with the cross-week scenario, so there is no history
 * selection here — the board always shows the current material. Initialization
 * is first-click: the empty board's start entry chains the gate check, draft
 * creation and the session launch, and entering the screen alone never
 * initializes — once the material exists it persists across visits.
 */
export function useAcceptanceBoard({
  context,
  history,
  recoveryKey
}: Pick<AcceptanceBoardProps, 'context' | 'history'> & { recoveryKey: string }) {
  const scope = context.scope!
  const worktreeId = context.worktreeId!
  const materialPort = context.materialPort!
  const metricScope = useMemo(
    () => ({ repoId: scope.repoId, worktreeId, hostId: scope.hostId }),
    [scope.repoId, scope.hostId, worktreeId]
  )
  const port = useMemo<VersionDocumentPort<AcceptanceMaterial>>(
    () => ({
      async read(version) {
        const value = await materialPort.read(version)
        return value ? { ...value, document: AcceptanceMaterialSchema.parse(value.document) } : null
      },
      async save(input) {
        const value = await materialPort.save(input)
        return { ...value, document: AcceptanceMaterialSchema.parse(value.document) }
      }
    }),
    [materialPort]
  )
  const {
    draft,
    controller,
    recoveryError,
    recoveryText,
    loadedVersion,
    refresh: refreshDraft,
    clear: useRemoteDeletion,
    cancelAutomaticRead,
    loadedRefresh
  } = useAcceptanceDraft(recoveryKey, port, context.version ?? undefined, context.materialRefresh)
  const catalog = useAcceptanceSources(history, materialPort, metricScope, context.materialRefresh)
  const [version, setVersion] = useState(context.version ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const scroll = useRef<HTMLDivElement>(null)
  const generation = useRef(0)
  const document = draft?.document
  const fixed = useFixedAcceptancePlan(history, metricScope, document?.planRef)
  const output = useAcceptanceOutput(context, controller)
  const associated = Boolean(document && document.version === context.version)
  const readOnly = busy || Boolean(context.syncing) || !associated || !fixed.plan
  const lifetime = useRef({ active: true })
  useEffect(() => {
    const state = lifetime.current
    state.active = true
    return () => {
      state.active = false
    }
  }, [])
  const isCurrent = useCallback(() => lifetime.current.active, [])
  const selection = useRef({ value: 0 })
  const canSave = useCallback(() => !context.syncing && !busy, [context.syncing, busy])
  const autosave = useMaterialAutosave({
    controller,
    draft,
    options: { canSave },
    isCurrent,
    selection,
    onSaved: catalog.refresh
  })
  const source = catalog.sources.find((item) => item.version === context.version)
  // Memoized: an inline object here would give the gate a fresh identity every
  // render and spin its effect forever.
  const archiveScope = useMemo(
    () => ({
      repoId: scope.repoId,
      hostId: scope.hostId,
      worktreeId,
      ...(scope.runtimeOwnerEnvironmentId
        ? { runtimeOwnerEnvironmentId: scope.runtimeOwnerEnvironmentId }
        : {})
    }),
    [scope.repoId, scope.hostId, scope.runtimeOwnerEnvironmentId, worktreeId]
  )
  const catalogLoaded = catalog.loadedRefresh === (context.materialRefresh ?? 0)
  const gate = useAcceptanceGate({
    history,
    scope: metricScope,
    archiveScope,
    archivePort: context.archivePort,
    source,
    versionSelected: Boolean(context.version),
    catalogLoaded
  })
  /**
   * First-click initialization from the empty board: build the acceptance draft
   * from this version's committed plan. Only the start entry calls this, after
   * the gate reports the plan archive PR merged — entering the screen or passing
   * the gate alone never creates a draft. Throws instead of no-oping so the
   * entry can report why nothing started.
   */
  async function initialize() {
    if (draft) {
      return
    }
    if (context.syncing) {
      throw new Error('正在更新代码，请等同步完成后再开始验收。')
    }
    if (!source) {
      throw new Error('未在验收分支上找到本版已提交的计划。')
    }
    if (recoveryError) {
      throw new Error('本机恢复草稿待处理，请先按恢复提示处理后再开始验收。')
    }
    if (
      loadedVersion !== context.version ||
      loadedRefresh !== (context.materialRefresh ?? 0) ||
      catalog.loadedRefresh !== (context.materialRefresh ?? 0)
    ) {
      throw new Error('版本材料仍在读取，请稍后再点。')
    }
    const original = controller.value
    const planRef = {
      kind: 'committed' as const,
      version: source.version,
      cycleId: source.cycleId,
      sourceCommit: source.sourceCommit,
      revision: source.revision
    }
    const selected = await history.readPlan({ scope: metricScope, planRef })
    // The disk read may restore an existing material mid-flight; keep it
    // instead of overwriting real content with a fresh draft.
    if (controller.value !== original) {
      return
    }
    controller.restore({
      document: createAcceptanceMaterial({
        planRef,
        plan: selected,
        cycleId: crypto.randomUUID()
      }),
      expectedRevision: null,
      dirty: true
    })
  }
  useEffect(() => {
    const timer = setInterval(() => {
      if (!context.syncing) {
        void controller.refresh().catch((reason) => setError(String(reason)))
      }
    }, 5000)
    return () => clearInterval(timer)
  }, [controller, context.syncing])
  useEffect(
    () => () => {
      generation.current++
    },
    []
  )
  useEffect(() => {
    setVersion(document?.version ?? context.version ?? '')
  }, [document?.version, context.version])
  useEffect(() => {
    if (scroll.current) {
      try {
        scroll.current.scrollTop = Number(sessionStorage.getItem(`${recoveryKey}:scroll`) ?? 0)
      } catch {
        /* Scroll recovery is optional. */
      }
    }
  }, [document?.version, recoveryKey])
  async function loadVersion(value: string) {
    const original = controller.value
    if (original?.dirty && !(await autosave.flush())) {
      setError('修改尚未保存，请处理保存提示后再切换版本。')
      return
    }
    const savedOriginal = controller.value
    cancelAutomaticRead()
    const token = ++generation.current
    setBusy(true)
    try {
      await port.read(value)
      if (token !== generation.current) {
        return
      }
      if (controller.value !== savedOriginal) {
        setError('切换期间材料已变化，已保留当前输入；请保存后重新选择版本。')
        return
      }
      await context.selectVersion(value)
    } catch (reason) {
      if (token === generation.current) {
        setError(String(reason))
      }
    } finally {
      if (token === generation.current) {
        setBusy(false)
      }
    }
  }
  async function refreshData() {
    setError(null)
    try {
      fixed.refresh()
      await refreshDraft()
      await catalog.refresh()
      // The gate reads the plan's archive PR state; a trunk sync may have merged
      // it, so re-check instead of leaving a stale block on screen.
      await gate.recheck()
    } catch (reason) {
      setError(String(reason))
    }
  }
  /** Whole-document edit for sections that are not one goal result (minutes). */
  function editDocument(next: AcceptanceMaterial) {
    const current = controller.value?.document
    if (!current || readOnly || current.version !== context.version) {
      setError('验收来源已变化，输入未覆盖新材料，请重新核对。')
      return
    }
    if (!sameAcceptanceSource(current, next)) {
      setError('验收来源已变化，输入未覆盖新材料，请重新核对。')
      return
    }
    controller.edit(next)
  }
  function editGoal(next: AcceptanceMaterial, goalId: string) {
    const current = controller.value?.document
    const result = next.results.find((item) => item.goalId === goalId)
    if (!current || !result) {
      setError('验收来源已变化，输入未覆盖新材料，请重新核对。')
      return
    }
    if (readOnly || current.version !== context.version || !sameAcceptanceSource(current, next)) {
      setError('验收来源已变化，输入未覆盖新材料，请重新核对。')
      return
    }
    // 基准是 current.results 而非 next.results：这条是 CAS 写入路径，必须以刚重读的
    // 控制器值为准，否则会把并发写入盖掉。
    controller.edit({
      ...current,
      results: upsertGoalResult(current.results, result)
    })
  }
  return {
    scope,
    session: context.session,
    worktreeId,
    metricScope,
    draft,
    controller,
    recoveryError,
    recoveryText,
    versions: catalog.versions,
    gate,
    materialProblems: catalog.materialProblems,
    version,
    error: error ?? fixed.error ?? catalog.error,
    setError,
    busy,
    ...output,
    scroll,
    document,
    plan: fixed.plan,
    readOnly,
    loadVersion,
    refreshData,
    initialize,
    saving: autosave.saving,
    retrySave: autosave.save,
    useRemoteDeletion,
    editDocument,
    editGoal
  }
}
