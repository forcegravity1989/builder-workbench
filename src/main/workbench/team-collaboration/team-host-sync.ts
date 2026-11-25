import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parsePairingCode } from '../../../shared/remote-runtime/pairing/pairing'
import { findEnvironmentWithHostKey } from '../../../shared/remote-runtime/host-catalog/runtime-environment-host-key-match'
import {
  addEnvironmentFromPairingCode,
  listEnvironments,
  removeEnvironment,
  updateEnvironmentFromPairingCode
} from '../../../shared/remote-runtime/host-store/runtime-environment-store'
import { RuntimeEnvironmentStoreError } from '../../../shared/remote-runtime/host-store/runtime-environment-store-records'
import type { TeamDirectoryMember } from '../../../shared/team-directory'

export type TeamHostSyncResult = { added: number; updated: number }

export type TeamHostSyncDeps = {
  userDataPath: string
  /** Keeps a freshly saved host disconnected until the user connects it. */
  holdDisconnected: (environmentId: string) => void
  invalidateTransport: (environmentId: string) => Promise<void> | void
}

const MANAGED_FILE = 'workbench-team-hosts.json'
const pendingSyncs = new Map<string, Promise<TeamHostSyncResult>>()

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

async function syncTeamHostsOnce(
  hosts: TeamDirectoryMember[],
  currentMemberId: string | null,
  deps: TeamHostSyncDeps
): Promise<TeamHostSyncResult> {
  const managed = readManagedIds(deps.userDataPath)
  const result: TeamHostSyncResult = { added: 0, updated: 0 }
  for (const host of hosts) {
    if (!host.orca_endpoint || host.member_id.toLowerCase() === currentMemberId?.toLowerCase()) {
      continue
    }
    const offer = parsePairingCode(host.orca_endpoint)
    if (!offer) {
      continue
    }
    const existing = findEnvironmentWithHostKey(
      await listEnvironments(deps.userDataPath),
      offer.publicKeyB64
    )
    const name = host.name ?? host.member_id
    try {
      if (!existing) {
        const environment = await saveHost(deps, name, host, host.orca_endpoint)
        try {
          deps.holdDisconnected(environment.id)
          managed.add(environment.id)
          writeManagedIds(deps.userDataPath, managed)
        } catch (error) {
          // Roll back an import that could not be recorded as managed.
          managed.delete(environment.id)
          await removeEnvironment(deps.userDataPath, environment.id)
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
      await updateEnvironmentFromPairingCode(deps.userDataPath, existing.id, {
        pairingCode: host.orca_endpoint,
        expectedPairingRevision: existing.pairingRevision ?? existing.createdAt
      })
      await deps.invalidateTransport(existing.id)
      result.updated += 1
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
    return await addEnvironmentFromPairingCode(deps.userDataPath, { name, pairingCode, reconnectOnLaunch: false })
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
