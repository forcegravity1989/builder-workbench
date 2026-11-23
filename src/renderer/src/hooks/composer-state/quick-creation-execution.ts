import type { QuickCreationExecutionInput } from './quick-submit-input-contract'

import { useCallback } from 'react'
import type { Repo } from '../../../../shared/repo-types'
import type { TuiAgent } from '../../../../shared/tui-agent'
import type { WorktreeCreationRequest } from '@/lib/pending-worktree-creation'
import { useAppStore } from '@/store'
import { settleComposerSubmit } from '@/lib/composer-submit-cancellation'
import { ensureHooksConfirmed } from '@/lib/ensure-hooks-confirmed'
import { getActiveRuntimeTarget } from '@/runtime/runtime-rpc-client'
import { runBackgroundWorktreeCreation } from '@/lib/worktree-creation-flow'
import { translate } from '@/i18n/i18n'
import { resolveWorkbenchCreationBinding } from '../../../../shared/workbench/creation-context'
import {
  prepareQuickComposerStartup,
  resolveQuickComposerAgentLaunchRoute
} from './quick-startup-plan'
import { buildQuickCreationRequest } from './quick-creation-request'
import type { PendingSmartGitHubSubmitResolution } from './source-selection-decisions'
import { assertHostAgentStartupOwner } from '@/lib/host-agent-startup-inputs'

