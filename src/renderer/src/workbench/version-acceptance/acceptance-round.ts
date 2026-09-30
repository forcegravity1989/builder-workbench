import type { AcceptanceMaterial } from '../../../../shared/workbench/version-material'
import type {
  VersionHistoryPort,
  VersionTreePlan
} from '../../../../shared/workbench/version-history'
import type { MaterialDraft, MaterialDraftController } from '../version-cycle/material-draft'
import { createAcceptanceMaterial } from './acceptance-model'

/** Builds the in-memory acceptance round from the plan file in the selected version folder. */
export async function startAcceptanceRound(input: {
  sources: readonly VersionTreePlan[]
  planChoice: string
  contextVersion: string | null
  draft: MaterialDraft<AcceptanceMaterial> | null
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
  // 归档状态是提醒信号，不是开轮门：固定分支上继续改新的或改老的都不被上一轮
  // 的合入状态卡死。唯一的门是未保存修改——防止新轮草稿静默覆盖人的输入。
  if (input.draft?.dirty) {
    input.setError('当前轮有未保存修改；请先保存或放弃本地修改，再开始下一轮。')
    return
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
