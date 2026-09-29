import { useEffect, useRef, useState } from 'react'
import type { AcceptanceMaterial } from '../../../../shared/workbench/version-material'
import type { VersionHistoryPlan } from '../../../../shared/workbench/version-history'
import type { MaterialDraft, MaterialDraftController } from '../version-cycle/material-draft'
import type { ArchiveStatus, CycleTaskRead } from '../version-cycle/ports'
import type { VersionCycleContext } from '../version-cycle/cycle-context'
import type { ArtifactCheck, CandidateCheck } from './acceptance-candidate-port'
import { decisionFreshness } from './acceptance-decision'
import { preparationKey, sameAcceptanceSource, type EvidenceCheck } from './acceptance-model'
import { deriveAcceptanceReport } from './acceptance-report'
import { captureTaskSnapshot } from './acceptance-task-evidence'
import type { ArchivedMaterial } from '../../../../shared/workbench/version-archive'
import { archiveSignal, decisionSignal, preparationSignal } from './acceptance-journey'
import type { DecisionFreshness } from './acceptance-decision'

export function useAcceptanceOutput(
  context: VersionCycleContext,
  controller: MaterialDraftController<AcceptanceMaterial>,
  draft: MaterialDraft<AcceptanceMaterial> | null,
  plan: VersionHistoryPlan | null,
  planVerification: EvidenceCheck,
  onError: (error: string) => void
) {
  const document = draft?.document
  const [decisionResult, setDecisionResult] = useState<{
    document: AcceptanceMaterial
    plan: VersionHistoryPlan
    states: Record<string, DecisionFreshness>
  } | null>(null)
  useEffect(() => {
    if (!document || !plan) {
      return
    }
    let current = true
    void Promise.all(
      plan.document.goals.map(
        async (goal) =>
          [goal.goalId, await decisionFreshness(document, plan.document, goal.goalId)] as const
      )
    )
      .then((states) => {
        if (current) {
          setDecisionResult({
            document,
            plan,
            states: Object.fromEntries(states)
          })
        }
      })
      .catch(() => {
        if (current) {
          setDecisionResult(null)
        }
      })
    return () => {
      current = false
    }
  }, [document, plan])
  const [checks, setChecks] = useState<{
    key: string
    candidate: CandidateCheck
    artifacts: ArtifactCheck[]
  } | null>(null)
  const [report, setReport] = useState<{
    document: AcceptanceMaterial
    revision: string | null
    markdown: string
  } | null>(null)
  const [archiveResult, setArchiveResult] = useState<{ key: string; status: ArchiveStatus } | null>(
    null
  )
  const lifetime = useRef({ active: true, archiveRequest: 0 }).current
  useEffect(() => {
    lifetime.active = true
    return () => {
      lifetime.active = false
    }
  }, [lifetime])
  const archiveKey = JSON.stringify([document?.version, document?.cycleId, draft?.expectedRevision])
  const archive: ArchiveStatus =
    archiveResult?.key === archiveKey
      ? archiveResult.status
      : { kind: 'unknown', reason: '归档状态未读取' }
  const archiveMaterial: ArchivedMaterial | null =
    document && draft?.expectedRevision
      ? {
          workflow: 'acceptance',
          version: document.version,
          cycleId: document.cycleId,
          revision: draft.expectedRevision
        }
      : null
  /** First read for the opened material is in flight; editing stays disabled until it settles. */
  const archivePending = Boolean(archiveMaterial) && archiveResult === null
  const hasArchiveIdentity = archiveMaterial !== null
  const autoArchiveKey = useRef<string | null>(null)
  const archiveRead = useRef(archiveStatus)
  archiveRead.current = archiveStatus
  useEffect(() => {
    if (!hasArchiveIdentity || autoArchiveKey.current === archiveKey) {
      return
    }
    autoArchiveKey.current = archiveKey
    void archiveRead.current()
  }, [archiveKey, hasArchiveIdentity])
  const verified = document && checks?.key === preparationKey(document) ? checks : null
  const decisionStates =
    decisionResult?.document === document && decisionResult?.plan === plan
      ? (decisionResult?.states ?? null)
      : null
  function onChecks(
    source: AcceptanceMaterial,
    candidate: CandidateCheck,
    artifacts: ArtifactCheck[]
  ) {
    const current = controller.value?.document
    if (current && preparationKey(source) === preparationKey(current)) {
      setChecks({ key: preparationKey(current), candidate, artifacts })
    }
  }
  function saveTaskSnapshot(source: AcceptanceMaterial, reads: CycleTaskRead[]) {
    const current = controller.value?.document
    if (!current || current.version !== context.version || !sameAcceptanceSource(source, current)) {
      throw new Error('验收来源已变化，任务快照未覆盖新材料。')
    }
    controller.edit({
      ...current,
      taskSnapshot: captureTaskSnapshot(reads)
    })
  }
  async function archiveStatus() {
    if (!document || !draft?.expectedRevision) {
      return
    }
    const request = ++lifetime.archiveRequest
    try {
      const status = await context.archivePort.readStatus({
        ...context.scope!,
        worktreeId: context.worktreeId!,
        version: document.version,
        cycleId: document.cycleId,
        revision: draft.expectedRevision
      })
      if (lifetime.active && request === lifetime.archiveRequest) {
        setArchiveResult({
          key: archiveKey,
          status: status ?? { kind: 'unknown', reason: '归档读取没有返回状态' }
        })
      }
    } catch (reason) {
      if (lifetime.active && request === lifetime.archiveRequest) {
        setArchiveResult({ key: archiveKey, status: { kind: 'unknown', reason: String(reason) } })
      }
    }
  }
  /** Returns the derived markdown, or null when nothing honest could be produced. */
  async function buildReport(): Promise<string | null> {
    if (!document || !plan) {
      return null
    }
    try {
      const decisions = Object.fromEntries(
        await Promise.all(
          plan.document.goals.map(async (goal) => [
            goal.goalId,
            await decisionFreshness(document, plan.document, goal.goalId)
          ])
        )
      )
      const verified = checks?.key === preparationKey(document) ? checks : null
      const output = deriveAcceptanceReport({
        document,
        plan: plan.document,
        revision: draft?.dirty ? '未保存草稿' : (draft?.expectedRevision ?? '未保存'),
        verification: {
          plan: planVerification,
          candidate: verified?.candidate ?? { kind: 'unknown', reason: '候选尚未核对' },
          artifacts: verified?.artifacts,
          decisions
        }
      })
      if (lifetime.active && controller.value?.document === document) {
        setReport({
          document,
          revision: draft?.expectedRevision ?? null,
          markdown: output.markdown
        })
        return output.markdown
      }
      return null
    } catch (reason) {
      if (lifetime.active) {
        onError(String(reason))
      }
      return null
    }
  }
  const decisionSummary = (() => {
    if (!document || !plan) {
      return { goals: 0, pending: 0, notMet: 0 }
    }
    let pending = 0
    let notMet = 0
    for (const goal of plan.document.goals) {
      const result = document.results.find((item) => item.goalId === goal.goalId)
      const freshness = decisionStates?.[goal.goalId] ?? null
      if (!result?.decision || result.decision.outcome === 'pending' || freshness === 'changed') {
        pending++
      } else if (result.decision.outcome === 'not-met') {
        notMet++
      }
    }
    return { goals: plan.document.goals.length, pending, notMet }
  })()
  return {
    archive,
    archiveMaterial,
    archivePending,
    decisionSummary,
    journey: {
      preparation: preparationSignal(document, planVerification, verified),
      decisions: decisionSignal(document, plan?.document, decisionStates),
      archive: archiveSignal(archive, archiveMaterial)
    },
    archiveStatus,
    onChecks,
    saveTaskSnapshot,
    buildReport,
    report:
      report?.document === document && report?.revision === draft?.expectedRevision
        ? report?.markdown
        : null
  }
}
