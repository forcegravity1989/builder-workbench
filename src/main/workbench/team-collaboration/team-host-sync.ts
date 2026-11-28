import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parsePairingCode } from '../../../shared/remote-runtime/pairing/pairing'
import {
  addEnvironmentFromPairingCode,
  listEnvironments,
  removeEnvironment,
  updateEnvironmentFromPairingCode
} from '../../../shared/remote-runtime/host-store/runtime-environment-store'
import { RuntimeEnvironmentStoreError } from '../../../shared/remote-runtime/host-store/runtime-environment-store-records'
import type { TeamDirectoryMember } from '../../../shared/team-directory'
import { planTeamHostRefresh, type TeamSavedHost } from '../../../shared/team-host-refresh'

export type TeamHostSyncResult = { added: number; updated: number }

export type TeamHostSyncDeps = {
  userDataPath: string
  isCurrentBinding?: () => boolean
  /** Keeps a freshly saved host disconnected until the user connects it. */
  holdDisconnected: (environmentId: string) => void
  invalidateTransport: (environmentId: string) => Promise<void> | void
}

const MANAGED_FILE = 'workbench-team-hosts.json'
const pendingSyncs = new Map<string, Promise<TeamHostSyncResult>>()

type ManagedHost = { environmentId: string; memberId: string | null }

function readManagedHosts(userDataPath: string): ManagedHost[] {
  try {
    const parsed = JSON.parse(readFileSync(join(userDataPath, MANAGED_FILE), 'utf8')) as {
      environmentIds?: unknown
      hosts?: unknown
    }
    if (Array.isArray(parsed.hosts)) {
      return parsed.hosts.flatMap((entry) => {
        if (!entry || typeof entry !== 'object') {
          return []
        }
        const environmentId = (entry as { environmentId?: unknown }).environmentId
        const memberId = (entry as { memberId?: unknown }).memberId
        if (typeof environmentId !== 'string') {
          return []
        }
        return [{ environmentId, memberId: typeof memberId === 'string' ? memberId : null }]
      })
    }
    // Older syncs recorded only environment ids. Those hosts are still team-managed.
    return Array.isArray(parsed.environmentIds)
      ? parsed.environmentIds
          .filter((id): id is string => typeof id === 'string')
          .map((environmentId) => ({ environmentId, memberId: null }))
      : []
  } catch (error) {
    // A missing file means nothing was synced yet. An unreadable one must stop the sync, otherwise
    // the next write would drop the ids of hosts already saved.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return []
    }
    throw error
  }
}

function writeManagedHosts(userDataPath: string, hosts: readonly ManagedHost[]): void {
  writeFileSync(
    join(userDataPath, MANAGED_FILE),
    JSON.stringify({
      hosts: hosts.map((host) => ({
        environmentId: host.environmentId,
        ...(host.memberId ? { memberId: host.memberId } : {})
      }))
    })
  )
}

function rememberManagedHost(
  hosts: readonly ManagedHost[],
  environmentId: string,
  memberId: string,
  removeIds: readonly string[]
): ManagedHost[] {
  const removed = new Set(removeIds)
  return [
    ...hosts.filter(
      (host) => host.environmentId !== environmentId && !removed.has(host.environmentId)
    ),
    { environmentId, memberId }
  ]
}

function isNameTaken(error: unknown): boolean {
  return (
    error instanceof RuntimeEnvironmentStoreError && error.pairingFailure?.errorCode === 'nameTaken'
  )
}

/**
 * Saves the other members' published links as remote hosts, disconnected until the user connects.
 * A new link replaces the host already saved for that member. The previous address is not kept
 * as a second team host. A hand-added host changes only when it is the same link, or the only
 * host saved under that member's name.
 */
export function syncTeamHosts(
  hosts: TeamDirectoryMember[],
  currentMemberId: string | null,
  deps: TeamHostSyncDeps
): Promise<TeamHostSyncResult> {
  const { userDataPath } = deps
  const previous = pendingSyncs.get(userDataPath)
  const run = (previous ? previous.catch(() => undefined) : Promise.resolve()).then(() =>
    syncTeamHostsOnce(hosts, currentMemberId, deps)
  )
  pendingSyncs.set(userDataPath, run)
  const clear = () => {
    if (pendingSyncs.get(userDataPath) === run) {
      pendingSyncs.delete(userDataPath)
    }
  }
  void run.then(clear, clear)
  return run
}

