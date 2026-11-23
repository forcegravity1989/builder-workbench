import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createFolder,
  downloadOneboxFile,
  listFolder,
  parseFirstJsonObject,
  removeReportFile,
  runWelinkCli,
  type WelinkRoute,
  uploadOneboxFile
} from '../reporting/welink-onebox-client'
import type { TeamDirectory, TeamDirectoryMember } from '../../../shared/team-directory'
export type { TeamDirectory } from '../../../shared/team-directory'

export type TeamDirectoryReadResult = {
  directory: TeamDirectory
  fileId: string | null
  currentMemberId: string | null
}

async function queryGroupMembers(
  route: WelinkRoute,
  groupId: string
): Promise<TeamDirectoryMember[]> {
  const { stdout } = await runWelinkCli(
    route,
    ['im', 'query-group-member', '--group-id', groupId],
    30_000
  )
  const parsed = parseJsonPayload(stdout)
  if (!parsed) {
    throw new Error('query-group-member returned no JSON payload')
  }
  const rows = Array.isArray(parsed)
    ? parsed
    : parsed &&
        typeof parsed === 'object' &&
        Array.isArray((parsed as { members?: unknown }).members)
      ? (parsed as { members: unknown[] }).members
      : parsed &&
          typeof parsed === 'object' &&
          Array.isArray((parsed as { respData?: unknown }).respData)
        ? (parsed as { respData: unknown[] }).respData
        : null
  if (!rows) {
    throw new Error('query-group-member returned an invalid members payload')
  }
  return rows.flatMap((row) => {
    if (!row || typeof row !== 'object') {
      return []
    }
    const value = row as Record<string, unknown>
    const memberId = value.memberAccount ?? value.welinkId ?? value.member_id
    const memberType = value.memberType
    if (
      typeof memberId !== 'string' ||
      ['TYPE_AGENT_ASSISTANT', 'TYPE_ASSISTANT'].includes(String(memberType))
    ) {
      return []
    }
    return [
      {
        member_id: memberId,
        ...(typeof value.name === 'string' ? { name: value.name } : {}),
        ...(typeof value.avatar === 'string' ? { avatar: value.avatar } : {}),
        ...(typeof memberType === 'string' ? { member_type: memberType } : {}),
        identity_source: 'welink-cli' as const
      }
    ]
  })
}

const CONTACT_DETAIL_BATCH = 30

type MemberProfile = { name?: string; avatar?: string }

function parseContactProfiles(stdout: string): Map<string, MemberProfile> {
  const profiles = new Map<string, MemberProfile>()
  const parsed = parseJsonPayload(stdout)
  const users = parsed && typeof parsed === 'object' ? (parsed as { users?: unknown }).users : null
  if (!Array.isArray(users)) {
    return profiles
  }
  for (const user of users) {
    if (!user || typeof user !== 'object') {
      continue
    }
    const value = user as Record<string, unknown>
    const account = value.personAccount ?? value.w3Account
    if (typeof account !== 'string' || !account) {
      continue
    }
    const avatar = (value.avatar as { custom?: unknown } | undefined)?.custom
    profiles.set(account.toLowerCase(), {
      ...(typeof value.chineseName === 'string' && value.chineseName
        ? { name: value.chineseName }
        : {}),
      ...(typeof avatar === 'string' && avatar ? { avatar: toDirectAvatarUrl(avatar) } : {})
    })
  }
  return profiles
}

// The wecontact avatar URL only redirects to the w3 face service, and the renderer's image loader
// does not follow that redirect, so point at the final service directly.
function toDirectAvatarUrl(url: string): string {
  const match = /\/avatar\/(\d+)\/(\d+)/.exec(url)
  return match
    ? `http://w3.huawei.com/w3lab/rest/yellowpage/face/${match[1]}/${match[2]}?from=WE&method=getStream`
    : url
}

const PROFILE_CACHE_TTL_MS = 10 * 60_000
const profileCache = new Map<string, { profile: MemberProfile; expiresAt: number }>()

