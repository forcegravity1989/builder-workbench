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
 * Prefills the native automation editor for one cycle workflow: existing fixed
 * tree, a fresh session per run, and a prompt without any frozen cycleId.
 * Enablement, time and tool stay human-confirmed in the native editor.
 */
export function useCycleAutomationDraft({
  cycleScope,
  fixedId,
  workflow,
  onError
}: {
  cycleScope: CycleScope | null
  fixedId: string | null
  workflow: VersionWorkflow
  onError(message: string | null): void
}) {
  return useCallback(async () => {
    if (!cycleScope || !fixedId) {
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
          reuseSession: false
        }
      })
      onError(null)
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : String(reason))
    }
  }, [cycleScope, fixedId, workflow, onError])
}
