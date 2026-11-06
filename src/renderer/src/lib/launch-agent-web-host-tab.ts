import { toast } from 'sonner'
import { useAppStore } from '@/store'
import {
  deliverCreatedWebRuntimeAgentSessionPrompt,
  createWebRuntimeSessionTerminal,
  isWebTerminalSurfaceTabId
} from '@/runtime/web-runtime-session'
import type { Tab } from '../../../shared/tab-types'
import type { TuiAgent } from '../../../shared/tui-agent'
import type { AgentPromptDelivery } from '../../../shared/agent-session-host-authority'
import { translate } from '@/i18n/i18n'
import { readHostAgentStartupSettings } from '@/runtime/agent-launch-settings/agent-launch-settings-transport'
import { getRuntimeEnvironmentRevision } from '@/runtime/runtime-environment-revision'
import { createWebRuntimeSessionTerminalResult } from '@/runtime/web-runtime-terminal-create-operation'
import { planLaunchAgentStartupPrompt } from './launch-agent-startup-prompt-plan'
import type { LaunchAgentStartupPromptPlan } from './launch-agent-startup-prompt-plan'
import { TUI_AGENT_CONFIG } from '../../../shared/tui-agent-config'
import {
  resolveTuiAgentLaunchArgs,
  resolveTuiAgentLaunchEnv
} from '../../../shared/tui-agent-launch-defaults'
import { resolveHostAgentStartupShell } from '../../../shared/windows-terminal-shell'

function removeStaleLocalAgentTabsForWebHostLaunch(worktreeId: string): void {
  const state = useAppStore.getState()
  for (const tab of state.tabsByWorktree[worktreeId] ?? []) {
    if (tab.launchAgent && !isWebTerminalSurfaceTabId(tab.id)) {
      // Why: pruning a stale local agent tab is a system close — keep it out of
      // the Cmd+Shift+T reopen stack.
      state.closeTab(tab.id, { reason: 'cleanup' })
    }
  }
}

/**
 * Launch an agent terminal on the web runtime host instead of a local tab.
 *
 * Why: paired web tabs are host-owned, so this path never creates a local tab
 * (callers return tabId: null). Local-only agent tabs cannot be closed because
 * close routes through session.tabs.close on the host, so prune them before
 * the host snapshot.
 */
