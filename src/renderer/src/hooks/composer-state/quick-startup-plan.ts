import type { GlobalSettings } from '../../../../shared/global-settings-types'
import type { TuiAgent } from '../../../../shared/tui-agent'
import type { AgentStartupShell } from '../../../../shared/tui-agent-startup-shell'
import type { AgentStartedTelemetry } from '@/lib/worktree-startup-payload'
import type { WorktreeCreationRequest } from '@/lib/pending-worktree-creation'
import type { AgentStartupPlan } from '@/lib/tui-agent-startup'
import { buildAgentDraftLaunchPlan, buildAgentStartupPlan } from '@/lib/tui-agent-startup'
import {
  resolveTuiAgentLaunchArgs,
  resolveTuiAgentLaunchEnv
} from '../../../../shared/tui-agent-launch-defaults'
import { resolveInitialNativeChatSessionOptions } from '@/components/native-chat/native-chat-launch-session-options'
import { isNativeChatTranscriptLocalReadable } from '@/lib/native-chat-transcript-readability'
import { tuiAgentToAgentKind } from '@/lib/telemetry'
import { useAppStore } from '@/store'
import {
  planAgentSessionLaunch,
  type AgentSessionLaunchRequest
} from '@/lib/agent-session-launch-plan'
import { resolveQuickCreateLinkedWorkItemPrompt } from '@/lib/linked-work-item-context'
import type { LinkedWorkItemSummary } from '@/lib/new-workspace'
import {
  prepareHostAgentStartupInputs,
  type PreparedHostAgentStartup
} from '@/lib/host-agent-startup-inputs'

export type QuickComposerStartupInput = {
  agent: TuiAgent | null
  prompt: string
  draftPrompt: string | null | undefined
  settings: GlobalSettings | null | undefined
  repoConnectionId: string | null | undefined
  platform: NodeJS.Platform
  shell: AgentStartupShell | null | undefined
  isRemote: boolean
  telemetrySource: WorktreeCreationRequest['telemetrySource']
  hostStartup?: PreparedHostAgentStartup
}

export type QuickComposerStartup = {
  startupPlan: AgentStartupPlan | null
  backendStartup: WorktreeCreationRequest['startup']
  telemetry: AgentStartedTelemetry | null
}

type PreparedQuickComposerStartup = QuickComposerStartup & {
  agentLaunchOwner: PreparedHostAgentStartup['owner']
  quickPrompt: string
  quickDraftPrompt: string | null
}

export async function prepareQuickComposerStartup(
  input: Omit<QuickComposerStartupInput, 'hostStartup' | 'prompt' | 'draftPrompt'> & {
    linkedWorkItem: LinkedWorkItemSummary | null
    note: string
    runtimeEnvironmentId: string | null | undefined
    usesEphemeralVm: boolean
  }
): Promise<PreparedQuickComposerStartup> {
  const { agent, linkedWorkItem: submitLinkedWorkItem } = input
  const promptLinkedWorkItem = agent === null ? null : submitLinkedWorkItem
  const { prompt: quickPrompt, draftPrompt: quickDraftPrompt } =
    resolveQuickCreateLinkedWorkItemPrompt(promptLinkedWorkItem, input.note)
  const hostStartup = await prepareHostAgentStartupInputs({
    environmentId: input.usesEphemeralVm ? null : input.runtimeEnvironmentId?.trim(),
    agent: input.agent,
    settings: input.settings,
    platform: input.platform,
    shell: input.shell,
    isRemote: input.isRemote
  })
  return {
    ...buildQuickComposerStartup({
      ...input,
      prompt: quickPrompt,
      draftPrompt: quickDraftPrompt,
      hostStartup
    }),
    agentLaunchOwner: hostStartup.owner,
    quickPrompt,
    quickDraftPrompt
  }
}

export function resolveQuickComposerAgentLaunchRoute(
  agent: TuiAgent | null,
  request: Omit<AgentSessionLaunchRequest, 'agent'>
): WorktreeCreationRequest['agentLaunchRoute'] {
  return agent
    ? planAgentSessionLaunch(useAppStore.getState(), { ...request, agent }).route
    : 'terminal-tui'
}

export function buildQuickComposerStartup(input: QuickComposerStartupInput): QuickComposerStartup {
  const { agent, draftPrompt, prompt, settings } = input
  const launchInputs = input.hostStartup?.inputs ?? {
    cmdOverrides: settings?.agentCmdOverrides ?? {},
    agentArgs: agent ? resolveTuiAgentLaunchArgs(agent, settings) : undefined,
    agentEnv: agent ? resolveTuiAgentLaunchEnv(agent, settings) : undefined,
    platform: input.platform,
    shell: input.shell ?? undefined,
    isRemote: input.isRemote
  }
  const sessionOptions =
    agent === null || input.hostStartup?.hostOwned
      ? undefined
      : resolveInitialNativeChatSessionOptions(
          {
            experimentalNativeChat: settings?.experimentalNativeChat,
            openAgentTabsInChatByDefault: settings?.openAgentTabsInChatByDefault,
            nativeChatSessionOptions: settings?.nativeChatSessionOptions
          },
          {
            agent,
            ...(draftPrompt
              ? { promptDelivery: 'draft' as const, launchDraftText: draftPrompt }
              : {}),
            nativeChatTranscriptIsLocalReadable: isNativeChatTranscriptLocalReadable(
              input.repoConnectionId
            )
          }
        )
  const draftLaunchPlan =
    agent === null || !draftPrompt
      ? null
      : buildAgentDraftLaunchPlan({
          agent,
          draft: draftPrompt,
          sessionOptions,
          ...launchInputs
        })
  let startupPlan: AgentStartupPlan | null = null
  if (draftLaunchPlan) {
    startupPlan = {
      agent: draftLaunchPlan.agent,
      launchCommand: draftLaunchPlan.launchCommand,
      expectedProcess: draftLaunchPlan.expectedProcess,
      followupPrompt: null,
      launchConfig: draftLaunchPlan.launchConfig,
      ...(draftLaunchPlan.sessionOptions ? { sessionOptions: draftLaunchPlan.sessionOptions } : {}),
      ...(draftLaunchPlan.startupCommandDelivery
        ? { startupCommandDelivery: draftLaunchPlan.startupCommandDelivery }
        : {}),
      ...(draftLaunchPlan.env ? { env: draftLaunchPlan.env } : {})
    }
  } else if (agent !== null) {
    startupPlan = buildAgentStartupPlan({
      agent,
      prompt,
      sessionOptions,
      ...launchInputs,
      allowEmptyPromptLaunch: true
    })
    if (startupPlan && draftPrompt) {
      startupPlan.draftPrompt = draftPrompt
    }
  }
  const telemetry: AgentStartedTelemetry | null =
    agent === null
      ? null
      : {
          agent_kind: tuiAgentToAgentKind(agent),
          launch_source:
            input.telemetrySource === 'onboarding' ? 'onboarding' : 'new_workspace_composer',
          request_kind: 'new'
        }
  const backendStartup =
    startupPlan && !startupPlan.draftPrompt && !startupPlan.followupPrompt
      ? {
          command: startupPlan.launchCommand,
          ...(startupPlan.env ? { env: startupPlan.env } : {}),
          launchConfig: startupPlan.launchConfig,
          ...(agent ? { launchAgent: agent } : {}),
          ...(startupPlan.startupCommandDelivery
            ? { startupCommandDelivery: startupPlan.startupCommandDelivery }
            : {}),
          ...(telemetry ? { telemetry } : {})
        }
      : undefined
  return { startupPlan, backendStartup, telemetry }
}
