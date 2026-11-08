import { useEffect, useState } from 'react'
import { useAppStore } from '@/store'
import type { AgentDetectionTarget } from '@/hooks/useDetectedAgents'
import {
  getAgentDetectionTargetKeyForWorktree,
  parseAgentDetectionTargetKey
} from '@/hooks/useAgentDetectionTarget'
import { getRuntimeEnvironmentRevision } from '../runtime-environment-revision'
import {
  readHostAgentStartupSettings,
  subscribeHostAgentLaunchSettings,
  type AgentLaunchSettingsOwner,
  type HostAgentStartupSettings
} from './agent-launch-settings-transport'

type Preferences = Pick<HostAgentStartupSettings, 'defaultTuiAgent' | 'disabledTuiAgents'> & {
  isAvailable: boolean
}
export type HostAgentLaunchPreferences = Preferences & {
  isLoading: boolean
  owner: AgentLaunchSettingsOwner | null
}
const UNKNOWN: Preferences = { defaultTuiAgent: null, disabledTuiAgents: [], isAvailable: false }

export async function readHostAgentLaunchPreferences(
  owner: AgentLaunchSettingsOwner,
  signal?: AbortSignal
): Promise<Preferences> {
  if (
    owner.pairingRevision === undefined ||
    !owner.runtimeId ||
    useAppStore.getState().runtimeStatusByEnvironmentId.get(owner.environmentId)?.status?.runtimeId !==
      owner.runtimeId
  ) {
    return UNKNOWN
  }
  const settings = await readHostAgentStartupSettings(owner, signal).catch((error: unknown) => {
    if (error instanceof Error && error.name === 'AbortError') {
      throw error
    }
    return null
  })
  const status = useAppStore.getState().runtimeStatusByEnvironmentId.get(owner.environmentId)?.status
  if (
    getRuntimeEnvironmentRevision(owner.environmentId) !== owner.pairingRevision ||
    (owner.runtimeId && status?.runtimeId !== owner.runtimeId)
  ) {
    throw new DOMException('Agent settings owner changed', 'AbortError')
  }
  return settings
    ? {
        defaultTuiAgent: settings.defaultTuiAgent,
        disabledTuiAgents: settings.disabledTuiAgents,
        isAvailable: true
      }
    : UNKNOWN
}

export async function ensureAgentLaunchPreferences(worktreeId: string): Promise<Preferences> {
  const state = useAppStore.getState()
  const target = parseAgentDetectionTargetKey(getAgentDetectionTargetKeyForWorktree(state, worktreeId))
  if (target?.kind !== 'runtime') {
    return {
      defaultTuiAgent: state.settings?.defaultTuiAgent,
      disabledTuiAgents: state.settings?.disabledTuiAgents,
      isAvailable: target !== undefined && state.settings !== null
    }
  }
  const status = state.runtimeStatusByEnvironmentId.get(target.environmentId)?.status
  return readHostAgentLaunchPreferences({
    environmentId: target.environmentId,
    pairingRevision: getRuntimeEnvironmentRevision(target.environmentId),
    runtimeId: status?.runtimeId
  })
}

export function useHostAgentLaunchPreferences(
  target: AgentDetectionTarget | undefined
): HostAgentLaunchPreferences {
  const environmentId = target?.kind === 'runtime' ? target.environmentId : null
  const localDefault = useAppStore((state) => state.settings?.defaultTuiAgent)
  const localDisabled = useAppStore((state) => state.settings?.disabledTuiAgents)
  const localAvailable = useAppStore((state) => state.settings !== null)
  const revision = useAppStore((state) => {
    if (!environmentId) {
      return undefined
    }
    const environment = state.runtimeEnvironments.find((entry) => entry.id === environmentId)
    return environment ? environment.pairingRevision ?? environment.createdAt : undefined
  })
  const runtimeId = useAppStore((state) =>
    environmentId
      ? state.runtimeStatusByEnvironmentId.get(environmentId)?.status?.runtimeId
      : undefined
  )
  const contact = useAppStore((state) =>
    environmentId
      ? state.runtimeStatusByEnvironmentId.get(environmentId)?.hostContactEpoch
      : undefined
  )
  const ownerVerified = revision !== undefined && runtimeId !== undefined
  const key = JSON.stringify([environmentId, revision, runtimeId, contact])
  const [snapshot, setSnapshot] = useState<{
    key: string
    preferences: Preferences
  } | null>(null)
  useEffect(() => {
    if (!environmentId || !ownerVerified) {
      return
    }
    let controller = new AbortController()
    const refresh = (): void => {
      controller.abort()
      controller = new AbortController()
      const current = controller
      void readHostAgentLaunchPreferences(
        { environmentId, pairingRevision: revision, runtimeId },
        current.signal
      ).then(
        (preferences) => {
          if (!current.signal.aborted) {
            setSnapshot({ key, preferences })
          }
        },
        () => {
          if (!current.signal.aborted) {
            setSnapshot({ key, preferences: UNKNOWN })
          }
        }
      )
    }
    refresh()
    const unsubscribe = subscribeHostAgentLaunchSettings((owner) => {
      if (owner.environmentId === environmentId) {
        refresh()
      }
    })
    return () => {
      controller.abort()
      unsubscribe()
    }
  }, [environmentId, revision, runtimeId, ownerVerified, key])
  return environmentId
    ? {
        ...(ownerVerified && snapshot?.key === key ? snapshot.preferences : UNKNOWN),
        isLoading: ownerVerified && snapshot?.key !== key,
        owner: { environmentId, pairingRevision: revision, runtimeId }
      }
    : {
        defaultTuiAgent: localDefault,
        disabledTuiAgents: localDisabled,
        isAvailable: target !== undefined && localAvailable,
        isLoading: target === undefined,
        owner: null
      }
}
