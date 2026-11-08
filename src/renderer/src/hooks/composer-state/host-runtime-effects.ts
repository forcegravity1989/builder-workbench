import type { ComposerModel } from './composer-model'

type HostRuntimeEffectsInput = Pick<
  ComposerModel,
  | 'commitHookCheckIfCurrent'
  | 'connectionId'
  | 'createGateMode'
  | 'enableIssueAutomation'
  | 'ensureDetectedAgents'
  | 'ensureRemoteDetectedAgents'
  | 'ensureRuntimeDetectedAgents'
  | 'folderTargetConnectionId'
  | 'isRemote'
  | 'loadHookCheckForRepo'
  | 'repoId'
  | 'repoIdRef'
  | 'runtimeEnvironmentId'
  | 'selectedRepoConnectionIdRef'
  | 'selectedRepoExecutionHostId'
  | 'selectedRepoHookContextKey'
  | 'selectedRepoIsGit'
  | 'selectedRepoSettingsRef'
  | 'selectedRepoSshStatus'
  | 'setLoadedIssueCommand'
>

import { useEffect, useCallback } from 'react'
import { readRuntimeIssueCommand } from '@/runtime/runtime-hooks-client'
import { useAppStore } from '@/store'
import { isSshConnectInProgress } from '@/lib/new-workspace-ssh-gate'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'

export function useHostRuntimeEffects(input: HostRuntimeEffectsInput) {
  const {
    commitHookCheckIfCurrent,
    connectionId,
    createGateMode,
    enableIssueAutomation,
    ensureDetectedAgents,
    ensureRemoteDetectedAgents,
    ensureRuntimeDetectedAgents,
    folderTargetConnectionId,
    isRemote,
    loadHookCheckForRepo,
    repoId,
    repoIdRef,
    runtimeEnvironmentId,
    selectedRepoConnectionIdRef,
    selectedRepoExecutionHostId,
    selectedRepoHookContextKey,
    selectedRepoIsGit,
    selectedRepoSettingsRef,
    selectedRepoSshStatus,
    setLoadedIssueCommand
  } = input

  // Why: re-detect agents when the selected repo changes so the list matches the correct host (local runs once, deduped by the store).
  useEffect(() => {
    if (isRemote && selectedRepoSshStatus !== 'connected') {
      return
    }
    const detect = isRemote
      ? ensureRemoteDetectedAgents(connectionId!)
      : runtimeEnvironmentId
        ? ensureRuntimeDetectedAgents(runtimeEnvironmentId)
        : ensureDetectedAgents()
    void detect
    // Agent choice is derived from the current host snapshot by the identity owner.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId, runtimeEnvironmentId, isRemote, selectedRepoSshStatus])

  // Per-repo: load yaml hooks + issue command template.
  useEffect(() => {
    if (!repoId || !selectedRepoIsGit || !selectedRepoHookContextKey) {
      return
    }

    let cancelled = false

    void loadHookCheckForRepo(repoId)
      .then((result) => {
        if (!cancelled) {
          commitHookCheckIfCurrent(selectedRepoHookContextKey, result.hooks)
        }
      })
      .catch(() => {
        if (!cancelled) {
          commitHookCheckIfCurrent(selectedRepoHookContextKey, null)
        }
      })

    if (!enableIssueAutomation) {
      return () => {
        cancelled = true
      }
    }

    if (createGateMode === 'quick') {
      return () => {
        cancelled = true
      }
    }

    void readRuntimeIssueCommand(
      selectedRepoSettingsRef.current,
      repoId,
      selectedRepoExecutionHostId ?? undefined
    )
      .then((result) => {
        if (!cancelled) {
          setLoadedIssueCommand({ contextKey: selectedRepoHookContextKey, result })
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadedIssueCommand({
            contextKey: selectedRepoHookContextKey,
            result: {
              status: 'error',
              localContent: null,
              sharedContent: null,
              effectiveContent: null,
              localFilePath: '',
              source: 'none'
            }
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [
    commitHookCheckIfCurrent,
    createGateMode,
    enableIssueAutomation,
    loadHookCheckForRepo,
    repoId,
    selectedRepoExecutionHostId,
    selectedRepoHookContextKey,
    selectedRepoIsGit,
    runtimeEnvironmentId,
    selectedRepoSettingsRef,
    setLoadedIssueCommand
  ])

  const onConnectSelectedRepo = useCallback(async (): Promise<void> => {
    const targetId = selectedRepoConnectionIdRef.current
    if (!targetId) {
      return
    }
    const liveState = useAppStore.getState()
    const liveRepo = liveState.repos.find((repo) => repo.id === repoIdRef.current)
    if (liveRepo?.connectionId !== targetId) {
      return
    }
    const liveStatus = liveState.sshConnectionStates.get(targetId)?.status ?? null
    if (liveStatus === 'connected' || isSshConnectInProgress(liveStatus)) {
      return
    }

    try {
      await window.api.ssh.connect({ targetId })
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : translate('auto.hooks.useComposerState.ba6cb77082', 'Failed to connect to project.')
      )
    }
  }, [repoIdRef, selectedRepoConnectionIdRef])

  const onConnectSelectedProjectGroup = useCallback(async (): Promise<void> => {
    if (!folderTargetConnectionId) {
      return
    }
    const liveStatus = useAppStore
      .getState()
      .sshConnectionStates.get(folderTargetConnectionId)?.status
    if (liveStatus === 'connected' || isSshConnectInProgress(liveStatus ?? null)) {
      return
    }
    try {
      await window.api.ssh.connect({ targetId: folderTargetConnectionId })
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : translate('auto.hooks.useComposerState.ba6cb77082', 'Failed to connect to project.')
      )
    }
  }, [folderTargetConnectionId])

  return {
    onConnectSelectedRepo,
    onConnectSelectedProjectGroup
  }
}
