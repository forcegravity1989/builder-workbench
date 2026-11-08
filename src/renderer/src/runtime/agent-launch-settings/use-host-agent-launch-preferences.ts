import { useEffect, useState } from 'react'
import { useAppStore } from '@/store'
import type { AgentDetectionTarget } from '@/hooks/useDetectedAgents'
import {
  getAgentDetectionTargetKeyForWorktree,
  parseAgentDetectionTargetKey
} from '@/hooks/useAgentDetectionTarget'
import { lastVerifiedRuntimeStatus } from '../../../../shared/runtime-host-status'
import { getRuntimeEnvironmentRevision } from '../runtime-environment-revision'
import {
  readHostAgentStartupSettings,
  subscribeHostAgentLaunchSettings,
  type AgentLaunchSettingsOwner,
  type HostAgentStartupSettings
} from './agent-launch-settings-transport'

type Preferences = Pick<HostAgentStartupSettings, 'defaultTuiAgent' | 'disabledTuiAgents'>
const UNKNOWN: Preferences = { defaultTuiAgent: null, disabledTuiAgents: [] }

export async function readHostAgentLaunchPreferences(
  owner: AgentLaunchSettingsOwner,
  signal?: AbortSignal
): Promise<Preferences> {
  const settings = await readHostAgentStartupSettings(owner, signal).catch((error: unknown) => {
    if (error instanceof Error && error.name === 'AbortError') {
      throw error
    }
    return null
  })
  const status = lastVerifiedRuntimeStatus(
    useAppStore.getState().runtimeStatusByEnvironmentId.get(owner.environmentId)
  )
  if (
    getRuntimeEnvironmentRevision(owner.environmentId) !== owner.pairingRevision ||
    (owner.runtimeId && status?.runtimeId !== owner.runtimeId)
  ) {
    throw new DOMException('Agent settings owner changed', 'AbortError')
  }
  return settings ?? UNKNOWN
}

export async function ensureAgentLaunchPreferences(worktreeId: string): Promise<Preferences> {
  const state = useAppStore.getState()
  const target = parseAgentDetectionTargetKey(getAgentDetectionTargetKeyForWorktree(state, worktreeId))
  if (target?.kind !== 'runtime') {
    return state.settings ?? UNKNOWN
  }
  const status = lastVerifiedRuntimeStatus(
    state.runtimeStatusByEnvironmentId.get(target.environmentId)
  )
  return readHostAgentLaunchPreferences({
    environmentId: target.environmentId,
    pairingRevision: getRuntimeEnvironmentRevision(target.environmentId),
    runtimeId: status?.runtimeId
  })
}

export function useHostAgentLaunchPreferences(target: AgentDetectionTarget | undefined): Preferences {
  const environmentId = target?.kind === 'runtime' ? target.environmentId : null
  const localDefault = useAppStore((state) => state.settings?.defaultTuiAgent)
  const localDisabled = useAppStore((state) => state.settings?.disabledTuiAgents)
  const revision = useAppStore((state) => {
    if (!environmentId) {
      return undefined
    }
    const environment = state.runtimeEnvironments.find((entry) => entry.id === environmentId)
    return environment ? environment.pairingRevision ?? environment.createdAt : undefined
  })
  const runtimeId = useAppStore((state) =>
    environmentId
      ? lastVerifiedRuntimeStatus(state.runtimeStatusByEnvironmentId.get(environmentId))?.runtimeId
      : undefined
  )
  const contact = useAppStore((state) =>
    environmentId
      ? state.runtimeStatusByEnvironmentId.get(environmentId)?.hostContactEpoch
      : undefined
  )
  const key = JSON.stringify([environmentId, revision, runtimeId])
  const [snapshot, setSnapshot] = useState<{
    key: string
    preferences: Preferences
  } | null>(null)
  useEffect(() => {
    if (!environmentId) {
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
  }, [environmentId, revision, runtimeId, contact, key])
  return environmentId
    ? snapshot?.key === key
      ? snapshot.preferences
      : UNKNOWN
    : { defaultTuiAgent: localDefault, disabledTuiAgents: localDisabled }
}