export function useQuickCreationExecution(input: QuickCreationExecutionInput) {
  const {
    clearNewWorkspaceDraft,
    createMultiple,
    effectivePresetId,
    ephemeralVmRecipes,
    ephemeralVmsEnabled,
    isSubmissionCancelled,
    linkedGitLabIssue,
    linkedGitLabMR,
    normalizedSparseDirectories,
    onCreated,
    parentWorktreeId,
    persistDraft,
    persistSetupAgentStartupPolicy,
    prepareQuickSubmit,
    resetForNextCreate,
    resolvedInitialWorkspaceStatus,
    selectedEphemeralVmRecipeId,
    selectedRepoAgentLaunchPlatform,
    selectedRepoExecutionHostId,
    selectedRepoIsGit,
    selectedRepoIsRemote,
    selectedRepoSettings,
    selectedRepoStartupShell,
    selectedWorkspaceTarget,
    settings,
    sparseEnabled,
    taskSourceContext,
    telemetrySource,
    workbenchCreation
  } = input

  const executeQuickCreation = useCallback(
    async (
      smartGitHubResolution: PendingSmartGitHubSubmitResolution,
      requestedAgent: TuiAgent | null,
      workspaceNameSeed: string,
      workspaceRunContext: WorktreeCreationRequest['workspaceRunContext'],
      repoId: string,
      selectedRepo: Repo
    ): Promise<void> => {
      const prepared = await prepareQuickSubmit(
        smartGitHubResolution,
        requestedAgent,
        workspaceNameSeed
      )

      if (!prepared) {
        return
      }

      const {
        submitLinkedWorkItem,
        agent,
        submitLinkedIssueNumber,
        submitLinkedPR,
        workspaceName,
        nameWasGenerated,
        nameIsAutoManaged,
        submitCompareBaseRef,
        submitPushTarget,
        effectiveSetupDecision,
        issueCommand,
        linkedLinearIssue,
        linkedLinearIssueWorkspaceId,
        linkedLinearIssueOrganizationUrlKey,
        effectiveBranchNameOverride,
        submitBaseBranch,
        createDisplayName,
        pendingFirstAgentMessageRename,
        trimmedNote
      } = prepared

      const {
        startupPlan,
        backendStartup,
        telemetry: quickTelemetry,
        agentLaunchOwner,
        quickPrompt,
        quickDraftPrompt
      } = await prepareQuickComposerStartup({
        runtimeEnvironmentId: selectedRepoSettings?.activeRuntimeEnvironmentId,
        usesEphemeralVm: ephemeralVmsEnabled && Boolean(selectedEphemeralVmRecipeId),
        agent,
        linkedWorkItem: submitLinkedWorkItem,
        note: trimmedNote,
        settings,
        repoConnectionId: selectedRepo.connectionId,
        platform: selectedRepoAgentLaunchPlatform,
        shell: selectedRepoStartupShell,
        isRemote: selectedRepoIsRemote,
        telemetrySource
      })
      if (isSubmissionCancelled()) {
        return
      }

      const startupPolicySettlement = await settleComposerSubmit(
        persistSetupAgentStartupPolicy(),
        isSubmissionCancelled
      )

      if (startupPolicySettlement.status === 'cancelled') {
        return
      }

      if (!startupPolicySettlement.value) {
        throw new Error(
          translate(
            'auto.hooks.useComposerState.setupAgentStartupPolicySaveFailed',
            'Failed to save setup startup behavior.'
          )
        )
      }

      let ephemeralVmRecipe: WorktreeCreationRequest['ephemeralVmRecipe']

      const activeEphemeralVmRecipeId = ephemeralVmsEnabled ? selectedEphemeralVmRecipeId : null

      if (activeEphemeralVmRecipeId && selectedWorkspaceTarget.status === 'ready') {
        const vmRecipeTrustSettlement = await settleComposerSubmit(
          ensureHooksConfirmed(
            useAppStore.getState(),
            repoId,
            'vmRecipe',
            selectedRepoExecutionHostId ?? undefined,
            undefined,
            isSubmissionCancelled
          ),
          isSubmissionCancelled
        )
        if (vmRecipeTrustSettlement.status === 'cancelled') {
          return
        }
        const vmRecipeTrustDecision = vmRecipeTrustSettlement.value
        if (vmRecipeTrustDecision === 'skip') {
          return
        }
        const selectedRecipe = ephemeralVmRecipes.find(
          (recipe) => recipe.id === activeEphemeralVmRecipeId
        )
        ephemeralVmRecipe = {
          sourceRepoId: repoId,
          recipeId: activeEphemeralVmRecipeId,
          projectId: selectedWorkspaceTarget.target.projectId,
          ...(selectedRecipe?.checkoutMode ? { checkoutMode: selectedRecipe.checkoutMode } : {})
        }
      }

      const promptDelivery = quickDraftPrompt ? 'draft' : 'auto-submit'
      // Why: the verdict is persisted on the request as data and re-entered once the worktree exists.
      const agentLaunchRoute = resolveQuickComposerAgentLaunchRoute(agent, {
        workspace: {
          kind: selectedRepoIsGit ? 'git-worktree' : 'folder',
          repoId,
          executionHostId: ephemeralVmRecipe
            ? 'runtime:pending-ephemeral-vm'
            : (workspaceRunContext?.hostId ?? selectedRepoExecutionHostId ?? undefined)
        },
        prompt: quickDraftPrompt ?? quickPrompt,
        promptDelivery,
        initialSessionOptions: startupPlan?.sessionOptions
      })
      const structuredLaunch = agentLaunchRoute === 'structured-native-chat'

      const request = buildQuickCreationRequest({
        repoId,
        ephemeralVmRecipe,
        indeterminateProgress:
          Boolean(activeEphemeralVmRecipeId) ||
          getActiveRuntimeTarget(selectedRepoSettings).kind !== 'local',
        taskSourceContext,
        linkedWorkItem: submitLinkedWorkItem,
        workspaceRunContext,
        workspaceName,
        nameWasGenerated,
        displayName: createDisplayName,
        displayNameKind: createDisplayName ? (nameIsAutoManaged ? 'generated' : 'user') : undefined,
        selectedRepoIsGit,
        baseBranch: submitBaseBranch,
        compareBaseRef: submitCompareBaseRef,
        setupDecision: effectiveSetupDecision,
        sparseDirectories: selectedRepoIsGit && sparseEnabled ? normalizedSparseDirectories : null,
        sparsePresetId: effectivePresetId,
        telemetrySource,
        linkedIssue: submitLinkedIssueNumber,
        linkedPR: submitLinkedPR,
        pushTarget: submitPushTarget,
        agent,
        agentLaunchRoute,
        linkedLinearIssue,
        linkedLinearIssueWorkspaceId,
        linkedLinearIssueOrganizationUrlKey,
        branchNameOverride: effectiveBranchNameOverride,
        parentWorktreeId,
        workspaceStatus: resolvedInitialWorkspaceStatus,
        linkedGitLabMR,
        linkedGitLabIssue,
        includeGitLabLinks: smartGitHubResolution.kind === 'none',
        startup: structuredLaunch ? undefined : backendStartup,
        issueCommand,
        pendingFirstAgentMessageRename,
        note: trimmedNote,
        startupPlan,
        agentLaunchOwner,
        quickPrompt,
        launchDraftPrompt: quickDraftPrompt,
        promptDelivery,
        quickTelemetry,
        suppressTerminalFocusOnCompletion: createMultiple,
        // G2 (BW): resolved at submit time against the FINAL repo + task source;
        // a repo switch drops the context (stale attribution is never bound).
        workbenchVersionBinding: resolveWorkbenchCreationBinding(workbenchCreation, {
          repoId,
          taskSourceContext
        })
      })

      if (isSubmissionCancelled()) {
        return
      }
      assertHostAgentStartupOwner(agentLaunchOwner)

      if (persistDraft) {
        clearNewWorkspaceDraft()
      }

      runBackgroundWorktreeCreation(request)

      if (createMultiple) {
        resetForNextCreate()
      } else {
        onCreated?.()
      }
    },
    [
      clearNewWorkspaceDraft,
      createMultiple,
      effectivePresetId,
      ephemeralVmRecipes,
      ephemeralVmsEnabled,
      isSubmissionCancelled,
      linkedGitLabIssue,
      linkedGitLabMR,
      normalizedSparseDirectories,
      onCreated,
      parentWorktreeId,
      persistDraft,
      persistSetupAgentStartupPolicy,
      prepareQuickSubmit,
      resetForNextCreate,
      resolvedInitialWorkspaceStatus,
      selectedEphemeralVmRecipeId,
      selectedRepoAgentLaunchPlatform,
      selectedRepoExecutionHostId,
      selectedRepoIsGit,
      selectedRepoIsRemote,
      selectedRepoSettings,
      selectedRepoStartupShell,
      selectedWorkspaceTarget,
      settings,
      sparseEnabled,
      taskSourceContext,
      telemetrySource,
      workbenchCreation
    ]
  )

  return {
    executeQuickCreation
  }
}