function savedHosts(
  environments: Awaited<ReturnType<typeof listEnvironments>>,
  managed: readonly ManagedHost[]
): TeamSavedHost[] {
  return environments.map((environment) => {
    const record = managed.find((host) => host.environmentId === environment.id)
    const endpoint =
      environment.endpoints.find((item) => item.id === environment.preferredEndpointId) ??
      environment.endpoints[0]
    return {
      id: environment.id,
      name: environment.name,
      managed: record !== undefined,
      memberId: record?.memberId ?? null,
      endpoint: endpoint?.endpoint,
      deviceToken: endpoint?.deviceToken,
      publicKeys: environment.endpoints.map((item) => item.publicKeyB64),
      accessMode: environment.accessMode
    }
  })
}

async function syncTeamHostsOnce(
  hosts: TeamDirectoryMember[],
  currentMemberId: string | null,
  deps: TeamHostSyncDeps
): Promise<TeamHostSyncResult> {
  let managed = readManagedHosts(deps.userDataPath)
  const result: TeamHostSyncResult = { added: 0, updated: 0 }
  for (const host of hosts) {
    if (deps.isCurrentBinding?.() === false) {
      break
    }
    if (!host.orca_endpoint || host.member_id.toLowerCase() === currentMemberId?.toLowerCase()) {
      continue
    }
    const offer = parsePairingCode(host.orca_endpoint)
    if (!offer) {
      continue
    }
    const name = host.name ?? host.member_id
    try {
      const listed = await listEnvironments(deps.userDataPath)
      const plan = planTeamHostRefresh(
        host,
        {
          endpoint: offer.endpoint,
          deviceToken: offer.deviceToken,
          publicKeyB64: offer.publicKeyB64,
          accessMode: offer.accessMode
        },
        savedHosts(listed, managed)
      )
      let environmentId = plan.environmentId
      if (plan.action === 'add') {
        const environment = await saveHost(deps, name, host, host.orca_endpoint)
        try {
          deps.holdDisconnected(environment.id)
        } catch (error) {
          await removeEnvironment(deps.userDataPath, environment.id)
          throw error
        }
        environmentId = environment.id
        result.added += 1
      } else if (plan.action === 'update' && environmentId) {
        const current = listed.find((environment) => environment.id === environmentId)
        if (!current) {
          continue
        }
        await updateEnvironmentFromPairingCode(deps.userDataPath, environmentId, {
          pairingCode: host.orca_endpoint,
          expectedPairingRevision: current.pairingRevision ?? current.createdAt
        })
        await deps.invalidateTransport(environmentId)
        result.updated += 1
      }
      for (const staleId of plan.removeEnvironmentIds) {
        await deps.invalidateTransport(staleId)
        await removeEnvironment(deps.userDataPath, staleId)
      }
      if (plan.action === 'skip' && plan.removeEnvironmentIds.length > 0) {
        result.updated += 1
      }
      if (!environmentId) {
        continue
      }
      managed = rememberManagedHost(
        managed,
        environmentId,
        plan.memberId,
        plan.removeEnvironmentIds
      )
      writeManagedHosts(deps.userDataPath, managed)
    } catch {
      // One unusable link must not block the other members' hosts, and it is retried next sync.
    }
  }
  return result
}

async function saveHost(
  deps: TeamHostSyncDeps,
  name: string,
  host: TeamDirectoryMember,
  pairingCode: string
): ReturnType<typeof addEnvironmentFromPairingCode> {
  try {
    return await addEnvironmentFromPairingCode(deps.userDataPath, {
      name,
      pairingCode,
      reconnectOnLaunch: false
    })
  } catch (error) {
    if (!isNameTaken(error)) {
      throw error
    }
    return addEnvironmentFromPairingCode(deps.userDataPath, {
      name: `${name}（${host.member_id}）`,
      pairingCode,
      reconnectOnLaunch: false
    })
  }
}
