import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AcceptanceMaterialSchema,
  type MetricReadingEvidence,
  type AcceptanceMaterial
} from '../../../../shared/workbench/version-material'
import type { VersionDocumentPort } from '../../../../shared/workbench/version-document'
import type { MetricRef } from '../../../../shared/workbench/metrics'
import { useAcceptanceDraft } from './use-acceptance-draft'
import { createAcceptanceMaterial, emptyGoalResult, sameAcceptanceSource } from './acceptance-model'
import { useMaterialAutosave } from '../version-cycle/use-material-autosave'
import type { AcceptanceBoardProps } from './AcceptanceBoard'
import { useAcceptanceSources, useFixedAcceptancePlan } from './use-acceptance-plan'
import { useAcceptanceOutput } from './use-acceptance-output'

export function useAcceptanceBoard({
  context,
  history,
  recoveryKey
}: Pick<AcceptanceBoardProps, 'context' | 'history'> & { recoveryKey: string }) {
  const scope = context.scope!
  const session = context.session
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
    initializationSuppressed,
    cancelAutomaticRead,
    loadedRefresh
  } = useAcceptanceDraft(recoveryKey, port, context.version ?? undefined, context.materialRefresh)
  const catalog = useAcceptanceSources(history, materialPort, metricScope, context.materialRefresh)
  const { versions, sources } = catalog
  const [version, setVersion] = useState(context.version ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const scroll = useRef<HTMLDivElement>(null)
  const generation = useRef(0)
  const document = draft?.document
  const fixed = useFixedAcceptancePlan(history, metricScope, document?.planRef)
  const plan = fixed.plan
  const output = useAcceptanceOutput(context, controller, draft, plan, fixed.verification, setError)
  const associated = Boolean(document && document.version === context.version)
  const readOnly = busy || Boolean(context.syncing) || !associated || !plan
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
  const source = sources.find((item) => item.version === context.version)
  useEffect(() => {
    if (
      context.syncing ||
      initializationSuppressed ||
      !source ||
      draft ||
      recoveryError ||
      loadedVersion !== context.version ||
      loadedRefresh !== (context.materialRefresh ?? 0) ||
      catalog.loadedRefresh !== (context.materialRefresh ?? 0)
    ) {
      return
    }
    let current = true
    const original = controller.value
    const planRef = {
      kind: 'committed' as const,
      version: source.version,
      cycleId: source.cycleId,
      sourceCommit: source.sourceCommit,
      revision: source.revision
    }
    void history
      .readPlan({ scope: metricScope, planRef })
      .then((selected) => {
        if (current && controller.value === original) {
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
      })
      .catch((reason) => {
        if (current) {
          setError(String(reason))
        }
      })
    return () => {
      current = false
    }
  }, [
    context.syncing,
    initializationSuppressed,
    source,
    draft,
    loadedVersion,
    loadedRefresh,
    catalog.loadedRefresh,
    context.materialRefresh,
    context.version,
    recoveryError,
    controller,
    history,
    metricScope
  ])
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
      await output.archiveStatus()
    } catch (reason) {
      setError(String(reason))
    }
  }
  async function prepare(text: string) {
    try {
      if (!session) {
        throw new Error('请先选择或开启左侧会话。')
      }
      await context.sessionPort.prepareRequest(session, text)
      setError(null)
    } catch (reason) {
      setError(String(reason))
    }
  }
  function editGoal(next: AcceptanceMaterial, goalId: string) {
    const current = controller.value?.document
    const result = next.results.find((item) => item.goalId === goalId)
    if (
      !current ||
      !result ||
      readOnly ||
      current.version !== context.version ||
      !sameAcceptanceSource(current, next)
    ) {
      setError('验收来源已变化，输入未覆盖新材料，请重新核对。')
      return
    }
    controller.edit({
      ...current,
      results: [...current.results.filter((item) => item.goalId !== goalId), result]
    })
  }
  function editReadings(
    source: AcceptanceMaterial,
    goalId: string,
    ref: MetricRef,
    readings: MetricReadingEvidence[]
  ) {
    const current = controller.value?.document
    if (!current) {
      return
    }
    const result = current.results.find((item) => item.goalId === goalId) ?? emptyGoalResult(goalId)
    editGoal(
      {
        ...source,
        results: [
          {
            ...result,
            readings: [...result.readings.filter((item) => item.ref.name !== ref.name), ...readings]
          }
        ]
      },
      goalId
    )
  }
  return {
    scope,
    session,
    worktreeId,
    metricScope,
    draft,
    controller,
    recoveryError,
    recoveryText,
    versions,
    hasPlanSource: Boolean(source),
    sourcesLoaded: catalog.loadedRefresh === (context.materialRefresh ?? 0),
    materialProblems: catalog.materialProblems,
    version,
    error: error ?? fixed.error ?? catalog.error,
    setError,
    busy,
    ...output,
    scroll,
    document,
    plan,
    readOnly,
    loadVersion,
    refreshData,
    flush: autosave.flush,
    saving: autosave.saving,
    retrySave: autosave.save,
    useRemoteDeletion,
    initializationSuppressed,
    prepare,
    editGoal,
    editReadings
  }
}
