import { toast } from 'sonner'
import { getConnectionId } from '@/lib/connection-context'
import { focusTerminalTabSurface } from '@/lib/focus-terminal-tab-surface'
import { findGithubPrWorkspaceAttachment } from '@/lib/github-work-item-workspace-attachment'
import { launchAgentInNewTab } from '@/lib/launch-agent-in-new-tab'
import { launchWorkItemDirect } from '@/lib/launch-work-item-direct'
import { getLocalProjectExecutionRuntimeContext } from '@/lib/local-preflight-context'
import { CLIENT_PLATFORM } from '@/lib/new-workspace'
import { planAgentCliArgsSuffix } from '@/lib/tui-agent-startup'
import { readSourceControlLaunchRecipeAgentId } from '@/lib/source-control-launch-agent-selection'
import { resolveSourceControlLaunchPlatform } from '@/lib/source-control-launch-platform'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import { useAppStore } from '@/store'
import { resolveSourceControlActionRecipe } from '../../../shared/source-control-ai'
import {
  DEFAULT_SOURCE_CONTROL_ACTION_COMMAND_TEMPLATES,
  renderSourceControlActionCommandTemplate
} from '../../../shared/source-control-ai-actions'
import type { GitHubWorkItem } from '../../../shared/github/work-item-types'
import type { WorkspaceSource as WorkspaceCreateTelemetrySource } from '../../../shared/workspace-source'
import type { LaunchSource } from '../../../shared/telemetry-events'
import { translate } from '@/i18n/i18n'
import { getRuntimeEnvironmentRevision } from '@/runtime/runtime-environment-revision'
import { getRuntimeEnvironmentIdForWorktree } from '@/lib/worktree-runtime-owner'
import { getRepoExecutionHostId, parseExecutionHostId } from '../../../shared/execution-host'
import { lastVerifiedRuntimeStatus } from '../../../shared/runtime-host-status'
import { getAgentDetectionTargetKeyForWorktree } from '@/hooks/useAgentDetectionTarget'
import { showClientCreationActionError } from '@/lib/client-creation-action-error'
import { pickExistingWorktreeAgent, resolveSavedAgentOverride } from './fix-checks-agent-selection'

type StartFixChecksAgentArgs = {
  repoId: string
  basePrompt: string
  item?: GitHubWorkItem
  worktreeId?: string | null
  groupId?: string | null
  launchSource: LaunchSource
  telemetrySource?: WorkspaceCreateTelemetrySource
  openModalFallback?: () => void
}

