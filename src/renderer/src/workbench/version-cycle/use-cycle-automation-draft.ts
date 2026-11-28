import { useCallback } from 'react'
import { useAppStore } from '@/store'
import type { CycleScope } from './ports'
import { buildCyclePrompt } from './cycle-prompt'
import {
  cycleAutomationCreationKey,
  cycleAutomationHost,
  ensureCycleAutomation
} from './ensure-cycle-automation'

export function useCycleAutomationDraft({
  cycleScope,
  fixedId,
  version,
  onError
}: {
  cycleScope: CycleScope | null
  fixedId: string | null
  version: string | null
  onError(message: string): void
}) {
  return useCallback(async () => {
    if (!cycleScope || !fixedId) {
      onError('固定工作树尚未就绪，请稍后重试。')
      return
    }
    try {
      const result = await ensureCycleAutomation(cycleScope, fixedId, version)
      if (result.status === 'skipped') {
        onError(result.reason)
        return
      }
      const host = cycleAutomationHost(cycleScope)
      if (result.status === 'exists') {
        useAppStore.getState().openAutomationEditor({
          kind: 'edit',
          host,
          automationId: result.automationId
        })
        return
      }

      const prompt = await buildCyclePrompt(cycleScope, fixedId)
      useAppStore.getState().openAutomationEditor({
        kind: 'create',
        host,
        draft: {
          name: cycleScope.workflow === 'plan' ? '每周版本计划' : '每周版本验收',
          prompt,
          projectId: cycleScope.projectId,
          workspaceId: fixedId,
          workspaceMode: 'existing',
          reuseSession: false,
          creationKey: cycleAutomationCreationKey(cycleScope, version)
        }
      })
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : String(reason))
    }
  }, [cycleScope, fixedId, version, onError])
}