async function withMemberProfiles(
  route: WelinkRoute,
  members: TeamDirectoryMember[]
): Promise<TeamDirectoryMember[]> {
  const now = Date.now()
  const missing = members
    .map((member) => member.member_id)
    .filter((account) => (profileCache.get(account.toLowerCase())?.expiresAt ?? 0) <= now)
  for (let index = 0; index < missing.length; index += CONTACT_DETAIL_BATCH) {
    const accounts = missing.slice(index, index + CONTACT_DETAIL_BATCH)
    try {
      const { stdout } = await runWelinkCli(route, ['contact', 'detail', ...accounts], 30_000)
      for (const [account, profile] of parseContactProfiles(stdout)) {
        profileCache.set(account, { profile, expiresAt: now + PROFILE_CACHE_TTL_MS })
      }
    } catch {
      // Names and avatars are display-only; membership must still load without them.
    }
  }
  return members.map((member) => ({
    ...member,
    ...profileCache.get(member.member_id.toLowerCase())?.profile
  }))
}

function parseJsonPayload(stdout: string): unknown {
  try {
    return JSON.parse(stdout) as unknown
  } catch {
    const object = parseFirstJsonObject(stdout)
    if (object) {
      return object
    }
    const start = stdout.indexOf('[')
    const end = stdout.lastIndexOf(']')
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(stdout.slice(start, end + 1)) as unknown
      } catch {
        return null
      }
    }
    return null
  }
}

function findCurrentMemberId(value: unknown): string | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  for (const [key, candidate] of Object.entries(value as Record<string, unknown>)) {
    if (
      ['uid', 'userId', 'user_id', 'memberAccount', 'account'].includes(key) &&
      typeof candidate === 'string' &&
      candidate.trim()
    ) {
      return candidate.trim()
    }
    const nested = findCurrentMemberId(candidate)
    if (nested) {
      return nested
    }
  }
  return null
}

async function queryCurrentMemberId(route: WelinkRoute): Promise<string | null> {
  try {
    const { stdout, stderr } = await runWelinkCli(route, ['auth', 'status'], 30_000)
    const parsed = findCurrentMemberId(parseJsonPayload(stdout))
    if (parsed) {
      return parsed
    }
    const output = `${stdout}\n${stderr}`
    const match = output.match(/(?:UID|User\s*ID|账号|用户\s*ID)\s*[:：]\s*([A-Za-z0-9._-]+)/i)
    return match?.[1] ?? null
  } catch {
    return null
  }
}

function parseDirectory(text: string, groupId: string, spaceId: string): TeamDirectory {
  const parsed = JSON.parse(text) as Partial<TeamDirectory>
  return {
    schema_version: 1,
    team_group_id: groupId,
    team_space_id: spaceId,
    identity_source: 'welink-cli',
    hosts: normalizeMembers(parsed.hosts),
    projects: normalizeProjects(parsed.projects)
  }
}

function normalizeMembers(value: unknown): TeamDirectoryMember[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== 'object') {
      return []
    }
    const member = candidate as Record<string, unknown>
    if (typeof member.member_id !== 'string' || member.member_id.length === 0) {
      return []
    }
    return [
      {
        member_id: member.member_id,
        ...(typeof member.name === 'string' ? { name: member.name } : {}),
        ...(typeof member.avatar === 'string' ? { avatar: member.avatar } : {}),
        ...(typeof member.member_type === 'string' ? { member_type: member.member_type } : {}),
        ...(typeof member.host_id === 'string' ? { host_id: member.host_id } : {}),
        identity_source: 'welink-cli' as const,
        ...(typeof member.orca_endpoint === 'string' ? { orca_endpoint: member.orca_endpoint } : {})
      }
    ]
  })
}

function normalizeProjects(value: unknown): TeamDirectory['projects'] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== 'object') {
      return []
    }
    const project = candidate as Record<string, unknown>
    if (typeof project.repo_id !== 'string') {
      return []
    }
    return [
      {
        repo_id: project.repo_id,
        ...(typeof project.name === 'string' ? { name: project.name } : {}),
        ...(typeof project.repository === 'string' ? { repository: project.repository } : {})
      }
    ]
  })
}

async function resolveTeamFolder(route: WelinkRoute, spaceId: string): Promise<string> {
  const listing = await listFolder(route, spaceId, '0', hasTeamFolder)
  const existing = listing.folders.find((folder) => folder.name === 'BW')
  return existing?.id ?? createFolder(route, spaceId, '0', 'BW')
}

function hasTeamFolder(found: { folders: { name: string }[] }): boolean {
  return found.folders.some((folder) => folder.name === 'BW')
}

function hasTeamFile(found: { files: { name: string }[] }): boolean {
  return found.files.some((file) => file.name === 'team.json')
}

