import { useCallback, useState } from 'react'
import { useAppStore } from '@/store'
import { useAgentDetectionTargetForWorktree } from '@/hooks/useAgentDetectionTarget'
import { useDetectedAgents } from '@/hooks/useDetectedAgents'
import { launchAgentInNewTab } from '@/lib/launch-agent-in-new-tab'
import { activateWebRuntimeSessionWorktree } from '@/runtime/web-runtime-worktree-activation'
import type { TuiAgent } from '../../../../shared/tui-agent'
import { ensureNamedWorktree, type NativeWorkspaceScope } from './native-workspace'
import { resolveWorkbenchPromptAssets } from './cycle-prompt'

/** Fixed maintenance tree for metric definitions/scripts; opened as a native project session. */
export const METRICS_BRANCH = 'bw/metrics-refresh'
export const METRICS_WORKTREE_NAME = 'metrics-refresh'

/**
 * The one「配置指标」pipeline shared by the plan board and the overview: ensure the
 * fixed maintenance tree, inject the metrics-refresh prompt with the live catalog,
 * move the native selection to that tree, then launch an auto-submit project
 * session. Errors are thrown unchanged; each screen surfaces them in its own notice.
 */
export async function prepareMetricsSession(args: {
  baseScope: NativeWorkspaceScope
  agent: TuiAgent
}): Promise<void> {
  const { baseScope, agent } = args
  const maintenance = await ensureNamedWorktree(baseScope, METRICS_BRANCH, METRICS_WORKTREE_NAME)
  const assets = await resolveWorkbenchPromptAssets({
    ...baseScope,
    workflow: 'metrics-refresh',
    worktreeId: maintenance.id
  })
  const state = useAppStore.getState()
  state.setActiveWorktree(maintenance.id, baseScope.hostId)
  if (baseScope.runtimeOwnerEnvironmentId) {
    await activateWebRuntimeSessionWorktree({
      worktreeId: maintenance.id,
      environmentId: baseScope.runtimeOwnerEnvironmentId
    })
  }
  launchAgentInNewTab({
    agent,
    worktreeId: maintenance.id,
    prompt: assets.prompt,
    activate: true,
    promptDelivery: 'auto-submit'
  })
}

/**
 * Agent for metric setup on screens without a session-tool picker: the same
 * sources and precedence the cycle shell falls back to (configured default first,
 * then the first agent detected on the owning host).
 */
export function useMetricsSetupAgent(worktreeId: string | null): TuiAgent | null {
  const detectionTarget = useAgentDetectionTargetForWorktree(worktreeId)
  const { detectedIds } = useDetectedAgents(detectionTarget)
  const defaultAgentSetting = useAppStore((s) => s.settings?.defaultTuiAgent)
  const defaultAgent =
    defaultAgentSetting && defaultAgentSetting !== 'blank' ? defaultAgentSetting : null
  return defaultAgent ?? detectedIds?.[0] ?? null
}

export type MetricsSetupEntry = {
  prepareMetrics(): Promise<void>
  busy: boolean
  /** Action failure text for the calling screen's notice slot; null when clean. */
  notice: string | null
}

/**
 * Screen-level wiring of the shared pipeline for entries without their own agent
 * picker or notice plumbing (the overview). Readiness errors stay honest text —
 * a missing workspace or tool is reported, never silently skipped.
 */
export function useMetricsSetup(args: {
  baseScope: NativeWorkspaceScope | null
  worktreeId: string | null
}): MetricsSetupEntry {
  const { baseScope, worktreeId } = args
  const agent = useMetricsSetupAgent(worktreeId)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const prepareMetrics = useCallback(async () => {
    setNotice(null)
    setBusy(true)
    try {
      if (!baseScope) {
        throw new Error('项目工作区尚未就绪')
      }
      if (!agent) {
        throw new Error('未检测到可用会话工具，请先在设置中配置')
      }
      await prepareMetricsSession({ baseScope, agent })
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }, [baseScope, agent])
  return { prepareMetrics, busy, notice }
}