export async function launchAgentInWebHostTab(args: {
  agent: TuiAgent
  worktreeId: string
  environmentId: string | null
  groupId?: string
  cwd?: string | null
  buildLegacyStartup: () => LaunchAgentStartupPromptPlan
  prompt: string
  promptDelivery: 'auto-submit' | 'draft' | 'submit-after-ready'
  agentArgs?: string | null
  launchPlatform?: NodeJS.Platform
  viewMode?: Tab['viewMode']
  activate?: boolean
  onPromptDelivered?: () => void
}): Promise<{ delivered: boolean; failureNotified: boolean; hostTabId?: string }> {
  const {
    agent,
    worktreeId,
    environmentId,
    groupId,
    cwd,
    buildLegacyStartup,
    prompt,
    promptDelivery,
    agentArgs,
    viewMode,
    onPromptDelivered
  } = args
  const hasPrompt = prompt.length > 0
  const pairingRevision = environmentId ? getRuntimeEnvironmentRevision(environmentId) : undefined
  const readHostStatus = () => {
    const entry = environmentId
      ? useAppStore.getState().runtimeStatusByEnvironmentId.get(environmentId)
      : undefined
    return entry?.snapshot?.status ?? entry?.status
  }
  const runtimeId = readHostStatus()?.runtimeId
  let startup: LaunchAgentStartupPromptPlan = planLaunchAgentStartupPrompt({
    base: {
      agent,
      cmdOverrides: {},
      agentArgs: null,
      platform: args.launchPlatform ?? 'linux',
      isRemote: true
    },
    prompt,
    promptDelivery,
    isFollowupPath: TUI_AGENT_CONFIG[agent].promptInjectionMode === 'stdin-after-start'
  })
  const structuredPromptDelivery: AgentPromptDelivery =
    promptDelivery === 'draft' ? 'draft' : 'auto-submit'
  removeStaleLocalAgentTabsForWebHostLaunch(worktreeId)
  const launch = {
    worktreeId,
    environmentId,
    expectedEnvironmentRuntimeId: runtimeId,
    targetGroupId: groupId,
    activate: args.activate !== false,
    selectWorktree: args.activate !== false,
    ...(cwd?.trim() ? { cwd } : {}),
    ...(viewMode ? { viewMode } : {}),
    agentSessionKind: 'fresh',
    launchAgent: agent,
    agent,
    ...(hasPrompt && startup.pasteDraftAfterLaunch === null ? { prompt } : {}),
    ...(hasPrompt && startup.pasteDraftAfterLaunch === null
      ? { promptDelivery: structuredPromptDelivery }
      : {}),
    ...(agentArgs !== undefined ? { agentArgs } : {}),
    legacyAgentLaunch: async () => {
      if (agentArgs === undefined && (!hasPrompt || promptDelivery === 'auto-submit')) {
        return hasPrompt && startup.pasteDraftAfterLaunch === null ? { agentPrompt: prompt } : {}
      }
      const hostSettings = environmentId
        ? await readHostAgentStartupSettings({ environmentId, pairingRevision, runtimeId }).catch(
            (error: unknown) => {
              if (error instanceof Error && error.name === 'AbortError') throw error
              return null
            }
          )
        : null
      const status = readHostStatus()
      if (
        environmentId &&
        (getRuntimeEnvironmentRevision(environmentId) !== pairingRevision ||
          (runtimeId && status?.runtimeId !== runtimeId))
      ) {
        throw new DOMException('Agent launch cancelled', 'AbortError')
      }
      if (hostSettings) {
        const platform = args.launchPlatform ?? status?.hostPlatform ?? 'linux'
        startup = planLaunchAgentStartupPrompt({
          base: {
            agent,
            cmdOverrides: hostSettings.agentCmdOverrides ?? {},
            agentArgs:
              agentArgs !== undefined
                ? agentArgs
                : resolveTuiAgentLaunchArgs(agent, hostSettings.agentDefaultArgs),
            agentEnv: resolveTuiAgentLaunchEnv(agent, hostSettings.agentDefaultEnv),
            platform,
            shell: resolveHostAgentStartupShell({
              platform,
              isRemote: true,
              hostTerminalWindowsShell: status?.terminalWindowsShell
            }),
            isRemote: true
          },
          prompt,
          promptDelivery,
          isFollowupPath: TUI_AGENT_CONFIG[agent].promptInjectionMode === 'stdin-after-start'
        })
      } else {
        // Older hosts may not expose settings; preserve their existing launch recipe.
        startup = buildLegacyStartup()
      }
      const plan = startup.startupPlan
      if (!plan) throw new Error('Could not prepare the remote agent command.')
      return {
        command: plan.launchCommand,
        env: plan.env,
        launchConfig: plan.launchConfig,
        startupCommandDelivery: plan.startupCommandDelivery
      }
    }
  } as const

  const handleCreation = ({
    outcome,
    promptDelivered
  }: {
    outcome: Awaited<ReturnType<typeof createWebRuntimeSessionTerminal>>
    promptDelivered: boolean
  }): { delivered: boolean; failureNotified: boolean; hostTabId?: string } => {
    // Why: created means the host accepted the launch, not that a local tab
    // exists; keep pruning stale local rows until the snapshot mirrors.
    removeStaleLocalAgentTabsForWebHostLaunch(worktreeId)
    if (outcome.status === 'failed') {
      toast.error(
        outcome.message ||
          translate(
            'auto.lib.launch.agent.in.new.tab.11cce5cc77',
            'Could not launch {{value0}} in a new terminal.',
            { value0: agent }
          )
      )
      return { delivered: false, failureNotified: true }
    }
    if (args.activate !== false) {
      useAppStore.getState().setActiveTabType('terminal')
    }
    if (hasPrompt && promptDelivered) {
      onPromptDelivered?.()
    }
    return { delivered: promptDelivered, failureNotified: false, hostTabId: outcome.hostTabId }
  }

  const created = await createWebRuntimeSessionTerminalResult(launch)
  const promptDelivered =
    hasPrompt &&
    (await deliverCreatedWebRuntimeAgentSessionPrompt(created, {
      agent,
      ...(startup.pasteDraftAfterLaunch !== null
        ? {
            promptAfterReady: startup.pasteDraftAfterLaunch,
            submitPrompt: startup.submitPastedPrompt,
            forcePromptPaste: true
          }
        : promptDelivery === 'draft'
          ? { launchDraft: prompt }
          : {})
    }))
  return handleCreation({ ...created, promptDelivered })
}
