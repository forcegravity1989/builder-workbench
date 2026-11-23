import { useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import { parseExecutionHostId } from '../../../../shared/execution-host'
import { readHostAgentLaunchPreferences } from '@/runtime/agent-launch-settings/use-host-agent-launch-preferences'
import {
  subscribeHostAgentLaunchSettings,
  type AgentLaunchSettingsOwner
} from '@/runtime/agent-launch-settings/agent-launch-settings-transport'

type HostPreferences = Awaited<ReturnType<typeof readHostAgentLaunchPreferences>>
export type DashboardHostAgentPreferences = ReadonlyMap<string, HostPreferences>
const EMPTY_PREFERENCES: DashboardHostAgentPreferences = new Map()

/** An open dashboard projects host preferences; it never persists or supplies local substitutes. */
export function useDashboardHostAgentPreferences(enabled: boolean): DashboardHostAgentPreferences {
  const catalog = useAppStore(
    useShallow((state) =>
      enabled
        ? {
            repos: state.repos,
            worktreesByRepo: state.worktreesByRepo,
            folderWorkspaces: state.folderWorkspaces,
            projectGroups: state.projectGroups,
            runtimeEnvironments: state.runtimeEnvironments,
            runtimeStatusByEnvironmentId: state.runtimeStatusByEnvironmentId
          }
        : null
    )
  )
  const key = useMemo(() => {
    if (!catalog) {
      return '[]'
    }
    const environmentIds = new Set<string>()
    const hostIds = [
      ...catalog.repos.map((repo) => repo.executionHostId),
      ...Object.values(catalog.worktreesByRepo).flatMap((rows) => rows.map((row) => row.hostId)),
      ...catalog.folderWorkspaces.map((folder) => folder.executionHostId),
      ...catalog.projectGroups.map((group) => group.executionHostId)
    ]
    for (const hostId of hostIds) {
      const host = parseExecutionHostId(hostId)
      if (host?.kind === 'runtime') {
        environmentIds.add(host.environmentId)
      }
    }
    return JSON.stringify(
      [...environmentIds].sort().map((environmentId) => {
        const environment = catalog.runtimeEnvironments.find((entry) => entry.id === environmentId)
        const entry = catalog.runtimeStatusByEnvironmentId.get(environmentId)
        return {
          environmentId,
          pairingRevision: environment
            ? environment.pairingRevision ?? environment.createdAt
            : undefined,
          runtimeId: entry?.status?.runtimeId,
          contact: entry?.hostContactEpoch
        }
      })
    )
  }, [catalog])
  // Closing and reopening starts a fresh projection even if the host identity is unchanged.
  const scope = useMemo(() => ({ key }), [key])
  const [snapshot, setSnapshot] = useState<{
    scope: typeof scope
    preferences: DashboardHostAgentPreferences
  } | null>(null)
  useEffect(() => {
    const owners = JSON.parse(scope.key) as AgentLaunchSettingsOwner[]
    if (owners.length === 0) {
      return
    }
    let controller = new AbortController()
    const refresh = (): void => {
      controller.abort()
      controller = new AbortController()
      const current = controller
      void Promise.all(
        owners.map(async (owner) => {
          const preferences = await readHostAgentLaunchPreferences(owner, current.signal)
            .catch(() => null)
          return [owner.environmentId, preferences] as const
        })
      ).then((entries) => {
        if (!current.signal.aborted) {
          const preferences = new Map<string, HostPreferences>()
          for (const [environmentId, value] of entries) {
            if (value?.isAvailable) {
              preferences.set(environmentId, value)
            }
          }
          setSnapshot({ scope, preferences })
        }
      })
    }
    refresh()
    const unsubscribe = subscribeHostAgentLaunchSettings((owner) => {
      if (owners.some((entry) => entry.environmentId === owner.environmentId)) {
        refresh()
      }
    })
    return () => {
      controller.abort()
      unsubscribe()
    }
  }, [scope])
  return snapshot?.scope === scope ? snapshot.preferences : EMPTY_PREFERENCES
}
