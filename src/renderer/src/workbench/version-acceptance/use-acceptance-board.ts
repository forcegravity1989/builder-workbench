import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AcceptanceMaterialSchema,
  type MetricReadingEvidence,
  type AcceptanceMaterial
} from '../../../../shared/workbench/version-material'
import type { VersionDocumentPort } from '../../../../shared/workbench/version-document'
import type { MetricRef } from '../../../../shared/workbench/metrics'
import { metricRefKey } from '../../../../shared/workbench/metrics'
import { useAcceptanceDraft } from './use-acceptance-draft'
import { createAcceptanceMaterial, emptyGoalResult, sameAcceptanceSource } from './acceptance-model'
import type { AcceptanceBoardProps } from './AcceptanceBoard'
import { useAcceptanceSources, useFixedAcceptancePlan } from './use-acceptance-plan'
import { useAcceptanceOutput } from './use-acceptance-output'

export function useAcceptanceBoard({
  context,
  history,
  recoveryKey
}: Pick<AcceptanceBoardProps, 'context' | 'history'> & { recoveryKey: string }) {
  const scope = context.scope!
  const session = context.session!
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
  const { draft, controller, recoveryError, recoveryText, clear, cancelAutomaticRead } =
    useAcceptanceDraft(recoveryKey, port, session.version)
  const catalog = useAcceptanceSources(history, materialPort, metricScope)
  const { versions, sources } = catalog
  const [version, setVersion] = useState('')
  const [planChoice, setPlanChoice] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const scroll = useRef<HTMLDivElement>(null)
  const generation = useRef(0)
  const document = draft?.document
  const fixed = useFixedAcceptancePlan(history, metricScope, document?.planRef)
  const plan = fixed.plan
  const output = useAcceptanceOutput(context, controller, draft, plan, setError)
  const archive = output.archive
  const sameRun = document?.cycleId === session.cycleId
  const readOnly = !sameRun || !plan
  useEffect(
    () => () => {
      generation.current++
    },
    []
  )
  useEffect(() => {
    if (document?.version) {
      setVersion(document.version)
    }
  }, [document?.version])
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
    cancelAutomaticRead()
    const token = ++generation.current
    setBusy(true)
    try {
      const saved = await port.read(value)
      if (token !== generation.current) {
        return
      }
      setVersion(value)
      setPlanChoice('')
      if (saved) {
        controller.restore({
          document: saved.document,
          expectedRevision: saved.revision,
          dirty: false
        })
        setError(null)
      } else {
        clear()
        setError('此版本尚无验收材料。请选择固定计划，明确开始本次验收。')
      }
      await context.associateVersion(value)
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
  async function begin() {
    const source = sources.find(
      (item) => `${item.sourceCommit}:${item.version}:${item.cycleId}` === planChoice
    )
    if (!source) {
      return
    }
    if (
      draft &&
      draft.document.cycleId !== session.cycleId &&
      (draft.dirty || !(archive.kind === 'merged' && archive.matchesRevision))
    ) {
      setError('上次验收尚未核对已归档；请先继续原会话归档，保留原材料。')
      return
    }
    const token = ++generation.current
    const original = controller.value
    setBusy(true)
    try {
      const planRef = {
        kind: 'committed' as const,
        version: source.version,
        cycleId: source.cycleId,
        revision: source.revision,
        sourceCommit: source.sourceCommit
      }
      const selected = await history.readPlan({ scope: metricScope, planRef })
      if (token !== generation.current || controller.value !== original) {
        return
      }
      const next = createAcceptanceMaterial({ planRef, plan: selected, cycleId: session.cycleId })
      controller.restore({
        document: next,
        expectedRevision: draft?.expectedRevision ?? null,
        dirty: true
      })
      setError(null)
      await context.associateVersion(source.version)
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
  async function prepare(text: string) {
    try {
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
      current.cycleId !== session.cycleId ||
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
            readings: [
              ...result.readings.filter((item) => metricRefKey(item.ref) !== metricRefKey(ref)),
              ...readings
            ]
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
    sources,
    historyProblems: catalog.problems,
    refreshCatalog: catalog.refresh,
    version,
    planChoice,
    setPlanChoice,
    error: error ?? fixed.error ?? catalog.error,
    setError,
    busy,
    ...output,
    scroll,
    document,
    plan,
    sameRun,
    readOnly,
    loadVersion,
    begin,
    prepare,
    editGoal,
    editReadings
  }
}
