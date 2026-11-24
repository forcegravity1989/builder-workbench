import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  parseRemoteRuntimeCallerIdentity,
  setRemoteRuntimeCallerIdentity,
  type RemoteRuntimeCallerIdentity
} from '../../../shared/remote-runtime-caller-identity'
import type { TeamDirectoryMember } from '../../../shared/team-directory'

const IDENTITY_FILE = 'workbench-team-identity.json'

/** Restores the member identity saved by the last team directory read, before any host connects. */
export function loadTeamIdentity(userDataPath: string): void {
  try {
    const parsed = JSON.parse(readFileSync(join(userDataPath, IDENTITY_FILE), 'utf8')) as unknown
    setRemoteRuntimeCallerIdentity(parseRemoteRuntimeCallerIdentity(parsed))
  } catch {
    // No saved identity yet; connections stay anonymous until the directory is read.
  }
}

/**
 * Names this machine's member on every host connection, so hosts record who connected instead of
 * the owner of the shared link.
 */
export function rememberTeamIdentity(
  userDataPath: string,
  members: readonly TeamDirectoryMember[],
  currentMemberId: string | null
): void {
  if (!currentMemberId) {
    return
  }
  const member = members.find(
    (candidate) => candidate.member_id.toLowerCase() === currentMemberId.toLowerCase()
  )
  const identity: RemoteRuntimeCallerIdentity | null = parseRemoteRuntimeCallerIdentity({
    memberId: member?.member_id ?? currentMemberId,
    name: member?.name ?? currentMemberId,
    avatar: member?.avatar
  })
  if (!identity) {
    return
  }
  setRemoteRuntimeCallerIdentity(identity)
  try {
    writeFileSync(join(userDataPath, IDENTITY_FILE), JSON.stringify(identity))
  } catch {
    // The in-memory identity is already set; failing to persist only delays it after a restart.
  }
}
