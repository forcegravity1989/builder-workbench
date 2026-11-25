import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parsePairingCode } from '../../../shared/pairing'
import { findEnvironmentWithHostKey } from '../../../shared/runtime-environment-host-key-match'
import {
  addOrUpdateEnvironmentFromPairingCode,
  listEnvironments,
  removeEnvironment,
  setEnvironmentReconnectOnLaunch
} from '../../../shared/runtime-environment-store'
import { RuntimeEnvironmentStoreError } from '../../../shared/runtime-environment-store-records'
import type { TeamDirectoryMember } from '../../../shared/team-directory'

export type TeamHostSyncResult = { added: number; updated: number }

export type TeamHostSyncDeps = {
  userDataPath: string
  isCurrentBinding?: () => boolean
  /** Keeps a freshly saved host disconnected until the user connects it. */
  holdDisconnected: (environmentId: string) => void
  invalidateTransport: (environmentId: string) => Promise<void> | void
}

const MANAGED_FILE = 'workbench-team-hosts.json'

function readManagedIds(userDataPath: string): Set<string> {
  try {
    const parsed = JSON.parse(readFileSync(join(userDataPath, MANAGED_FILE), 'utf8')) as {
      environmentIds?: unknown
    }
    return new Set(
      Array.isArray(parsed.environmentIds)
        ? parsed.environmentIds.filter((id): id is string => typeof id === 'string')
        : []
    )
  } catch (error) {
    // A missing file means nothing was synced yet. An unreadable one must stop the sync, otherwise
    // the next write would drop the ids of hosts already saved.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return new Set()
    }
    throw error
  }
}

function writeManagedIds(userDataPath: string, ids: Set<string>): void {
  writeFileSync(join(userDataPath, MANAGED_FILE), JSON.stringify({ environmentIds: [...ids] }))
}

function isNameTaken(error: unknown): boolean {
  return (
    error instanceof RuntimeEnvironmentStoreError && error.pairingFailure?.errorCode === 'nameTaken'
  )
}

/**
 * Saves the other members' published links as remote hosts, disconnected. Hosts the user saved
 * by hand are never rewritten, and nothing is removed.
 */
export async function syncTeamHosts(
  hosts: TeamDirectoryMember[],
  currentMemberId: string | null,
  deps: TeamHostSyncDeps
): Promise<TeamHostSyncResult> {
  const managed = readManagedIds(deps.userDataPath)
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
    const existing = findEnvironmentWithHostKey(
      listEnvironments(deps.userDataPath),
      offer.publicKeyB64
    )
    const name = host.name ?? host.member_id
    try {
      if (!existing) {
        const { environment } = saveHost(deps, name, host, host.orca_endpoint)
        try {
          setEnvironmentReconnectOnLaunch(deps.userDataPath, environment.id, false)
          deps.holdDisconnected(environment.id)
          managed.add(environment.id)
          writeManagedIds(deps.userDataPath, managed)
        } catch (error) {
          // A host that cannot be held disconnected would connect on launch, so it is not kept.
          managed.delete(environment.id)
          removeEnvironment(deps.userDataPath, environment.id)
          throw error
        }
        result.added += 1
        continue
      }
      const endpoint = existing.endpoints[0]
      if (
        !managed.has(existing.id) ||
        (endpoint?.deviceToken === offer.deviceToken && endpoint?.endpoint === offer.endpoint)
      ) {
        continue
      }
      const wasHeld = existing.reconnectOnLaunch === false
      addOrUpdateEnvironmentFromPairingCode(deps.userDataPath, {
        name: existing.name,
        pairingCode: host.orca_endpoint
      })
      if (wasHeld) {
        setEnvironmentReconnectOnLaunch(deps.userDataPath, existing.id, false)
      }
      await deps.invalidateTransport(existing.id)
      result.updated += 1
    } catch {
      // One unusable link must not block the other members' hosts, and it is retried next sync.
    }
  }
  return result
}

function saveHost(
  deps: TeamHostSyncDeps,
  name: string,
  host: TeamDirectoryMember,
  pairingCode: string
): ReturnType<typeof addOrUpdateEnvironmentFromPairingCode> {
  try {
    return addOrUpdateEnvironmentFromPairingCode(deps.userDataPath, { name, pairingCode })
  } catch (error) {
    if (!isNameTaken(error)) {
      throw error
    }
    return addOrUpdateEnvironmentFromPairingCode(deps.userDataPath, {
      name: `${name}（${host.member_id}）`,
      pairingCode
    })
  }
}
