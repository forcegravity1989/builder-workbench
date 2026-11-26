import { app, ipcMain } from 'electron'
import { resolveWelinkRoute } from '../workbench/reporting/report-submission'
import {
  readTeamDirectory,
  writeTeamDirectory,
  type TeamDirectory
} from '../workbench/team-collaboration/team-directory-client'
import { syncTeamHosts } from '../workbench/team-collaboration/team-host-sync'
import {
  loadTeamIdentity,
  rememberTeamIdentity
} from '../workbench/team-collaboration/team-identity'
import { markRuntimeEnvironmentManuallyDisconnected } from './runtime-environment-manual-disconnect'
import { invalidateRuntimeEnvironmentTransport } from './runtime-environments'

const NUMERIC_ID = /^\d{1,32}$/
const TEXT_ID = /^.{1,256}$/u

function requireId(value: unknown, name: string): string {
  if (typeof value !== 'string' || !NUMERIC_ID.test(value)) {
    throw new Error(`${name} must be a numeric WeLink ID.`)
  }
  return value
}

function requireText(value: unknown, name: string, maxLength = 4096): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength) {
    throw new Error(`${name} must be a non-empty string.`)
  }
  return value
}

function requireDirectory(value: unknown): TeamDirectory {
  if (!value || typeof value !== 'object') {
    throw new Error('directory must be an object.')
  }
  const input = value as Partial<TeamDirectory>
  const teamGroupId = requireId(input.team_group_id, 'team_group_id')
  const teamSpaceId = requireId(input.team_space_id, 'team_space_id')
  if (input.schema_version !== 1 || input.identity_source !== 'welink-cli') {
    throw new Error('directory has an unsupported schema.')
  }
  if (!Array.isArray(input.hosts) || !Array.isArray(input.projects)) {
    throw new Error('directory hosts and projects must be arrays.')
  }
  const hosts = input.hosts.map((host, index) => {
    if (!host || typeof host !== 'object' || !TEXT_ID.test(host.member_id)) {
      throw new Error(`hosts[${index}].member_id is invalid.`)
    }
    return {
      member_id: host.member_id,
      ...(host.name ? { name: requireText(host.name, `hosts[${index}].name`, 256) } : {}),
      ...(host.avatar ? { avatar: requireText(host.avatar, `hosts[${index}].avatar`) } : {}),
      ...(host.member_type
        ? { member_type: requireText(host.member_type, `hosts[${index}].member_type`, 128) }
        : {}),
      ...(host.host_id
        ? { host_id: requireText(host.host_id, `hosts[${index}].host_id`, 256) }
        : {}),
      identity_source: 'welink-cli' as const,
      ...(host.orca_endpoint
        ? { orca_endpoint: requireText(host.orca_endpoint, `hosts[${index}].orca_endpoint`) }
        : {})
    }
  })
  const projects = input.projects.map((project, index) => {
    if (!project || typeof project !== 'object') {
      throw new Error(`projects[${index}] is invalid.`)
    }
    return {
      repo_id: requireText(project.repo_id, `projects[${index}].repo_id`, 512),
      ...(project.name ? { name: requireText(project.name, `projects[${index}].name`, 256) } : {}),
      ...(project.repository
        ? { repository: requireText(project.repository, `projects[${index}].repository`, 512) }
        : {})
    }
  })
  return {
    schema_version: 1,
    team_group_id: teamGroupId,
    team_space_id: teamSpaceId,
    identity_source: 'welink-cli',
    hosts,
    projects
  }
}

export function registerTeamCollaborationHandlers(): void {
  const userDataPath = app.getPath('userData')
  loadTeamIdentity(userDataPath)
  let activeBinding: { groupId: string; spaceId: string } | undefined
  ipcMain.handle(
    'teamCollaboration:readDirectory',
    async (_event, args: { groupId: string; spaceId: string; switching?: boolean }) => {
      const groupId = requireId(args?.groupId, 'groupId')
      const spaceId = requireId(args?.spaceId, 'spaceId')
      const switching = args.switching === true
      const previousBinding = activeBinding
      const result = await readTeamDirectory({
        route: await resolveWelinkRoute(),
        groupId,
        spaceId
      })
      if (activeBinding !== previousBinding) {
        throw new Error('The team binding changed while reading the directory.')
      }
      if (
        switching &&
        !result.directory.hosts.some((host) => host.member_id === result.currentMemberId)
      ) {
        throw new Error('The signed-in WeLink account could not be matched to a team member.')
      }
      // Invalidate reads started before a successful change of binding.
      if (
        switching ||
        previousBinding?.groupId !== groupId ||
        previousBinding.spaceId !== spaceId
      ) {
        activeBinding = { groupId, spaceId }
      }
      rememberTeamIdentity(userDataPath, result.directory.hosts, result.currentMemberId)
      return result
    }
  )

  ipcMain.handle(
    'teamCollaboration:syncHosts',
    async (_event, args: { groupId: string; spaceId: string }) => {
      const groupId = requireId(args?.groupId, 'groupId')
      const spaceId = requireId(args?.spaceId, 'spaceId')
      const previousBinding = activeBinding
      if (
        previousBinding &&
        (previousBinding.groupId !== groupId || previousBinding.spaceId !== spaceId)
      ) {
        return { added: 0, updated: 0 }
      }
      const { directory, currentMemberId } = await readTeamDirectory({
        route: await resolveWelinkRoute(),
        groupId,
        spaceId
      })
      if (activeBinding !== previousBinding) {
        return { added: 0, updated: 0 }
      }
      rememberTeamIdentity(userDataPath, directory.hosts, currentMemberId)
      return syncTeamHosts(directory.hosts, currentMemberId, {
        userDataPath,
        isCurrentBinding: () => activeBinding === previousBinding,
        holdDisconnected: markRuntimeEnvironmentManuallyDisconnected,
        invalidateTransport: invalidateRuntimeEnvironmentTransport
      })
    }
  )

  ipcMain.handle(
    'teamCollaboration:writeDirectory',
    async (_event, directory: TeamDirectory, baseFileId?: string | null) => {
      const safeDirectory = requireDirectory(directory)
      return writeTeamDirectory({
        route: await resolveWelinkRoute(),
        directory: safeDirectory,
        ...(typeof baseFileId === 'string' || baseFileId === null ? { baseFileId } : {})
      })
    }
  )
}