async function findTeamDirectoryFile(
  route: WelinkRoute,
  spaceId: string
): Promise<{ id: string; name: string } | null> {
  const root = await listFolder(route, spaceId, '0', hasTeamFolder)
  const folder = root.folders.find((entry) => entry.name === 'BW')
  if (!folder) {
    return null
  }
  return (
    (await listFolder(route, spaceId, folder.id, hasTeamFile)).files.find(
      (entry) => entry.name === 'team.json'
    ) ?? null
  )
}

export async function readTeamDirectory(args: {
  route: WelinkRoute
  groupId: string
  spaceId: string
}): Promise<TeamDirectoryReadResult> {
  const [members, currentMemberId, saved] = await Promise.all([
    queryGroupMembers(args.route, args.groupId).then((rows) =>
      withMemberProfiles(args.route, rows)
    ),
    queryCurrentMemberId(args.route),
    readSavedDirectory(args.route, args.groupId, args.spaceId)
  ])
  if (!saved) {
    return {
      directory: {
        schema_version: 1,
        team_group_id: args.groupId,
        team_space_id: args.spaceId,
        identity_source: 'welink-cli',
        hosts: members,
        projects: []
      },
      fileId: null,
      currentMemberId
    }
  }
  saved.directory.hosts = mergeMembers(members, saved.directory.hosts)
  return { directory: saved.directory, fileId: saved.fileId, currentMemberId }
}

// OneBox throttles back-to-back calls and answers with a multi-second retry wait, so a read that
// already located team.json goes straight to the download for a few minutes.
const TEAM_FILE_CACHE_TTL_MS = 5 * 60_000
const teamFileCache = new Map<string, { fileId: string; expiresAt: number }>()

async function readSavedDirectory(
  route: WelinkRoute,
  groupId: string,
  spaceId: string
): Promise<{ directory: TeamDirectory; fileId: string } | null> {
  const cached = teamFileCache.get(spaceId)
  if (cached && cached.expiresAt > Date.now()) {
    try {
      return await downloadDirectory(route, groupId, spaceId, cached.fileId)
    } catch {
      teamFileCache.delete(spaceId)
    }
  }
  const node = await findTeamDirectoryFile(route, spaceId)
  if (!node) {
    teamFileCache.delete(spaceId)
    return null
  }
  const saved = await downloadDirectory(route, groupId, spaceId, node.id)
  teamFileCache.set(spaceId, { fileId: node.id, expiresAt: Date.now() + TEAM_FILE_CACHE_TTL_MS })
  return saved
}

async function downloadDirectory(
  route: WelinkRoute,
  groupId: string,
  spaceId: string,
  fileId: string
): Promise<{ directory: TeamDirectory; fileId: string }> {
  const node = { id: fileId }
  const root = await mkdtemp(join(tmpdir(), 'bw-team-directory-'))
  try {
    await downloadOneboxFile(route, spaceId, node.id, root)
    const candidates = ['team.json', join(root, 'team.json')]
    for (const candidate of candidates) {
      try {
        const directory = parseDirectory(await readFile(candidate, 'utf8'), groupId, spaceId)
        return { directory, fileId: node.id }
      } catch {
        // The CLI may create a directory named after the file id; inspect below.
      }
    }
    const files = await readdir(root)
    for (const file of files) {
      if (file.endsWith('.json')) {
        const directory = parseDirectory(await readFile(join(root, file), 'utf8'), groupId, spaceId)
        return { directory, fileId: node.id }
      }
    }
    throw new Error('team.json download did not produce a JSON file')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

function mergeMembers(
  current: TeamDirectoryMember[],
  saved: TeamDirectoryMember[]
): TeamDirectoryMember[] {
  const savedById = new Map(saved.map((member) => [member.member_id, member]))
  return current.map((member) => ({ ...savedById.get(member.member_id), ...member }))
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
    const previous = await findTeamDirectoryFile(args.route, args.directory.team_space_id)
    const fileId = await uploadOneboxFile(args.route, args.directory.team_space_id, folderId, path)
    teamFileCache.delete(args.directory.team_space_id)
    if (previous && previous.id !== fileId) {
      await removeReportFile(args.route, args.directory.team_space_id, previous.id)
    }
    teamFileCache.set(args.directory.team_space_id, {
      fileId,
      expiresAt: Date.now() + TEAM_FILE_CACHE_TTL_MS
    })
    return { fileId }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}
