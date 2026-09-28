import { useCallback } from 'react'
import { useAppStore } from '@/store'
import type { StableAutomationHostRef } from '../../../../shared/automation-owner-ref'
import { parseExecutionHostId } from '../../../../shared/execution-host'
import type { VersionWorkflow } from '../../../../shared/workbench/version-document'
import type { CycleScope } from './ports'
import { buildCyclePrompt } from './cycle-prompt'

/** Automation ownership follows the worktree's native host identity, never the current focus. */
export function cycleAutomationHost(scope: CycleScope): StableAutomationHostRef {
  if (scope.runtimeOwnerEnvironmentId) {
    return {
      authority: { kind: 'runtime', environmentId: scope.runtimeOwnerEnvironmentId },
      selector: { kind: 'self' }
    }
  }
  const host = parseExecutionHostId(scope.hostId)
  if (host?.kind === 'ssh') {
    return { authority: { kind: 'desktop' }, selector: { kind: 'ssh', targetId: host.targetId } }
  }
  return { authority: { kind: 'desktop' }, selector: { kind: 'self' } }
}

/**
 * Opens the native automation editor for one cycle workflow. When BW already
 * registered an entry (existingId), it opens that record for editing — BW never
 * re-prefills over human-owned fields. Otherwise it prefills a create draft:
 * existing fixed tree, a fresh session per run, a prompt without any frozen
 * cycleId, and the BW creationKey so a manual save dedupes with `ensureCycleAutomation`.
 * Enablement, time and tool stay human-confirmed in the native editor.
 */
export function useCycleAutomationDraft({
  cycleScope,
  fixedId,
  workflow,
  existingId,
  creationKey,
  onError
}: {
  cycleScope: CycleScope | null
  fixedId: string | null
  workflow: VersionWorkflow
  existingId: string | null
  creationKey: string | null
  onError(message: string | null): void
}) {
  return useCallback(async () => {
    if (!cycleScope) {
      onError('固定工作树尚未就绪，请稍后重试。')
      return
    }
    if (existingId) {
      useAppStore.getState().openAutomationEditor({
        kind: 'edit',
        host: cycleAutomationHost(cycleScope),
        automationId: existingId
      })
      onError(null)
      return
    }
    if (!fixedId) {
      onError('固定工作树尚未就绪，请稍后重试。')
      return
    }
    try {
      const prompt = await buildCyclePrompt(cycleScope, fixedId)
      useAppStore.getState().openAutomationEditor({
        kind: 'create',
        host: cycleAutomationHost(cycleScope),
        draft: {
          name: workflow === 'plan' ? '每周版本计划' : '每周版本验收',
          prompt,
          projectId: cycleScope.projectId,
          workspaceId: fixedId,
          workspaceMode: 'existing',
          reuseSession: false,
          ...(creationKey ? { creationKey } : {})
        }
      })
      onError(null)
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : String(reason))
    }
  }, [cycleScope, fixedId, workflow, existingId, creationKey, onError])
}