export async function startFixChecksAgent(args: StartFixChecksAgentArgs): Promise<boolean> {
  const store = useAppStore.getState()
  const repo = store.repos.find((candidate) => candidate.id === args.repoId) ?? null
  const recipe = resolveSourceControlActionRecipe({
    settings: store.settings,
    repo,
    actionId: 'fixChecks'
  })
  const savedAgentId = readSourceControlLaunchRecipeAgentId(recipe)
  const commandInput = renderSourceControlActionCommandTemplate(
    recipe.commandInputTemplate ?? DEFAULT_SOURCE_CONTROL_ACTION_COMMAND_TEMPLATES.fixChecks,
    { basePrompt: args.basePrompt }
  ).trim()
  if (!commandInput) {
    toast.error(
      translate(
        'auto.lib.fix.checks.agent.launch.9f00d7df0c',
        'Fix checks prompt is empty. Update Source Control AI settings.'
      )
    )
    return false
  }

  const attachedWorkspace =
    args.worktreeId || !args.item
      ? null
      : findGithubPrWorkspaceAttachment(store.allWorktrees(), args.repoId, args.item.number)
  const targetWorktreeId = args.worktreeId ?? attachedWorkspace?.id ?? null
  const getOwnerKey = (): string | undefined => {
    const current = useAppStore.getState()
    const currentRepo = current.repos.find((candidate) => candidate.id === args.repoId)
    const route = targetWorktreeId
      ? getAgentDetectionTargetKeyForWorktree(current, targetWorktreeId)
      : currentRepo
        ? getRepoExecutionHostId(currentRepo)
        : undefined
    if (
      route === undefined ||
      (targetWorktreeId &&
        !current.allWorktrees().some((worktree) => worktree.id === targetWorktreeId))
    ) {
      return undefined
    }
    const host = parseExecutionHostId(route)
    const environmentId = targetWorktreeId
      ? getRuntimeEnvironmentIdForWorktree(current, targetWorktreeId)
      : host?.kind === 'runtime'
        ? host.environmentId
        : null
    return JSON.stringify([
      route,
      environmentId && getRuntimeEnvironmentRevision(environmentId),
      environmentId && current.runtimeStatusByEnvironmentId.get(environmentId)?.status?.runtimeId
    ])
  }
  const ownerKey = getOwnerKey()
  const assertOwner = (): void => {
    if (ownerKey === undefined || getOwnerKey() !== ownerKey) {
      throw new DOMException('Agent launch cancelled', 'AbortError')
    }
  }
  if (targetWorktreeId) {
    const targetWorktree = store.allWorktrees().find((worktree) => worktree.id === targetWorktreeId)
    if (!targetWorktree) {
      toast.error(
        translate(
          'auto.lib.fix.checks.agent.launch.dfb4dd7c00',
          'Unable to find the workspace attached to these checks.'
        )
      )
      return false
    }
    const targetConnectionId = getConnectionId(targetWorktreeId) ?? repo?.connectionId ?? null
    const agent = await pickExistingWorktreeAgent(
      targetWorktreeId,
      savedAgentId,
      repo?.connectionId,
      assertOwner
    ).catch((error: unknown) => {
      showClientCreationActionError(error)
      return null
    })
    if (!agent || ownerKey === undefined || getOwnerKey() !== ownerKey) {
      return false
    }
    const environmentId = getRuntimeEnvironmentIdForWorktree(
      useAppStore.getState(),
      targetWorktreeId
    )
    const launchPlatform = environmentId
      ? lastVerifiedRuntimeStatus(
          useAppStore.getState().runtimeStatusByEnvironmentId.get(environmentId)
        )?.hostPlatform
      : resolveSourceControlLaunchPlatform({
          connectionId: targetConnectionId,
          worktreePath: targetWorktree.path,
          projectRuntime: targetConnectionId
            ? undefined
            : getLocalProjectExecutionRuntimeContext(store, targetWorktreeId, CLIENT_PLATFORM)
        })
    if (!launchPlatform) {
      toast.error(
        translate(
          'auto.lib.fix.checks.agent.launch.822bf52295',
          'Unable to resolve the workspace launch platform.'
        )
      )
      return false
    }
    const agentArgsPlan = planAgentCliArgsSuffix(
      recipe.agentArgs,
      launchPlatform === 'win32' ? 'powershell' : 'posix'
    )
    if (!agentArgsPlan.ok) {
      toast.error(agentArgsPlan.error)
      return false
    }
    // launchAgentInNewTab below creates the surface; seeding here would add a stray shell.
    if (!activateAndRevealWorktree(targetWorktreeId, { providesInitialSurface: true })) {
      toast.error(
        translate(
          'auto.lib.fix.checks.agent.launch.03c1d61f83',
          'Unable to open the workspace attached to these checks.'
        )
      )
      return false
    }
    const result = launchAgentInNewTab({
      agent,
      worktreeId: targetWorktreeId,
      groupId: args.groupId ?? targetWorktreeId,
      prompt: commandInput,
      agentArgs: recipe.agentArgs,
      promptDelivery: 'submit-after-ready',
      launchPlatform,
      launchSource: args.launchSource
    })
    if (!result) {
      toast.error(
        translate(
          'auto.lib.fix.checks.agent.launch.fb6c294e85',
          'Could not build the agent launch command.'
        )
      )
      return false
    }
    if (result.tabId) {
      focusTerminalTabSurface(result.tabId)
    }
    return true
  }

  if (!args.item || !args.openModalFallback) {
    toast.error(
      translate(
        'auto.lib.fix.checks.agent.launch.027228a06b',
        'Unable to find a workspace for these checks.'
      )
    )
    return false
  }

  const agentOverride = await resolveSavedAgentOverride(savedAgentId, repo, assertOwner).catch(
    (error: unknown) => {
      showClientCreationActionError(error)
      return null
    }
  )
  if (
    !agentOverride ||
    agentOverride.kind === 'blocked' ||
    ownerKey === undefined ||
    getOwnerKey() !== ownerKey
  ) {
    return false
  }

  return await launchWorkItemDirect({
    item: { ...args.item, pasteContent: commandInput },
    repoId: args.repoId,
    launchSource: args.launchSource,
    telemetrySource: args.telemetrySource,
    promptDelivery: 'submit-after-ready',
    agentArgs: recipe.agentArgs,
    ...(agentOverride.kind === 'agent' ? { agentOverride: agentOverride.agent } : {}),
    openModalFallback: args.openModalFallback
  })
}
