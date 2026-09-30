import type { AcceptanceMaterial } from '../../../../shared/workbench/version-material'
import type {
  VersionHistoryPort,
  VersionHistorySource
} from '../../../../shared/workbench/version-history'
import {
  isArchivedMaterial,
  type ArchiveStatus
} from '../../../../shared/workbench/version-archive'
import type { MaterialDraft, MaterialDraftController } from '../version-cycle/material-draft'
import { createAcceptanceMaterial } from './acceptance-model'

/** Builds the in-memory acceptance round from the plan file in the selected version folder. */
export async function startAcceptanceRound(input: {
  sources: readonly VersionHistorySource[]
  planChoice: string
  contextVersion: string | null
  draft: MaterialDraft<AcceptanceMaterial> | null
  archive: ArchiveStatus
  history: VersionHistoryPort
  scope: { repoId: string; worktreeId: string; hostId: string }
  controller: MaterialDraftController<AcceptanceMaterial>
  generation: { current: number }
  setBusy(value: boolean): void
  setError(value: string | null): void
}) {
  const source = input.sources.find(
    (item) => `${item.sourceCommit}:${item.version}:${item.cycleId}` === input.planChoice
  )
  if (!source || source.version !== input.contextVersion) {
    return
  }
  if (input.draft) {
    const confirmed = Boolean(
      input.draft.expectedRevision &&
      isArchivedMaterial(input.archive, {
        workflow: 'acceptance',
        version: input.draft.document.version,
        cycleId: input.draft.document.cycleId,
        revision: input.draft.expectedRevision
      })
    )
    if (confirmed && input.draft.dirty) {
      input.setError('本轮验收已归档，未保存的本地修改不能写入；请放弃本地修改后开始下一轮。')
      return
    }
    if (!confirmed) {
      input.setError('本轮验收尚未归档，请继续当前材料；归档后可开始下一轮。')
      return
    }
  }
  const token = ++input.generation.current
  const original = input.controller.value
  input.setBusy(true)
  try {
    const planRef = {
      kind: 'committed' as const,
      version: source.version,
      cycleId: source.cycleId,
      revision: source.revision,
      sourceCommit: source.sourceCommit
    }
    const selected = await input.history.readPlan({ scope: input.scope, planRef })
    if (token !== input.generation.current || input.controller.value !== original) {
      return
    }
    input.controller.restore({
      document: createAcceptanceMaterial({
        planRef,
        plan: selected,
        cycleId: crypto.randomUUID()
      }),
      expectedRevision: input.draft?.expectedRevision ?? null,
      dirty: true
    })
    input.setError(null)
  } catch (reason) {
    if (token === input.generation.current) {
      input.setError(String(reason))
    }
  } finally {
    if (token === input.generation.current) {
      input.setBusy(false)
    }
  }
}
