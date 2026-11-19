import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createFolder,
  downloadOneboxFile,
  findOneboxFile,
  listFolder,
  runWelinkCli,
  type WelinkRoute,
  uploadOneboxFile
} from '../reporting/welink-onebox-client'
import type { TeamDirectory, TeamDirectoryMember } from '../../../shared/team-directory'
export type { TeamDirectory } from '../../../shared/team-directory'

export type TeamDirectoryReadResult = {
  directory: TeamDirectory
  fileId: string | null
}

async function queryGroupMembers(route: WelinkRoute, groupId: string): Promise<TeamDirectoryMember[]> {
  const { stdout } = await runWelinkCli(route, ['im', 'query-group-member', '--group-id', groupId], 30_000)
  const parsed = JSON.parse(stdout) as unknown
  const rows = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { members?: unknown }).members)
      ? (parsed as { members: unknown[] }).members
      : []
  return rows.flatMap((row) => {
    if (!row || typeof row !== 'object') return []
    const value = row as Record<string, unknown>
    const memberId = value.memberAccount ?? value.welinkId ?? value.member_id
    const memberType = value.memberType
    if (typeof memberId !== 'string' || ['TYPE_AGENT_ASSISTANT', 'TYPE_ASSISTANT'].includes(String(memberType))) {
      return []
    }
    return [{
      member_id: memberId,
      name: typeof value.name === 'string' ? value.name : memberId,
      avatar: typeof value.avatar === 'string' ? value.avatar : undefined,
      identity_source: 'welink-cli' as const
    }]
  })
}

function parseDirectory(text: string, groupId: string, spaceId: string): TeamDirectory {
  const parsed = JSON.parse(text) as Partial<TeamDirectory>
  return {
    schema_version: 1,
    team_group_id: groupId,
    team_space_id: spaceId,
    identity_source: 'welink-cli',
    hosts: Array.isArray(parsed.hosts) ? parsed.hosts : [],
    projects: Array.isArray(parsed.projects) ? parsed.projects : []
  }
}

async function resolveTeamFolder(route: WelinkRoute, spaceId: string): Promise<string> {
  const listing = await listFolder(route, spaceId, '0')
  const existing = listing.folders.find((folder) => folder.name === 'BW')
  return existing?.id ?? createFolder(route, spaceId, '0', 'BW')
}

export async function readTeamDirectory(args: {
  route: WelinkRoute
  groupId: string
  spaceId: string
}): Promise<TeamDirectoryReadResult> {
  const members = await queryGroupMembers(args.route, args.groupId)
  const node = await findOneboxFile(args.route, args.spaceId, 'team.json')
  if (!node) {
    return {
      directory: {
        schema_version: 1,
        team_group_id: args.groupId,
        team_space_id: args.spaceId,
        identity_source: 'welink-cli',
        hosts: members,
        projects: []
      },
      fileId: null
    }
  }
  const root = await mkdtemp(join(tmpdir(), 'bw-team-directory-'))
  try {
    await downloadOneboxFile(args.route, args.spaceId, node.id, root)
    const candidates = ['team.json', join(root, 'team.json')]
    for (const candidate of candidates) {
      try {
        const directory = parseDirectory(await readFile(candidate, 'utf8'), args.groupId, args.spaceId)
        directory.hosts = mergeMembers(members, directory.hosts)
        return { directory, fileId: node.id }
      } catch {
        // The CLI may create a directory named after the file id; inspect below.
      }
    }
    const files = await import('node:fs/promises').then(({ readdir }) => readdir(root))
    for (const file of files) {
      if (file.endsWith('.json')) {
        const directory = parseDirectory(await readFile(join(root, file), 'utf8'), args.groupId, args.spaceId)
        directory.hosts = mergeMembers(members, directory.hosts)
        return { directory, fileId: node.id }
      }
    }
    throw new Error('team.json download did not produce a JSON file')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

function mergeMembers(current: TeamDirectoryMember[], saved: TeamDirectoryMember[]): TeamDirectoryMember[] {
  const savedById = new Map(saved.map((member) => [member.member_id, member]))
  return current.map((member) => ({ ...member, ...savedById.get(member.member_id) }))
}

export async function writeTeamDirectory(args: {
  route: WelinkRoute
  directory: TeamDirectory
}): Promise<{ fileId: string }> {
  const root = await mkdtemp(join(tmpdir(), 'bw-team-directory-write-'))
  const path = join(root, 'team.json')
  try {
    await writeFile(path, `${JSON.stringify(args.directory, null, 2)}\n`, 'utf8')
    const folderId = await resolveTeamFolder(args.route, args.directory.team_space_id)
    return { fileId: await uploadOneboxFile(args.route, args.directory.team_space_id, folderId, path) }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}
