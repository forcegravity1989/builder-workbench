import { useEffect, useRef, useState } from 'react'
import type { AcceptanceMaterial } from '../../../../shared/workbench/version-material'
import type { VersionHistoryPlan } from '../../../../shared/workbench/version-history'
import type { MaterialDraft, MaterialDraftController } from '../version-cycle/material-draft'
import type { ArchiveStatus, CycleTaskRead } from '../version-cycle/ports'
import type { VersionCycleContext } from '../version-cycle/VersionCycleShell'
import type { ArtifactCheck, CandidateCheck } from './acceptance-candidate-port'
import { decisionFreshness } from './acceptance-decision'
import { preparationKey, sameAcceptanceSource } from './acceptance-model'
import { deriveAcceptanceReport } from './acceptance-report'
import { captureTaskSnapshot } from './acceptance-task-evidence'

export function useAcceptanceOutput(
  context: VersionCycleContext,
  controller: MaterialDraftController<AcceptanceMaterial>,
  draft: MaterialDraft<AcceptanceMaterial> | null,
  plan: VersionHistoryPlan | null,
  onError: (error: string) => void
) {
  const document = draft?.document
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
    if (
      !current ||
      current.cycleId !== context.session?.cycleId ||
      !sameAcceptanceSource(source, current)
    ) {
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
        setArchiveResult({ key: archiveKey, status })
      }
    } catch (reason) {
      if (lifetime.active && request === lifetime.archiveRequest) {
        setArchiveResult({ key: archiveKey, status: { kind: 'unknown', reason: String(reason) } })
      }
    }
  }
  async function buildReport() {
    if (!document || !plan) {
      return
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
          plan: { kind: 'verified', checkedAt: new Date().toISOString() },
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
      }
    } catch (reason) {
      if (lifetime.active) {
        onError(String(reason))
      }
    }
  }
  return {
    archive,
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
