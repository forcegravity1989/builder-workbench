import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parsePairingCode } from '../../../shared/pairing'
import { findEnvironmentWithHostKey } from '../../../shared/runtime-environment-host-key-match'
import {
  addOrUpdateEnvironmentFromPairingCode,
  listEnvironments,
  setEnvironmentReconnectOnLaunch
} from '../../../shared/runtime-environment-store'
import type { TeamDirectoryMember } from '../../../shared/team-directory'

export type TeamHostSyncResult = { added: number; updated: number }

export type TeamHostSyncDeps = {
  userDataPath: string
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
  } catch {
    return new Set()
  }
}

function writeManagedIds(userDataPath: string, ids: Set<string>): void {
  writeFileSync(join(userDataPath, MANAGED_FILE), JSON.stringify({ environmentIds: [...ids] }))
}

function isNameTaken(error: unknown): boolean {
  return error instanceof Error && /already exists/i.test(error.message)
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
        setEnvironmentReconnectOnLaunch(deps.userDataPath, environment.id, false)
        deps.holdDisconnected(environment.id)
        managed.add(environment.id)
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
  if (result.added > 0) {
    writeManagedIds(deps.userDataPath, managed)
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
