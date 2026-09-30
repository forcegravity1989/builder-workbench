import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AcceptanceMaterialSchema,
  type MetricReadingEvidence,
  type AcceptanceMaterial
} from '../../../../shared/workbench/version-material'
import type { VersionDocumentPort } from '../../../../shared/workbench/version-document'
import type { MetricRef } from '../../../../shared/workbench/metrics'
import { metricRefKey } from '../../../../shared/workbench/metrics'
import { isArchivedMaterial } from '../../../../shared/workbench/version-archive'
import { useAcceptanceDraft } from './use-acceptance-draft'
import { emptyGoalResult, sameAcceptanceSource } from './acceptance-model'
import { startAcceptanceRound } from './acceptance-round'
import type { AcceptanceBoardProps } from './AcceptanceBoard'
import {
  useAcceptanceSources,
  useFixedAcceptancePlan,
  useOpenAcceptanceRound
} from './use-acceptance-plan'
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
  const { draft, controller, recoveryError, recoveryText, cancelAutomaticRead, clear } =
    useAcceptanceDraft(recoveryKey, port, context.version ?? undefined)
  const catalog = useAcceptanceSources(history, materialPort, metricScope)
  const { versions, sources } = catalog
  const [version, setVersion] = useState(context.version ?? '')
  const [planChoice, setPlanChoice] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const scroll = useRef<HTMLDivElement>(null)
  const generation = useRef(0)
  const document = draft?.document
  const fixed = useFixedAcceptancePlan(history, metricScope, document?.planRef)
  const plan = fixed.plan
  const output = useAcceptanceOutput(context, controller, draft, plan, fixed.verification, setError)
  const archive = output.archive
  const associated = Boolean(document && document.version === context.version)
  /** Host truth for the saved revision; a stale dirty draft cannot bypass a confirmed archive. */
  const archived = Boolean(
    document &&
    draft?.expectedRevision &&
    isArchivedMaterial(archive, {
      workflow: 'acceptance',
      version: document.version,
      cycleId: document.cycleId,
      revision: draft.expectedRevision
    })
  )
  const readOnly = busy || !associated || !plan || archived || output.archivePending
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
    if (original?.dirty) {
      setError('当前草稿尚未保存，请先保存再切换版本。')
      return
    }
    cancelAutomaticRead()
    const token = ++generation.current
    setBusy(true)
    try {
      await port.read(value)
      if (token !== generation.current) {
        return
      }
      if (controller.value !== original) {
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
  /** Escape hatch for a stale dirty draft over a confirmed archive: re-read host truth. */
  async function discardLocal() {
    const current = controller.value
    if (!current) {
      return
    }
    cancelAutomaticRead()
    const token = ++generation.current
    setBusy(true)
    try {
      const saved = await port.read(current.document.version)
      if (token !== generation.current) {
        return
      }
      if (saved) {
        controller.restore({
          document: saved.document,
          expectedRevision: saved.revision,
          dirty: false
        })
      } else {
        clear()
      }
      setError(null)
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
  function begin() {
    return startAcceptanceRound({
      sources,
      planChoice,
      contextVersion: context.version,
      draft,
      archive,
      history,
      scope: metricScope,
      controller,
      generation,
      setBusy,
      setError
    })
  }
  useOpenAcceptanceRound({
    document,
    busy,
    contextVersion: context.version,
    sources,
    planChoice,
    loadVersion,
    begin
  })
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
    materialProblems: catalog.materialProblems,
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
    archived,
    readOnly,
    loadVersion,
    discardLocal,
    begin,
    prepare,
    editGoal,
    editReadings
  }
}
